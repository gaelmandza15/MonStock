/* ════════════════ SQLITE — moteur de persistance ════════════════ */
/* Stockage principal : base SQLite (sql.js, WASM) dont le fichier klarstock.db
   est conservé dans IndexedDB. La page d'accueil reste localStorage (loadLang).
   API publique : initSqlite(), dbLoad(), dbSave(), dbExportDb(), dbImportDb(file),
                  dbReset(), dbStorageInfo(). */

const APP_SCHEMA = 1;
const LS_MIGRATED = 'klarstock_migrated_v1';
let SQL = null;          /* module sql.js chargé */
let sqliteDb = null;     /* instance SQLite ouverte */
let idbPromise = null;   /* connexion IndexedDB singleton */

/* ---------- schéma ---------- */
function execSql(sql){
  sqliteDb.run('PRAGMA foreign_keys = OFF;');
  sqliteDb.exec(sql);
  sqliteDb.run('PRAGMA foreign_keys = ON;');
}

function createSchema(){
  execSql(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
    CREATE INDEX IF NOT EXISTS idx_line_invoice ON invoice_lines(invoice_id);`);
}

function setMeta(k, v){
  sqliteDb.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value;', [k, String(v)]);
}
function getMeta(k){
  const r = sqliteDb.exec('SELECT value FROM meta WHERE key=?', [k]);
  return r.length ? String(r[0].values[0][0]) : null;
}

/* ---------- IndexedDB : conteneur du fichier .db ---------- */
function openIdb(){
  if(idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open('klarstock', 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore('files'); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return idbPromise;
}
async function idbGet(key){
  const idb = await openIdb();
  return new Promise((resolve, reject)=>{
    const rq = idb.transaction('files','readonly').objectStore('files').get(key);
    rq.onsuccess = ()=> resolve(rq.result !== undefined ? rq.result : null);
    rq.onerror = ()=> reject(rq.error);
  });
}
async function idbPut(key, val){
  const idb = await openIdb();
  return new Promise((resolve, reject)=>{
    const tx = idb.transaction('files','readwrite');
    tx.objectStore('files').put(val, key);
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}

/* ---------- ouverture / initialisation ---------- */
async function initSqlite(){
  if(!window.initSqlJs) throw new Error('sql.js indisponible');
  if(!SQL) SQL = await window.initSqlJs({ locateFile: f => VENDOR_SQLJS + f });
  let bytes = await idbGet('klarstock.db');
  let migratedNow = false;
  if(!bytes && !cfgGet(LS_MIGRATED)){
    const raw = cfgGet(LS);
    if(raw){
      try{
        const jdb = JSON.parse(raw);
        sqliteDb = new SQL.Database();
        createSchema();
        writeFullDb(jdb);
        bytes = sqliteDb.export();
        migratedNow = true;
        if(typeof toast === 'function') toast(t('settings.migrationToast'), 'ok');
      }catch(_){ bytes = null; }
      finally{ if(sqliteDb){ sqliteDb.close(); sqliteDb = null; } }
    }
  }
  sqliteDb = bytes ? new SQL.Database(bytes) : new SQL.Database();
  createSchema();
  /* le drapeau n'est posé qu'après ouverture réussie (sinon la migration sera retentée) */
  if(migratedNow) cfgSet(LS_MIGRATED, '1');
  if(getMeta('schema_version') === null){
    setMeta('schema_version', APP_SCHEMA);
    setMeta('created_at', new Date().toISOString());
    if(!bytes) await persist();
  }
  return true;
}

/* ---------- sérialisation objet <-> tables ---------- */
function bindParams(arr){
  return arr.map(v => (v === undefined || v === null) ? null : v);
}

function writeFullDb(data){
  execSql('DELETE FROM invoice_lines; DELETE FROM invoices; DELETE FROM movements; DELETE FROM products; DELETE FROM settings;');
  const st = data.settings || {};
  sqliteDb.run('INSERT INTO settings(id,shop_name,currency,decimals,default_threshold,tax_rate,address,phone,email) VALUES(1,?,?,?,?,?,?,?,?);',
    bindParams([st.shopName || '', st.currency || 'FCFA', st.decimals ?? 0, st.defaultThreshold ?? 5,
                st.taxRate ?? 0, st.shopAddress || '', st.shopPhone || '', st.shopEmail || '']));
  const insP = sqliteDb.prepare('INSERT INTO products(id,name,category,unit,sku,cost,price,stock,threshold) VALUES(?,?,?,?,?,?,?,?,?);');
  (data.products || []).forEach(p=>{ insP.run(bindParams([p.id, p.name, p.category, p.unit, p.sku || '', p.cost, p.price, p.stock, p.threshold ?? null])); });
  insP.free();
  const insM = sqliteDb.prepare('INSERT INTO movements(id,type,product_id,qty,unit_price,date,sale_id,note) VALUES(?,?,?,?,?,?,?,?);');
  (data.movements || []).forEach(m=>{ insM.run(bindParams([m.id, m.type, m.productId, m.qty, m.unitPrice, m.date, m.saleId || null, m.note || ''])); });
  insM.free();
  const insI = sqliteDb.prepare('INSERT INTO invoices(id,number,date,customer,status,sale_id,note) VALUES(?,?,?,?,?,?,?);');
  const insL = sqliteDb.prepare('INSERT INTO invoice_lines(invoice_id,product_id,name,unit,qty,price) VALUES(?,?,?,?,?,?);');
  (data.invoices || []).forEach(inv=>{
    insI.run(bindParams([inv.id, inv.number, inv.date, inv.customer || '', inv.status || 'sent', inv.saleId || null, inv.note || '']));
    (inv.lines || []).forEach(l=>{ insL.run(bindParams([inv.id, l.productId || null, l.name || '', l.unit || '', l.qty, l.price])); });
  });
  insI.free(); insL.free();
}

function readFullDb(){
  const one = (sql)=>{
    const r = sqliteDb.exec(sql);
    if(!r.length) return [];
    const cols = r[0].columns, vals = r[0].values;
    return vals.map(row => { const o = {}; cols.forEach((c,i)=>{ o[c] = row[i]; }); return o; });
  };
  const srow = one('SELECT * FROM settings LIMIT 1')[0] || {};
  const out = {
    settings: { shopName: srow.shop_name ?? '', currency: srow.currency ?? 'FCFA',
                decimals: Number(srow.decimals ?? 0), defaultThreshold: Number(srow.default_threshold ?? 5),
                taxRate: Number(srow.tax_rate ?? 0), shopAddress: srow.address ?? '',
                shopPhone: srow.phone ?? '', shopEmail: srow.email ?? '' },
    products: one('SELECT * FROM products ORDER BY rowid').map(r=>({
      id: r.id, name: r.name, category: r.category, unit: r.unit, sku: r.sku ?? '',
      cost: Number(r.cost), price: Number(r.price), stock: Number(r.stock),
      threshold: r.threshold === null ? null : Number(r.threshold) })),
    movements: one('SELECT * FROM movements ORDER BY date DESC').map(r=>({
      id: r.id, type: r.type, productId: r.product_id, qty: Number(r.qty),
      unitPrice: Number(r.unit_price), date: r.date,
      ...(r.sale_id ? { saleId: r.sale_id } : {}), note: r.note ?? '' })),
    invoices: one('SELECT * FROM invoices ORDER BY date DESC').map(r=>({
      id: r.id, number: r.number, date: r.date, customer: r.customer ?? '',
      status: r.status ?? 'sent', ...(r.sale_id ? { saleId: r.sale_id } : {}), note: r.note ?? '',
      lines: one("SELECT * FROM invoice_lines WHERE invoice_id='" + escSql(r.id) + "' ORDER BY id").map(l=>({
        productId: l.product_id ?? '', name: l.name, unit: l.unit ?? '',
        qty: Number(l.qty), price: Number(l.price) })) }))
  };
  return out;
}

function escSql(s){ return String(s).replace(/'/g, "''"); }

/* ---------- API publique ---------- */
function dbLoad(){ return sqliteDb ? readFullDb() : null; }

async function persist(){
  if(!sqliteDb) return;
  await idbPut('klarstock.db', sqliteDb.export());
}

async function dbSave(data){
  if(!sqliteDb){ saveLegacy(data); return; }
  writeFullDb(data);
  await persist();
  await snapshotCreate();   /* copie horodatée après chaque écriture réussie */
}

async function dbReset(demo){
  if(!sqliteDb) return;
  sqliteDb.exec('DELETE FROM invoice_lines; DELETE FROM invoices; DELETE FROM movements; DELETE FROM products; DELETE FROM settings;');
  createSchema();
  writeFullDb(demo);
  await persist();
}

async function dbExportDb(){
  if(!sqliteDb) throw new Error('SQLite indisponible');
  return sqliteDb.export();
}

async function dbImportDb(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  const probe = new SQL.Database(buf);
  const ok = probe.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','movements','invoices','settings')");
  probe.close();
  if(!ok.length || ok[0].values.length < 4) throw new Error('invalid schema');
  if(sqliteDb) sqliteDb.close();
  sqliteDb = new SQL.Database(buf);
  createSchema();
  await persist();
}

async function dbStorageInfo(){
  if(!navigator.storage || !navigator.storage.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage || 0, quota: e.quota || 0 };
}

/* ---------- sauvegardes automatiques ----------
   Même contrat que le mode bureau (js/core/sqlite-tauri.js) : une copie
   horodatée à chaque écriture, 50 conservées au maximum. Ici les copies
   vivent dans le magasin IndexedDB, sous la clé « snap:<horodatage> ». */
const SNAPSHOT_MAX = 50;

/* Horodatage local trié lexicographiquement, comme le nom de fichier côté Rust.
   Les centièmes distinguent deux écritures rapprochées. */
function snapshotStamp(){
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const centis = p(Math.floor(d.getMilliseconds() / 10));
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
       + `T${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}s${centis}`;
}

async function snapshotCreate(){
  try{
    if(!sqliteDb) return null;
    const name = snapshotStamp() + '.db';
    await idbPut('snap:' + name, sqliteDb.export());
    await snapshotRotate();
    return name;
  }catch(e){
    /* Une sauvegarde manquée ne doit jamais faire échouer l'enregistrement. */
    console.error('sauvegarde automatique impossible :', e);
    return null;
  }
}

async function snapshotKeys(){
  const idb = await openIdb();
  return new Promise((resolve, reject)=>{
    const rq = idb.transaction('files','readonly').objectStore('files').getAllKeys();
    rq.onsuccess = ()=> resolve(rq.result.filter(k => typeof k === 'string' && k.startsWith('snap:')));
    rq.onerror = ()=> reject(rq.error);
  });
}

async function snapshotRotate(){
  const keys = (await snapshotKeys()).sort();
  if(keys.length <= SNAPSHOT_MAX) return;
  const idb = await openIdb();
  for(const k of keys.slice(0, keys.length - SNAPSHOT_MAX)){
    await new Promise((resolve)=>{
      const tx = idb.transaction('files','readwrite');
      tx.objectStore('files').delete(k);
      tx.oncomplete = resolve; tx.onerror = resolve;
    });
  }
}

async function snapshotList(){
  try{
    const keys = (await snapshotKeys()).sort().reverse();   /* plus récent d'abord */
    const out = [];
    for(const k of keys){
      const bytes = await idbGet(k);
      out.push({ name: k.slice('snap:'.length), size: bytes ? bytes.length : 0 });
    }
    return out;
  }catch(e){ return []; }
}

async function snapshotRestore(name){
  const bytes = await idbGet('snap:' + name);
  if(!bytes || bytes.length < 16) throw new Error('sauvegarde introuvable');
  if(sqliteDb) sqliteDb.close();
  sqliteDb = new SQL.Database(bytes);
  createSchema();
  await persist();
}

async function snapshotDelete(name){
  const idb = await openIdb();
  return new Promise((resolve, reject)=>{
    const tx = idb.transaction('files','readwrite');
    tx.objectStore('files').delete('snap:' + name);
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}

/* repli si SQLite n'a pas pu démarrer (wasm indisponible, vieux navigateur…) */
function saveLegacy(data){
  try{ localStorage.setItem(LS, JSON.stringify(data)); }catch(_){}
}
