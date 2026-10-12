//! KlarStock — noyau Tauri (Rust)
//! Persistance : rusqlite (SQLite bundled, 100 % hors ligne) + config JSON.
//! Les commandes invoke() correspondent à js/core/sqlite-tauri.js et js/core/storage.js.

use rusqlite::{types::ValueRef, Connection, DatabaseName};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

struct DbState {
    conn: Mutex<Connection>,
    path: PathBuf,
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("klarstock.db"))
}

/* ---------- ouverture / migration du schéma (identique au mode web) ---------- */

fn open_conn(path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS settings(
           id INTEGER PRIMARY KEY CHECK (id = 1),
           shop_name TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'FCFA',
           decimals INTEGER NOT NULL DEFAULT 0, default_threshold INTEGER NOT NULL DEFAULT 5,
           tax_rate REAL NOT NULL DEFAULT 0, address TEXT NOT NULL DEFAULT '',
           phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '');
         CREATE TABLE IF NOT EXISTS products(
           id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
           unit TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL DEFAULT '',
           cost REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
           stock REAL NOT NULL DEFAULT 0, threshold REAL);
         CREATE TABLE IF NOT EXISTS movements(
           id TEXT PRIMARY KEY, type TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
           qty REAL NOT NULL, unit_price REAL NOT NULL DEFAULT 0, date TEXT NOT NULL,
           sale_id TEXT, note TEXT NOT NULL DEFAULT '');
         CREATE TABLE IF NOT EXISTS invoices(
           id TEXT PRIMARY KEY, number TEXT NOT NULL, date TEXT NOT NULL,
           customer TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'sent',
           sale_id TEXT, note TEXT NOT NULL DEFAULT '');
         CREATE TABLE IF NOT EXISTS invoice_lines(
           id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
           product_id TEXT, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '',
           qty REAL NOT NULL, price REAL NOT NULL);
         CREATE INDEX IF NOT EXISTS idx_mv_product ON movements(product_id);
         CREATE INDEX IF NOT EXISTS idx_mv_date ON movements(date DESC);
         CREATE INDEX IF NOT EXISTS idx_inv_date ON invoices(date DESC);
         CREATE INDEX IF NOT EXISTS idx_line_invoice ON invoice_lines(invoice_id);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

/* ---------- commandes SQLite ---------- */

#[tauri::command]
fn db_query(state: State<DbState>, sql: String, params: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    // Le JS envoie des tableaux de paramètres simples (null/string/number/bool).
    let bound: Vec<rusqlite::types::Value> = params.into_iter().map(to_value).collect();
    let conn = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let cols: Vec<String> = (0..stmt.column_count())
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();
    let mut rows = Vec::new();
    let mut mapped = stmt.query(rusqlite::params_from_iter(bound.iter())).map_err(|e| e.to_string())?;
    while let Some(row) = mapped.next().map_err(|e| e.to_string())? {
        // Chaque ligne est un objet { colonne: valeur } : c'est la forme que
        // consomme readFullDb() côté JS (srow.shop_name, r.id, …).
        let mut obj = serde_json::Map::with_capacity(cols.len());
        for (i, name) in cols.iter().enumerate() {
            let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                ValueRef::Null => serde_json::Value::Null,
                ValueRef::Integer(n) => serde_json::Value::from(n),
                ValueRef::Real(f) => serde_json::Value::from(f),
                ValueRef::Text(s) => serde_json::Value::from(String::from_utf8_lossy(s).to_string()),
                ValueRef::Blob(_) => serde_json::Value::Null, // blobs non utilisés par le schéma
            };
            obj.insert(name.clone(), v);
        }
        rows.push(serde_json::Value::Object(obj));
    }
    Ok(serde_json::Value::Array(rows))
}

#[tauri::command]
fn db_exec(state: State<DbState>, sql: String, params: Vec<serde_json::Value>) -> Result<(), String> {
    let bound: Vec<rusqlite::types::Value> = params.into_iter().map(to_value).collect();
    let conn = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    /* Deux cas distincts, à ne pas confondre :
       - avec paramètres : une seule instruction, les valeurs doivent être liées
         (execute_batch n'exécute pas de liaison) ;
       - sans paramètre : script complet possible (schéma, suppressions en série). */
    let res = if bound.is_empty() {
        conn.execute_batch(&sql).map_err(|e| e.to_string())
    } else {
        conn.execute(&sql, rusqlite::params_from_iter(bound.iter()))
            .map(|_| ())
            .map_err(|e| e.to_string())
    };
    res
}

fn to_value(j: serde_json::Value) -> rusqlite::types::Value {
    use serde_json::Value as J;
    match j {
        J::Null => rusqlite::types::Value::Null,
        J::Bool(b) => rusqlite::types::Value::Integer(b as i64),
        J::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else {
                rusqlite::types::Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        J::String(s) => rusqlite::types::Value::Text(s),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

#[tauri::command]
fn db_bytes(state: State<DbState>) -> Result<Vec<u8>, String> {
    // Sauvegarde cohérente via la fonction backup() de SQLite (pas un simple read).
    let conn = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    let tmp = state.path.with_extension("export.tmp");
    // backup() ouvre lui-même la destination ; il faut repartir d'un fichier propre.
    let _ = fs::remove_file(&tmp);
    conn.backup(DatabaseName::Main, &tmp, None)
        .map_err(|e| e.to_string())?;
    let bytes = fs::read(&tmp).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&tmp);
    Ok(bytes)
}

#[tauri::command]
fn db_import(state: State<DbState>, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.len() < 16 || &bytes[0..15] != b"SQLite format 3" {
        return Err("invalid schema".into());
    }
    let mut guard = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    fs::write(&state.path, &bytes).map_err(|e| e.to_string())?;
    *guard = open_conn(&state.path)?;
    Ok(())
}

#[tauri::command]
fn db_size(state: State<DbState>) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    let pages: i64 = conn
        .query_row("PRAGMA page_count", [], |r| r.get(0))
        .unwrap_or(0);
    let page_size: i64 = conn
        .query_row("PRAGMA page_size", [], |r| r.get(0))
        .unwrap_or(0);
    Ok((pages * page_size) as u64)
}

/* ---------- config (langue, drapeaux) ---------- */

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(db_path(app)?.with_file_name("config.json"))
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<Option<String>, String> {
    let p = config_path(&app)?;
    if !p.exists() {
        return Ok(None);
    }
    fs::read_to_string(p).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(app: AppHandle, config: String) -> Result<(), String> {
    let p = config_path(&app)?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, config).map_err(|e| e.to_string())?;
    fs::rename(&tmp, p).map_err(|e| e.to_string())?; // écriture atomique
    Ok(())
}

/* ---------- export fichier (sauvegarde .db choisie par l'utilisateur) ---------- */

#[tauri::command]
fn write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(PathBuf::from(path), bytes).map_err(|e| e.to_string())
}

/* ---------- démarrage ---------- */

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = db_path(app.handle())?;
            let conn = open_conn(&path)?;
            app.manage(DbState {
                conn: Mutex::new(conn),
                path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_query,
            db_exec,
            db_bytes,
            db_import,
            db_size,
            load_config,
            save_config,
            write_file_bytes
        ])
        .run(tauri::generate_context!())
        .expect("erreur pendant l'exécution de KlarStock");
}
