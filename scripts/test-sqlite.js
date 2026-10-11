/* Test d'intégration : persistance SQLite (js/core/sqlite.js) avec fake-indexeddb. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { indexedDB } = require('fake-indexeddb');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const store = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.indexedDB = indexedDB;
global.navigator = { storage: { estimate: async () => ({ usage: 12345, quota: 999 }) } };
const toastBox = { appendChild(){} };
global.document = {
  createElement: () => ({ click(){}, style:{}, innerHTML:'', classList:{add(){},remove(){}}, dataset:{}, appendChild(){}, querySelectorAll(){ return []; } }),
  querySelector: sel => (sel === '#toasts' ? toastBox : null),
  addEventListener(){}
};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL(){} };
global.Blob = class { constructor(p){ this.parts = p; } };

(async () => {
  const ctx = await initSqlJs();
  global.initSqlJs = async () => ctx;

  /* Charge les modules dans l'ordre réel de index.html */
  const files = ['js/i18n/fr.js','js/i18n/en.js','js/core/i18n.js','js/config/currencies.js',
                 'js/core/storage.js','js/core/sqlite.js','js/core/state.js'];
  for(const f of files){
    const code = fs.readFileSync(path.join(ROOT,f),'utf8');
    vm.runInThisContext(code, { filename: f });
  }

  let failures = 0;
  const check = (name, cond) => { console.log((cond?'PASS':'FAIL')+' — '+name); if(!cond) failures++; };

  /* ── 1. démarrage sur base vide → jeu de démo écrit en SQLite ── */
  await initSqlite();
  check('initSqlite OK', sqliteDb !== null);
  const stored0 = dbLoad();
  check('base vide au premier demarrage', stored0.products.length === 0);
  await dbSave(db);                       /* boot() ferait ceci */
  const stored1 = dbLoad();
  check('demo ecrite en SQLite (produits)', stored1.products.length === db.products.length);
  check('demo ecrite en SQLite (mouvements)', stored1.movements.length === db.movements.length);
  check('demo ecrite en SQLite (factures)', stored1.invoices.length === db.invoices.length);
  check('demo ecrite en SQLite (lignes facture)',
        stored1.invoices.reduce((a,i)=>a+i.lines.length,0) === db.invoices.reduce((a,i)=>a+i.lines.length,0));
  check('settings ronds-trip', stored1.settings.shopName === db.settings.shopName && stored1.settings.currency === 'FCFA');

  /* ── 2. round-trip complet objet -> SQLite -> objet ── */
  /* tri canonique des clés pour comparer deux objets indépendamment de l'ordre d'énumération */
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
    : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v);
  const norm = o => JSON.stringify(sortKeys(o), (k,v)=> typeof v==='number'? +v.toFixed(6): v);
  check('round-trip identique (mouvements tries par date desc)',
        norm(db.movements.slice().sort((x,y)=>new Date(y.date)-new Date(x.date))) === norm(stored1.movements));
  check('round-trip identique (produits)',
        norm(db.products.slice().sort((x,y)=>x.name.localeCompare(y.name))) ===
        norm(stored1.products.slice().sort((x,y)=>x.name.localeCompare(y.name))));
  check('round-trip identique (factures+lignes)',
        norm(db.invoices.map(i=>({n:i.number,c:i.customer,s:i.status,l:i.lines})).sort((x,y)=>x.n.localeCompare(y.n))) ===
        norm(stored1.invoices.map(i=>({n:i.number,c:i.customer,s:i.status,l:i.lines})).sort((x,y)=>x.n.localeCompare(y.n))));

  /* ── 3. persistance IndexedDB : recharger la base depuis le fichier ── */
  const bytes = await dbExportDb();
  check('export .db non vide', bytes.length > 400 && String.fromCharCode(...bytes.slice(0,7)) === 'SQLite ');
  /* vérifie que les octets sont bien relus dans IndexedDB (simule un rechargement de page) */
  const idbBytes = await idbGet('klarstock.db');
  check('octets persistes dans IndexedDB', !!idbBytes && idbBytes.length === bytes.length);
  sqliteDb.close(); sqliteDb = null;
  sqliteDb = new SQL.Database(idbBytes);             /* reopen depuis IndexedDB */
  const reopened = dbLoad();
  check('reouverture depuis octets identique', reopened.products.length === stored1.products.length &&
        reopened.invoices[0].lines.length === stored1.invoices.find(x=>x.lines.length)?.lines.length);

  /* ── 4. migration depuis localStorage ── */
  sqliteDb.close(); sqliteDb = null;
  const legacy = seed(true); legacy.settings.shopName = 'LEGACY-SHOP';
  localStorage.setItem('klarstock_v1', JSON.stringify(legacy));
  localStorage.removeItem('klarstock_migrated_v1');   /* simule un utilisateur pré-SQLite */
  localStorage.removeItem('klarstock_migrating_v1');
  await openIdb().then(idb => new Promise(res => { const tx=idb.transaction('files','readwrite'); tx.objectStore('files').clear(); tx.oncomplete=res; }));
  await initSqlite();
  const migrated = dbLoad();
  check('migration localStorage -> SQLite', migrated.settings.shopName === 'LEGACY-SHOP' && migrated.products.length === legacy.products.length);
  check('flag migre pose', localStorage.getItem('klarstock_migrated_v1') === '1');

  /* ── 5. suppression en cascade (ON DELETE CASCADE) ── */
  const p0 = migrated.products[0];
  sqliteDb.run('DELETE FROM products WHERE id=?;', [p0.id]);
  const after = dbLoad();
  check('cascade mouvements produits supprimes', !after.movements.some(m=>m.productId===p0.id));

  /* ── 6. repli si SQLite indisponible ── */
  sqliteDb.close(); sqliteDb = null;
  await dbSave({settings:{shopName:'X'},products:[],movements:[],invoices:[]});
  check('repli localStorage quand sqliteDb=null', !!localStorage.getItem('klarstock_v1'));

  console.log(failures ? `\n${failures} echec(s)` : '\nTous les tests SQLite sont passes.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE:', e); process.exit(1); });
