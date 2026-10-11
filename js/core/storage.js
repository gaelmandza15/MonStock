/* ════════════════ Couche de stockage unifiée : Web + Tauri ════════════════
   But du jeu : le même code fonctionne
     - dans un navigateur (sql.js/WASM + IndexedDB + localStorage), et
     - dans l'application de bureau Tauri (window.__TAURI__ disponible).
   Sous Tauri, les appels "lents" (IO) passent par invoke() vers des
   commandes Rust ; sous navigateur, ils passent par les implémentations
   existantes (js/core/sqlite.js pour SQLite, localStorage pour la config).

   Clé de config (langue, drapeau de migration) : API synchrone identique
   partout (localStorage reste utilisé en interne sous navigateur). */

const IS_TAURI = typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

/* ---------- Config (synchrone) : clé -> valeur string ---------- */
const CFG_DEFAULTS = { klarstock_lang: 'fr', klarstock_migrated: '0' };
const _cfgCache = {};
let _cfgReady = false;          /* sous Tauri : rempli une fois via async */
let _cfgDirty = false;
let _cfgFlushTimer = null;

function cfgGet(key){
  if(!IS_TAURI) return localStorage.getItem(key);
  if(!_cfgReady) return (key in CFG_DEFAULTS ? CFG_DEFAULTS[key] : null);
  const v = _cfgCache[key];
  return (v === undefined ? null : v);
}
function cfgSet(key, val){
  if(!IS_TAURI){ localStorage.setItem(key, val); return; }
  _cfgCache[key] = String(val);
  _cfgDirty = true;
  clearTimeout(_cfgFlushTimer);
  _cfgFlushTimer = setTimeout(cfgFlush, 400); /* anti-rebond : 1 invoke max / 400 ms */
}
async function cfgFlush(){
  if(!IS_TAURI || !_cfgDirty) return;
  _cfgDirty = false;
  await window.__TAURI__.core.invoke('save_config', { config: JSON.stringify(_cfgCache) });
}

/* Chargement asynchrone préalable (appelé au boot sous Tauri uniquement). */
async function cfgInit(){
  if(!IS_TAURI){ _cfgReady = true; return; }
  try{
    const raw = await window.__TAURI__.core.invoke('load_config');
    Object.assign(_cfgCache, raw ? JSON.parse(raw) : {});
  }catch(e){ /* premier lancement ou erreur : valeurs par défaut */ }
  _cfgReady = true;
}

/* ---------- Base SQLite ----------
   Les fonctions dbInit/dbSave/queryOne/queryAll/execSql/exportDbBytes/
   importDbBytes sont définies dans js/core/sqlite.js ; ce fichier les
   redirige vers Rust quand on tourne sous Tauri. Voir sqlite.js. */
