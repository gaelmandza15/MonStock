/* ════════════════ 1. ÉTAT & PERSISTANCE ════════════════ */
const LS = 'monstock_v1';
const CURRENCIES = [
  {c:'FCFA', d:0, label:'Franc CFA (FCFA)'}, {c:'GNF', d:0, label:'Franc guinéen (GNF)'},
  {c:'MGA', d:0, label:'Ariary (MGA)'}, {c:'KMF', d:0, label:'Franc comorien (KMF)'},
  {c:'MAD', d:2, label:'Dirham marocain (MAD)'}, {c:'DZD', d:2, label:'Dinar algérien (DZD)'},
  {c:'TND', d:2, label:'Dinar tunisien (TND)'}, {c:'€', d:2, label:'Euro (€)'},
  {c:'$', d:2, label:'Dollar ($)'}, {c:'NGN', d:2, label:'Naira (NGN)'},
];
const UNITS = ['pièce','paquet','carton','sac','bidon','boîte','kg','litre','mètre','barre','dizaine'];

let db = load() || seed(true);
let page = 'dashboard';
const ui = { prodSearch:'', prodCat:'', prodSort:'name', mvType:'all', mvRange:30,
             sellSearch:'', sellCat:'', cart:[], cash:'', confirmDel:null };
const prevKpi = {};

function save(){ localStorage.setItem(LS, JSON.stringify(db)); }
function load(){ try{ const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function seed(demo){
  const s = { settings:{ shopName:'Ma Boutique', currency:'FCFA', decimals:0, defaultThreshold:5 }, products:[], movements:[] };
  if(!demo) return s;
  s.settings.shopName = 'Chez Awa Boutique';
  const P = (name,category,unit,cost,price,stock,threshold)=>{ const p={id:uid(),name,category,unit,cost,price,stock,threshold,sku:''}; s.products.push(p); return p; };
  const riz   = P('Riz parfumé 25 kg','Épicerie','sac',   14000, 16500, 18, 5);
  const huile = P('Huile végétale 5 L','Épicerie','bidon', 5200,  6500,  9, 4);
  const sucre = P('Sucre en morceaux 1 kg','Épicerie','paquet', 850, 1000, 42, 10);
  const savon = P('Savon de Marseille','Hygiène','pièce',    350,   500,  4, 10);
  const wax   = P('Tissu wax 6 yards','Textile','pièce',    4500,  7000, 12, 3);
  const ciment= P('Ciment 50 kg','Matériaux','sac',          4200,  4800,  0, 5);
  const the   = P('Thé vert 100 g','Épicerie','boîte',        600,   900, 26, 6);
  const piles = P('Piles AA (x4)','Divers','paquet',          700,  1200,  3, 5);
  const now = Date.now();
  for(let d=6; d>=0; d--){
    const nSales = 1 + Math.floor(Math.random()*3);
    for(let v=0; v<nSales; v++){
      const saleId = uid();
      const t = new Date(now - d*864e5); t.setHours(9 + Math.floor(Math.random()*9), Math.floor(Math.random()*60), 0, 0);
      const available = s.products.filter(p=>p.stock>0);
      const lines = Math.min(1 + Math.floor(Math.random()*3), available.length);
      const used = new Set();
      for(let l=0; l<lines; l++){
        let p; let guard = 0;
        do { p = available[Math.floor(Math.random()*available.length)]; guard++; } while(used.has(p.id) && guard < 20);
        if(used.has(p.id)) continue;
        used.add(p.id);
        s.movements.push({ id:uid(), type:'out', productId:p.id, qty:1+Math.floor(Math.random()*3), unitPrice:p.price, date:t.toISOString(), saleId, note:'Vente' });
      }
    }
  }
  const t2 = new Date(now - 2*864e5); t2.setHours(8,15,0,0);
  s.movements.push({ id:uid(), type:'in', productId:riz.id, qty:10, unitPrice:riz.cost, date:t2.toISOString(), note:'Livraison grossiste' });
  const t3 = new Date(now - 4*864e5); t3.setHours(10,40,0,0);
  s.movements.push({ id:uid(), type:'in', productId:huile.id, qty:6, unitPrice:huile.cost, date:t3.toISOString(), note:'Livraison grossiste' });
  s.movements.sort((a,b)=> new Date(b.date) - new Date(a.date));
  return s;
}

