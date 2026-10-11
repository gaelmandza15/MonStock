/* ════════════════ 8. POINT DE VENTE ════════════════ */
function renderSell(){
  const cats = [...new Set(db.products.map(p=>p.category).filter(Boolean))].sort();
  $('#sell-cats').innerHTML = ['Toutes', ...cats].map(c=>{
    const on = (c==='Toutes' && !ui.sellCat) || ui.sellCat===c;
    return `<button data-action="sell-cat" data-cat="${esc(c)}" class="text-xs font-bold px-3.5 py-1.5 rounded-full border ${on?'bg-accent text-white border-accent':'bg-white border-line text-muted hover:text-ink'}">${esc(c)}</button>`;
  }).join('');
  const q = ui.sellSearch.toLowerCase();
  const list = db.products.filter(p =>
    (!ui.sellCat || p.category===ui.sellCat) &&
    (!q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q)));
  $('#sell-grid').innerHTML = list.length ? list.map(p=>{
    const out = p.stock <= 0, inCart = ui.cart.find(l=>l.productId===p.id);
    return `<button data-action="sell-add" data-id="${p.id}" ${out?'disabled':''}
      class="text-left bg-white rounded-2xl p-4 border ${out?'opacity-45 cursor-not-allowed border-line':'border-transparent hover:border-accent/40'} transition relative">
      ${inCart?`<span class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-accent text-white text-xs font-extrabold grid place-items-center num">${fmtQty(inCart.qty)}</span>`:''}
      <p class="font-bold text-sm leading-snug line-clamp-2">${esc(p.name)}</p>
      <p class="text-[11px] text-muted mt-0.5">${esc(p.category||'')}</p>
      <p class="num font-extrabold text-accent mt-2">${fmtMoney(p.price)}</p>
      <p class="text-[11px] font-semibold mt-1 ${out?'text-danger':'text-muted'}">${out?'Rupture':'Stock : '+fmtQty(p.stock)}</p></button>`;
  }).join('')
  : `<div class="col-span-full py-12 text-center text-sm text-muted">Aucun produit ne correspond.</div>`;
  renderCart();
}

function renderCart(){
  const body = $('#cart-body'), footer = $('#cart-footer');
  if(!ui.cart.length){
    body.innerHTML = `<div class="py-8 text-center">
      <span class="w-12 h-12 rounded-2xl bg-paper grid place-items-center mx-auto"><i data-lucide="shopping-basket" class="w-6 h-6 text-muted"></i></span>
      <p class="text-sm font-semibold mt-3">Panier vide</p>
      <p class="text-xs text-muted mt-1">Touchez un produit pour commencer.</p></div>`;
    footer.classList.add('hidden');
    $('#cart-total').textContent = '—';
    return;
  }
  footer.classList.remove('hidden');
  body.innerHTML = ui.cart.map(l=>{
    const p = prod(l.productId); if(!p) return '';
    const maxed = l.qty >= p.stock;
    return `<div class="flex items-center gap-2.5 py-2.5 border-b border-line/70 last:border-0">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-bold truncate">${esc(p.name)}</p>
        <p class="num text-xs text-muted mt-0.5">${fmtQty(l.qty)} × ${fmtMoney(p.price)}</p></div>
      <div class="flex items-center gap-1 shrink-0">
        <button data-action="cart-dec" data-id="${p.id}" class="w-7 h-7 rounded-lg bg-paper hover:bg-line grid place-items-center"><i data-lucide="minus" class="w-3.5 h-3.5"></i></button>
        <input data-action="cart-set" data-id="${p.id}" type="number" min="0.01" step="any" value="${l.qty}"
          class="w-14 text-center num text-sm font-bold bg-transparent border border-line rounded-lg py-1 mx-0.5">
        <button data-action="cart-inc" data-id="${p.id}" class="w-7 h-7 rounded-lg ${maxed?'bg-paper text-muted/40':'bg-accent-soft text-accent hover:bg-accent hover:text-white'} grid place-items-center"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button></div>
      <p class="num text-sm font-extrabold w-20 text-right shrink-0">${fmtMoney(l.qty*p.price)}</p>
      <button data-action="cart-rm" data-id="${p.id}" class="text-muted hover:text-danger shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
  }).join('');
  const total = cartTotal();
  $('#cart-total').textContent = fmtMoney(total);
  // Suggestions d'arrondi (montants pratiques à donner)
  const round = n => Math.ceil(total / n) * n;
  const sugg = [...new Set([round(100), round(500), round(1000), round(5000)].filter(v=>v>total))].slice(0,3);
  $('#cash-chips').innerHTML = sugg.map(v=>`<button data-action="quick-cash" data-v="${v}" class="num text-[11px] font-bold text-accent bg-accent-soft hover:bg-accent hover:text-white rounded-full px-2.5 py-1">${new Intl.NumberFormat('fr-FR').format(v)}</button>`).join('');
  renderChange();
  icons();
}

