/* ════════════════ SQLITE sous TAURI — pont vers rusqlite (Rust) ════════════════
   Ce fichier n'est chargé que si window.__TAURI__ existe (voir index.html).
   Il implémente la MÊME interface que js/core/sqlite.js (mode navigateur) :
     initSqlite(), dbLoad(), dbSave(data), dbReset(data), dbExportDb(),
     dbImportDb(file), dbStorageInfo(), saveLegacy(data), et les variables
     globales `SQL`, `sqliteDb` (référencées par actions.js / settings.js).

   Différence de conception assumée : sous Tauri, pas de WASM ni d'IndexedDB.
   La base klarstock.db vit dans le dossier de données applicatif
   (AppData / ~/.config / ~/Library) géré par Rust via rusqlite. Les requêtes
   SQL partent en texte + paramètres via invoke('db_query' | 'db_exec'). */

const TAURI_SCHEMA = 1;
const LS_MIGRATED = 'klarstock_migrated_v1';
let SQL = { isTauri: true };   /* marqueur : le moteur est côté Rust */
let sqliteDb = null;           /* faux handle : non-null = base ouverte */

async function tQuery(sql, params){
  return window.__TAURI__.core.invoke('db_query', { sql, params: params || [] });
}
async function tExec(sql, params){
  return window.__TAURI__.core.invoke('db_exec', { sql, params: params || [] });
}

