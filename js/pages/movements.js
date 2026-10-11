/* ════════════════ 9. MOUVEMENTS ════════════════ */
function renderMovements(){
  const types = [ ['all',t('movements.filterAll')], ['in',t('movements.filterIn')], ['out',t('movements.filterOut')], ['adj',t('movements.filterAdj')] ];
  $('#mv-chips').innerHTML = types.map(([v,l])=>{
    const on = ui.mvType === v;
    return `<button data-action="mv-type" data-v="${v}" class="text-xs font-bold px-3.5 py-1.5 rounded-full border ${on?'bg-ink text-white border-ink':'bg-white border-line text-muted hover:text-ink'}">${l}</button>`;
  }).join('');
  $('#mv-range').value = ui.mvRange;
  const minTime = ui.mvRange ? Date.now() - ui.mvRange * 864e5 : 0;
  const list = db.movements.filter(m => (ui.mvType==='all' || m.type===ui.mvType) && new Date(m.date).getTime() >= minTime);
  $('#mv-empty').classList.toggle('hidden', list.length > 0);
  if(list.length){
    $('#mv-body').classList.remove('hidden');
    $('#mv-body').innerHTML = list.slice(0, 200).map(m=>{
      const p = prod(m.productId);
      const conf = { in:{l:t('movements.typeIn'), c:'text-accent bg-accent-soft'}, out:{l:t('movements.typeOut'), c:'text-info bg-info-soft'}, adj:{l:t('movements.typeAdj'), c:'text-warn bg-warn-soft'} }[m.type];
      return `<tr class="hover:bg-panel/70 transition">
        <td class="px-5 py-3 whitespace-nowrap num text-muted">${fmtDate(m.date)}</td>
        <td class="px-4 py-3 font-bold">${esc(p ? p.name : t('movements.deletedProduct'))}</td>
        <td class="px-4 py-3"><span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${conf.c}">${conf.l}</span></td>
        <td class="px-4 py-3 text-right num font-bold">${m.type==='adj' && m.qty>=0 ? '+' : ''}${fmtQty(m.qty)}</td>
        <td class="px-4 py-3 text-right num font-semibold ${m.type==='in'?'text-accent':''}">${fmtMoney(m.qty * m.unitPrice)}</td>
        <td class="px-5 py-3 text-muted text-xs">${esc(m.note||'—')}${m.saleId?` · ${t('movements.saleRef')} <span class="num font-semibold">#${m.saleId.slice(-4)}</span>`:''}</td></tr>`;
    }).join('');
  } else {
    $('#mv-body').classList.add('hidden');
    $('#mv-empty').innerHTML = `<span class="w-12 h-12 rounded-2xl bg-paper grid place-items-center mx-auto"><i data-lucide="arrow-left-right" class="w-6 h-6 text-muted"></i></span>
      <p class="font-bold mt-3">${t('movements.emptyTitle')}</p><p class="text-sm text-muted mt-1">${t('movements.emptyHint')}</p>`;
  }
}

function movementModal(){
  if(!db.products.length) return toast(t('movements.addProductFirst'), 'warn');
  const opts = db.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr'))
    .map(p=>`<option value="${p.id}">${esc(p.name)} — ${t('movements.stockSuffix', { qty: fmtQty(p.stock) })}</option>`).join('');
  openModal(`${modalHeader(t('movements.modalTitle'), t('movements.modalSub'))}
    <form id="mv-form" class="px-6 pb-6 pt-2 space-y-3.5">
      <div><label class="${labelCls}">${t('movements.typeLabel')}</label>
        <select name="type" class="${inputCls}">
          <option value="in">${t('movements.optIn')}</option>
          <option value="out">${t('movements.optOut')}</option>
          <option value="adj">${t('movements.optAdj')}</option>
        </select></div>
      <div><label class="${labelCls}">${t('movements.productLabel')}</label>
        <select name="productId" class="${inputCls}">${opts}</select></div>
      <div><label class="${labelCls}">${t('movements.qtyLabel')}</label>
        <input name="qty" type="number" step="any" required class="${inputCls} num" placeholder="0">
        <p id="mv-hint" class="text-[11px] text-muted mt-1"></p></div>
      <div><label class="${labelCls}">${t('movements.unitPriceLabel')}</label>
        <input name="unitPrice" type="number" min="0" step="any" class="${inputCls} num"></div>
      <div><label class="${labelCls}">${t('movements.noteLabel')}</label>
        <input name="note" type="text" class="${inputCls}" placeholder="${t('movements.notePlaceholder')}"></div>
      <p id="mv-error" class="hidden text-xs font-semibold text-danger"></p>
      <div class="flex gap-2.5 pt-1">
        <button type="button" data-action="close-layer" class="flex-1 border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">${t('form.cancel')}</button>
        <button type="submit" class="flex-1 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">${t('form.save')}</button>
      </div></form>`);
  const f = $('#mv-form'), hint = $('#mv-hint'), up = f.elements.unitPrice;
  const sync = ()=>{
    const p = prod(f.elements.productId.value); if(!p) return;
    if(f.elements.type.value === 'in'){ hint.textContent = t('movements.hintIn'); up.value = p.cost; }
    else if(f.elements.type.value === 'out'){ hint.textContent = t('movements.hintOut'); up.value = p.price; }
    else { hint.textContent = t('movements.hintAdj'); up.value = 0; }
  };
  f.elements.type.addEventListener('change', sync);
  f.elements.productId.addEventListener('change', sync);
  sync();
  f.addEventListener('submit', e=>{
    e.preventDefault();
    const type = f.elements.type.value, p = prod(f.elements.productId.value);
    const qty = parseFloat(f.elements.qty.value);
    const unitPrice = parseFloat(f.elements.unitPrice.value) || 0;
    const err = m => { const el = $('#mv-error'); el.textContent = m; el.classList.remove('hidden'); };
    if(isNaN(qty) || qty === 0) return err(t('movements.errQtyZero'));
    if(type === 'in'){ p.stock += qty; }
    else if(type === 'out'){
      if(qty > p.stock) return err(t('movements.errInsufficient', { qty: fmtQty(p.stock) }));
      p.stock -= qty;
    } else {
      if(p.stock + qty < 0) return err(t('movements.errNegativeStock', { qty: fmtQty(p.stock) }));
      p.stock += qty;
    }
    db.movements.unshift({ id:uid(), type, productId:p.id, qty, unitPrice, date:new Date().toISOString(), note:f.elements.note.value.trim() });
    save(); closeLayer(); renderPage();
    toast(t('movements.saved'));
  });
}