function renderChange(){
  const box = $('#change-box');
  const total = cartTotal();
  const raw = $('#cash-input').value;
  ui.cash = raw;
  if(raw === '' || total <= 0){ box.classList.add('hidden'); return; }
  const received = parseFloat(raw) || 0;
  const diff = received - total;
  box.classList.remove('hidden');
  if(diff >= 0){
    box.className = 'mt-3 rounded-xl px-4 py-3 text-sm font-semibold bg-accent-soft flex items-center justify-between text-accent';
    box.innerHTML = `<span class="flex items-center gap-1.5"><i data-lucide="hand-coins" class="w-4 h-4"></i>Monnaie à rendre</span><span class="num font-extrabold">${fmtMoney(diff)}</span>`;
  } else {
    box.className = 'mt-3 rounded-xl px-4 py-3 text-sm font-semibold bg-warn-soft flex items-center justify-between text-warn';
    box.innerHTML = `<span class="flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-4 h-4"></i>Il manque</span><span class="num font-extrabold">${fmtMoney(-diff)}</span>`;
  }
  icons();
}

function sellAdd(id){
  const p = prod(id); if(!p) return;
  if(p.stock <= 0) return toast(`« ${esc(p.name)} » est en rupture de stock.`, 'warn');
  const line = ui.cart.find(l=>l.productId===id);
  if(line){
    if(line.qty + 1 > p.stock) return toast(`Stock insuffisant : ${fmtQty(p.stock)} ${esc(p.unit||'')} disponible${p.stock>1?'s':''}.`, 'warn');
    line.qty += 1;
  } else ui.cart.push({ productId:id, qty:1 });
  renderSell();
}
function cartSetQty(id, qty){
  const p = prod(id), line = ui.cart.find(l=>l.productId===id); if(!p || !line) return;
  if(isNaN(qty) || qty <= 0){ ui.cart = ui.cart.filter(l=>l.productId!==id); }
  else { line.qty = Math.min(qty, p.stock); if(qty > p.stock) toast(`Limité au stock disponible (${fmtQty(p.stock)}).`, 'warn'); }
  renderSell();
}
function checkout(){
  if(!ui.cart.length) return;
  for(const l of ui.cart){
    const p = prod(l.productId);
    if(!p || p.stock < l.qty) return toast('Stock insuffisant pour un article du panier.', 'warn');
  }
  const total = cartTotal();
  const received = ui.cash === '' ? total : (parseFloat(ui.cash) || 0);
  if(received < total) return toast('Le montant reçu est insuffisant pour valider.', 'warn');
  const saleId = uid(), now = new Date().toISOString();
  ui.cart.forEach(l=>{
    const p = prod(l.productId);
    p.stock -= l.qty;
    db.movements.unshift({ id:uid(), type:'out', productId:p.id, qty:l.qty, unitPrice:p.price, date:now, saleId, note:'Vente' });
  });
  const change = received - total;
  ui.cart = []; ui.cash = ''; $('#cash-input').value = '';
  save(); renderPage();
  toast(change > 0.0001
    ? `Vente validée · <span class="text-accent">Monnaie à rendre : ${fmtMoney(change)}</span>`
    : 'Vente validée, stock mis à jour.');
}