/* ---------- schéma (identique à sqlite.js) ---------- */
const TAURI_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
  CREATE INDEX IF NOT EXISTS idx_line_invoice ON invoice_lines(invoice_id);`;

async function createSchema(){ await tExec(TAURI_SCHEMA_SQL, []); }
async function setMeta(k, v){
  await tExec('INSERT INTO meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value;', [k, String(v)]);
}
async function getMeta(k){
  const r = await tQuery('SELECT value FROM meta WHERE key=?1', [k]);
  return r.length ? String(r[0].value) : null;
}

/* ---------- migration depuis localStorage (version web antérieure) ---------- */
async function migrateFromWeb(){
  if(cfgGet(LS_MIGRATED) === '1') return false;
  let raw = null;
  try{ raw = localStorage.getItem(LS); }catch(_){}
  if(!raw) return false;
  let jdb = null;
  try{ jdb = JSON.parse(raw); }catch(_){ return false; }
  await writeFullDb(jdb);
  cfgSet(LS_MIGRATED, '1');
  if(typeof toast === 'function') toast(t('settings.migrationToast'), 'ok');
  return true;
}

/* ---------- ouverture / initialisation ---------- */
async function initSqlite(){
  await tExec('PRAGMA foreign_keys = ON;', []);
  const migratedNow = await migrateFromWeb();
  await createSchema();
  sqliteDb = { tauri: true };
  if(await getMeta('schema_version') === null){
    await setMeta('schema_version', TAURI_SCHEMA);
    await setMeta('created_at', new Date().toISOString());
  }
  return true;
}

/* ---------- sérialisation objet <-> tables ---------- */
function bindParams(arr){
  return arr.map(v => (v === undefined || v === null) ? null : v);
}

async function writeFullDb(data){
  await tExec('DELETE FROM invoice_lines; DELETE FROM invoices; DELETE FROM movements; DELETE FROM products; DELETE FROM settings;', []);
  const st = data.settings || {};
  await tExec('INSERT INTO settings(id,shop_name,currency,decimals,default_threshold,tax_rate,address,phone,email) VALUES(1,?1,?2,?3,?4,?5,?6,?7,?8);',
    bindParams([st.shopName || '', st.currency || 'FCFA', st.decimals ?? 0, st.defaultThreshold ?? 5,
                st.taxRate ?? 0, st.shopAddress || '', st.shopPhone || '', st.shopEmail || '']));
  for(const p of (data.products || [])){
    await tExec('INSERT INTO products(id,name,category,unit,sku,cost,price,stock,threshold) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9);',
      bindParams([p.id, p.name, p.category, p.unit, p.sku || '', p.cost, p.price, p.stock, p.threshold ?? null]));
  }
  for(const m of (data.movements || [])){
    await tExec('INSERT INTO movements(id,type,product_id,qty,unit_price,date,sale_id,note) VALUES(?1,?2,?3,?4,?5,?6,?7,?8);',
      bindParams([m.id, m.type, m.productId, m.qty, m.unitPrice, m.date, m.saleId || null, m.note || '']));
  }
  for(const inv of (data.invoices || [])){
    await tExec('INSERT INTO invoices(id,number,date,customer,status,sale_id,note) VALUES(?1,?2,?3,?4,?5,?6,?7);',
      bindParams([inv.id, inv.number, inv.date, inv.customer || '', inv.status || 'sent', inv.saleId || null, inv.note || '']));
    for(const l of (inv.lines || [])){
      await tExec('INSERT INTO invoice_lines(invoice_id,product_id,name,unit,qty,price) VALUES(?1,?2,?3,?4,?5,?6);',
        bindParams([inv.id, l.productId || null, l.name || '', l.unit || '', l.qty, l.price]));
    }
  }
}

async function readFullDb(){
  const srows = await tQuery('SELECT * FROM settings LIMIT 1', []);
  const srow = srows[0] || {};
  const prows = await tQuery('SELECT * FROM products ORDER BY rowid', []);
  const mrows = await tQuery('SELECT * FROM movements ORDER BY date DESC', []);
  const irows = await tQuery('SELECT * FROM invoices ORDER BY date DESC', []);
  const lrows = await tQuery('SELECT * FROM invoice_lines ORDER BY id', []);
  return {
    settings: { shopName: srow.shop_name ?? '', currency: srow.currency ?? 'FCFA',
                decimals: Number(srow.decimals ?? 0), defaultThreshold: Number(srow.default_threshold ?? 5),
                taxRate: Number(srow.tax_rate ?? 0), shopAddress: srow.address ?? '',
                shopPhone: srow.phone ?? '', shopEmail: srow.email ?? '' },
    products: prows.map(r=>({
      id: r.id, name: r.name, category: r.category, unit: r.unit, sku: r.sku ?? '',
      cost: Number(r.cost), price: Number(r.price), stock: Number(r.stock),
      threshold: r.threshold === null || r.threshold === undefined ? null : Number(r.threshold) })),
    movements: mrows.map(r=>({
      id: r.id, type: r.type, productId: r.product_id, qty: Number(r.qty),
      unitPrice: Number(r.unit_price), date: r.date,
      ...(r.sale_id ? { saleId: r.sale_id } : {}), note: r.note ?? '' })),
    invoices: irows.map(r=>({
      id: r.id, number: r.number, date: r.date, customer: r.customer ?? '',
      status: r.status ?? 'sent', ...(r.sale_id ? { saleId: r.sale_id } : {}), note: r.note ?? '',
      lines: lrows.filter(l => l.invoice_id === r.id).map(l=>({
        productId: l.product_id ?? '', name: l.name, unit: l.unit ?? '',
        qty: Number(l.qty), price: Number(l.price) })) }))
  };
}

/* ---------- API publique (signature identique au mode web) ---------- */
async function dbLoad(){
  if(!sqliteDb) return null;
  return readFullDb();
}

async function dbSave(data){
  if(!sqliteDb){ saveLegacy(data); return; }
  await writeFullDb(data);
  await snapshotCreate();   /* copie horodatée après chaque écriture réussie */
}

async function dbReset(demo){
  if(!sqliteDb) return;
  await tExec('DELETE FROM invoice_lines; DELETE FROM invoices; DELETE FROM movements; DELETE FROM products; DELETE FROM settings;', []);
  await createSchema();
  await writeFullDb(demo);
}

async function dbExportDb(){
  if(!sqliteDb) throw new Error('SQLite indisponible');
  return window.__TAURI__.core.invoke('db_bytes');   /* -> number[] (Uint8Array) */
}

async function dbImportDb(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  /* validation minimale : en-tête "SQLite format 3\0" */
  const head = 'SQLite format 3\0';
  for(let i=0;i<16;i++){ if(buf[i] !== head.charCodeAt(i)) throw new Error('invalid schema'); }
  const bytes = Array.from(buf);
  await window.__TAURI__.core.invoke('db_import', { bytes });
  await createSchema();
}

async function dbStorageInfo(){
  const bytes = await window.__TAURI__.core.invoke('db_size');
  /* quota absent : sur le disque il n'y a pas de plafond à afficher.
     L'interface distingue les deux cas (voir refreshStorageInfo). */
  return { usage: bytes, quota: null };
}

/* ---------- sauvegardes automatiques (voir l'équivalent dans sqlite.js) ---------- */
const SNAPSHOT_MAX = 50;

async function snapshotCreate(){
  try{
    const name = await window.__TAURI__.core.invoke('snapshot_create');
    return name;
  }catch(e){
    /* Une sauvegarde manquée ne doit jamais faire échouer l'enregistrement. */
    console.error('sauvegarde automatique impossible :', e);
    return null;
  }
}
async function snapshotList(){
  try{
    const list = await window.__TAURI__.core.invoke('snapshot_list');
    return list.map(s => ({ name: s.name, size: s.size }));
  }catch(e){ return []; }
}
async function snapshotRestore(name){
  await window.__TAURI__.core.invoke('snapshot_restore', { name });
  sqliteDb = { tauri: true };          /* la connexion a ete remplacee cote Rust */
  await createSchema();
}
async function snapshotDelete(name){
  await window.__TAURI__.core.invoke('snapshot_delete', { name });
}

/* repli (le localStorage existe aussi sous la WebView Tauri) */
function saveLegacy(data){
  try{ localStorage.setItem(LS, JSON.stringify(data)); }catch(_){}
}
