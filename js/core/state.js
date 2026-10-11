/* ════════════════ 1. ÉTAT & PERSISTANCE ════════════════ */
/* Règle i18n : aucun texte destinataire avec accents ni devise en dur dans les modules JS.
   Tout le contenu visible passe par t('clé') et les dictionnaires js/i18n/. */
const LS = 'monstock_v1';
const LS_LANG = 'monstock_lang';
/* Les libellés passent par des clés i18n : aucune chaîne affichable en dur ici.
   La liste complète des devises (groupées par continent) est dans js/config/currencies.js. */
const UNIT_KEYS = ['units.piece','units.pack','units.carton','units.bag','units.jerrycan',
                   'units.box','units.kg','units.liter','units.meter','units.bar','units.ten'];

let db = load() || seed(true);
let page = 'dashboard';
const ui = { prodSearch:'', prodCat:'', prodSort:'name', mvType:'all', mvRange:30,
             sellSearch:'', sellCat:'', cart:[], cash:'', confirmDel:null };
const prevKpi = {};

function save(){ localStorage.setItem(LS, JSON.stringify(db)); }
function saveLang(){ localStorage.setItem(LS_LANG, lang); }
function load(){ try{ const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function seed(demo){
  const s = { settings:{ shopName:t('seed.shopName'), currency:'FCFA', decimals:0, defaultThreshold:5 }, products:[], movements:[] };
  if(!demo) return s;
  s.settings.shopName = t('seed.demoShopName');
  const P = (name,category,unit,cost,price,stock,threshold)=>{ const p={id:uid(),name,category,unit,cost,price,stock,threshold,sku:''}; s.products.push(p); return p; };
  const EPI=t('seed.cat.grocery'), HY=t('seed.cat.hygiene'), TEX=t('seed.cat.textile'),
        MAT=t('seed.cat.materials'), DIV=t('seed.cat.misc');
  const U_PIECE=t('units.piece'), U_PACK=t('units.pack'), U_SAC=t('units.bag'),
        U_BIDON=t('units.jerrycan'), U_BOITE=t('units.box');
  const riz   = P(t('seed.riz'),   EPI, U_SAC,   14000, 16500, 18, 5);
  const huile = P(t('seed.huile'), EPI, U_BIDON, 5200,  6500,  9, 4);
  const sucre = P(t('seed.sucre'), EPI, U_PACK,  850,   1000, 42, 10);
  const savon = P(t('seed.savon'), HY,  U_PIECE, 350,   500,  4, 10);
  const wax   = P(t('seed.wax'),   TEX, U_PIECE, 4500,  7000, 12, 3);
  const ciment= P(t('seed.ciment'),MAT, U_SAC,   4200,  4800,  0, 5);
  const the   = P(t('seed.the'),   EPI, U_BOITE, 600,   900, 26, 6);
  const piles = P(t('seed.piles'), DIV, U_PACK,  700,   1200,  3, 5);
  const now = Date.now();
  for(let d=6; d>=0; d--){
    const nSales = 1 + Math.floor(Math.random()*3);
    for(let v=0; v<nSales; v++){
      const saleId = uid();
      const dte = new Date(now - d*864e5); dte.setHours(9 + Math.floor(Math.random()*9), Math.floor(Math.random()*60), 0, 0);
      const available = s.products.filter(p=>p.stock>0);
      const lines = Math.min(1 + Math.floor(Math.random()*3), available.length);
      const used = new Set();
      for(let l=0; l<lines; l++){
        let p; let guard = 0;
        do { p = available[Math.floor(Math.random()*available.length)]; guard++; } while(used.has(p.id) && guard < 20);
        if(used.has(p.id)) continue;
        used.add(p.id);
        s.movements.push({ id:uid(), type:'out', productId:p.id, qty:1+Math.floor(Math.random()*3), unitPrice:p.price, date:dte.toISOString(), saleId, note:t('seed.saleNote') });
      }
    }
  }
  const t2 = new Date(now - 2*864e5); t2.setHours(8,15,0,0);
  s.movements.push({ id:uid(), type:'in', productId:riz.id, qty:10, unitPrice:riz.cost, date:t2.toISOString(), note:t('seed.deliveryNote') });
  const t3 = new Date(now - 4*864e5); t3.setHours(10,40,0,0);
  s.movements.push({ id:uid(), type:'in', productId:huile.id, qty:6, unitPrice:huile.cost, date:t3.toISOString(), note:t('seed.deliveryNote') });
  s.movements.sort((a,b)=> new Date(b.date) - new Date(a.date));
  return s;
}

