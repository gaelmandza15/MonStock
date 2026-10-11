/* ════════════════ 2. HELPERS ════════════════ */
const $  = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const prod = id => db.products.find(p => p.id === id);
const thresholdOf = p => (p.threshold ?? db.settings.defaultThreshold) ?? 5;
const pad = n => String(n).padStart(2,'0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function fmtMoney(v){
  const dec = db.settings.decimals ? 2 : 0;
  return new Intl.NumberFormat(localeOf(),{minimumFractionDigits:dec, maximumFractionDigits:dec})
    .format(Math.round(v * 10**dec) / 10**dec) + ' ' + db.settings.currency;
}
function fmtQty(q){ return Number.isInteger(q) ? String(q) : new Intl.NumberFormat(localeOf(),{maximumFractionDigits:2}).format(q); }
function fmtDate(iso){
  const L = localeOf();
  return new Date(iso).toLocaleDateString(L,{day:'numeric',month:'short'}) + ' · ' +
         new Date(iso).toLocaleTimeString(L,{hour:'2-digit',minute:'2-digit'});
}
function icons(){ if(window.lucide) lucide.createIcons(); }
function marginOf(p){ return p.cost > 0 ? (p.price - p.cost) / p.cost * 100 : null; }

/* ════════════════ 3. CALCULS ════════════════ */
function stockValue(){ return db.products.reduce((s,p)=> s + p.stock * p.cost, 0); }
function alerts(){ return db.products.filter(p => p.stock <= thresholdOf(p)).sort((a,b)=>a.stock-b.stock); }
function todayMoves(){
  const k = dayKey(new Date());
  return db.movements.filter(m => m.type==='out' && m.saleId && dayKey(new Date(m.date))===k);
}
function salesToday(){ return todayMoves().reduce((s,m)=> s + m.qty*m.unitPrice, 0); }
function profitToday(){ return todayMoves().reduce((s,m)=>{ const p=prod(m.productId); return s + (p ? m.qty*(m.unitPrice - p.cost) : 0); }, 0); }
function cartTotal(){ return ui.cart.reduce((s,l)=>{ const p=prod(l.productId); return s + (p ? l.qty*p.price : 0); }, 0); }

