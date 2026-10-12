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

/* Valide explicitement les écritures en attente.
   Chaque db_exec ouvre sa propre transaction implicite ; sans ce point de
   validation, le journal reste ouvert et la sauvegarde qui suit (backup())
   échoue sur une base verrouillée. Marque aussi le moment où les données sont
   réellement sur le disque. */
#[tauri::command]
fn db_checkpoint(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())
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

/* Copie cohérente de la base ouverte vers un fichier, via la fonction backup()
   de SQLite (et non une simple lecture, qui pourrait capturer un état partiel). */
fn write_consistent_copy(conn: &Connection, dst: &PathBuf) -> Result<(), String> {
    let _ = fs::remove_file(dst);
    conn.backup(DatabaseName::Main, dst, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn db_bytes(state: State<DbState>) -> Result<Vec<u8>, String> {
    let conn = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    let tmp = state.path.with_extension("export.tmp");
    write_consistent_copy(&conn, &tmp)?;
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

/* ---------- sauvegardes automatiques (snapshots horodatés) ----------
   Une copie de la base est prise à chaque écriture. Les 50 plus récentes sont
   conservées ; au-delà, les plus anciennes sont supprimées. Elles vivent dans
   un sous-dossier « backups » à côté de la base, et survivent donc à un
   effacement des données. */

const MAX_SNAPSHOTS: usize = 50;

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = db_path(app)?.with_file_name("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/* Nom d'un snapshot : horodatage trié lexicographiquement (heure locale).
   Les centièmes de seconde distinguent deux écritures rapprochées, qui
   partageraient sinon le même nom et s'écraseraient. */
fn snapshot_name() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let secs = (now / 1000) as i64;
    let centis = ((now % 1000) / 10) as u32;
    let days = secs / 86400;
    let rem = secs % 86400;
    // conversion jours -> date (algorithme civil_from_days, sans dépendance)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}h{:02}m{:02}s{:02}.db",
        y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60, centis
    )
}

/* Renomme la sauvegarde la plus récente pour qu'elle reflète l'instant présent.
   Utilisé quand la fenêtre de regroupement est écoulée et que l'on préfère
   remplacer plutôt qu'accumuler : voir snapshot_create. */
fn newest_snapshot(dir: &PathBuf) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "db").unwrap_or(false))
        .collect();
    files.sort();
    files.pop()
}

#[tauri::command]
fn snapshot_create(app: AppHandle, window_secs: Option<u64>) -> Result<Option<String>, String> {
    let dir = backups_dir(&app)?;
    let fenetre = window_secs.unwrap_or(0);

    /* Regroupement : si la dernière sauvegarde date de moins de `fenetre`
       secondes, on la remplace (nouveau nom, contenu à jour) au lieu d'en
       ajouter une. Une rafale de modifications ne laisse donc qu'une copie. */
    if fenetre > 0 {
        if let Some(derniere) = newest_snapshot(&dir) {
            if let Ok(meta) = derniere.metadata() {
                if let Ok(modifie) = meta.modified() {
                    let age = std::time::SystemTime::now()
                        .duration_since(modifie)
                        .map(|d| d.as_secs())
                        .unwrap_or(u64::MAX);
                    if age < fenetre {
                        let _ = fs::remove_file(&derniere);
                    }
                }
            }
        }
    }

    let conn = app.state::<DbState>();
    let conn = conn.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    let name = snapshot_name();
    let dst = dir.join(&name);
    /* La base peut être verrouillée par une écriture en cours : on valide puis
       on réessaie une fois avant d'abandonner. */
    if let Err(e) = write_consistent_copy(&conn, &dst) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        write_consistent_copy(&conn, &dst)
            .map_err(|e2| format!("{e} (nouvelle tentative : {e2})"))?;
    }

    /* rotation : ne garder que les MAX_SNAPSHOTS plus récents */
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "db").unwrap_or(false))
        .collect();
    files.sort();
    if files.len() > MAX_SNAPSHOTS {
        for old in &files[..files.len() - MAX_SNAPSHOTS] {
            let _ = fs::remove_file(old);
        }
    }
    Ok(Some(name))
}

#[tauri::command]
fn snapshot_list(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = backups_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let e = match entry { Ok(e) => e, Err(_) => continue };
        let p = e.path();
        if p.extension().map(|x| x != "db").unwrap_or(true) {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        let size = e.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(serde_json::json!({ "name": name, "size": size }));
    }
    // plus récent en premier
    out.sort_by(|a, b| {
        let an = a["name"].as_str().unwrap_or("");
        let bn = b["name"].as_str().unwrap_or("");
        bn.cmp(an)
    });
    Ok(out)
}

#[tauri::command]
fn snapshot_restore(app: AppHandle, name: String) -> Result<(), String> {
    // Le nom vient du client : on refuse tout chemin pour rester dans le dossier.
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("nom invalide".into());
    }
    let src = backups_dir(&app)?.join(&name);
    if !src.exists() {
        return Err("sauvegarde introuvable".into());
    }
    let bytes = fs::read(&src).map_err(|e| e.to_string())?;
    if bytes.len() < 16 || &bytes[0..15] != b"SQLite format 3" {
        return Err("fichier de sauvegarde invalide".into());
    }
    let state = app.state::<DbState>();
    let mut guard = state.conn.lock().map_err(|_| "mutex poisoned".to_string())?;
    fs::write(&state.path, &bytes).map_err(|e| e.to_string())?;
    *guard = open_conn(&state.path)?;
    Ok(())
}

#[tauri::command]
fn snapshot_delete(app: AppHandle, name: String) -> Result<(), String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("nom invalide".into());
    }
    let p = backups_dir(&app)?.join(&name);
    fs::remove_file(&p).map_err(|e| e.to_string())
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
            write_file_bytes,
            snapshot_create,
            snapshot_list,
            snapshot_restore,
            snapshot_delete,
            db_checkpoint
        ])
        .run(tauri::generate_context!())
        .expect("erreur pendant l'exécution de KlarStock");
}
