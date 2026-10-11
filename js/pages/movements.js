/* ════════════════ 9. MOUVEMENTS ════════════════ */
function renderMovements(){
  const types = [ ['all','Tous'], ['in','Entrées'], ['out','Sorties'], ['adj','Ajustements'] ];
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
      const conf = { in:{l:'Entrée', c:'text-accent bg-accent-soft'}, out:{l:'Sortie', c:'text-info bg-info-soft'}, adj:{l:'Ajustement', c:'text-warn bg-warn-soft'} }[m.type];
      return `<tr class="hover:bg-panel/70 transition">
        <td class="px-5 py-3 whitespace-nowrap num text-muted">${fmtDate(m.date)}</td>
        <td class="px-4 py-3 font-bold">${esc(p ? p.name : 'Produit supprimé')}</td>
        <td class="px-4 py-3"><span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${conf.c}">${conf.l}</span></td>
        <td class="px-4 py-3 text-right num font-bold">${m.type==='adj' && m.qty>=0 ? '+' : ''}${fmtQty(m.qty)}</td>
        <td class="px-4 py-3 text-right num font-semibold ${m.type==='in'?'text-accent':''}">${fmtMoney(m.qty * m.unitPrice)}</td>
        <td class="px-5 py-3 text-muted text-xs">${esc(m.note||'—')}${m.saleId?` · vente <span class="num font-semibold">#${m.saleId.slice(-4)}</span>`:''}</td></tr>`;
    }).join('');
  } else {
    $('#mv-body').classList.add('hidden');
    $('#mv-empty').innerHTML = `<span class="w-12 h-12 rounded-2xl bg-paper grid place-items-center mx-auto"><i data-lucide="arrow-left-right" class="w-6 h-6 text-muted"></i></span>
      <p class="font-bold mt-3">Aucun mouvement sur cette période</p><p class="text-sm text-muted mt-1">Enregistrez une vente ou un réapprovisionnement.</p>`;
  }
}

function movementModal(){
  if(!db.products.length) return toast('Ajoutez d\'abord un produit.', 'warn');
  const opts = db.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr'))
    .map(p=>`<option value="${p.id}">${esc(p.name)} — stock : ${fmtQty(p.stock)}</option>`).join('');
  openModal(`${modalHeader('Nouveau mouvement','Enregistrez une entrée, une sortie ou un ajustement manuel')}
    <form id="mv-form" class="px-6 pb-6 pt-2 space-y-3.5">
      <div><label class="${labelCls}">Type de mouvement</label>
        <select name="type" class="${inputCls}">
          <option value="in">Entrée (achat fournisseur)</option>
          <option value="out">Sortie (perte, don, casse…)</option>
          <option value="adj">Ajustement d'inventaire</option>
        </select></div>
      <div><label class="${labelCls}">Produit</label>
        <select name="productId" class="${inputCls}">${opts}</select></div>
      <div><label class="${labelCls}">Quantité</label>
        <input name="qty" type="number" step="any" required class="${inputCls} num" placeholder="0">
        <p id="mv-hint" class="text-[11px] text-muted mt-1"></p></div>
      <div><label class="${labelCls}">Prix unitaire</label>
        <input name="unitPrice" type="number" min="0" step="any" class="${inputCls} num"></div>
      <div><label class="${labelCls}">Note</label>
        <input name="note" type="text" class="${inputCls}" placeholder="Ex : inventaire du mois"></div>
      <p id="mv-error" class="hidden text-xs font-semibold text-danger"></p>
      <div class="flex gap-2.5 pt-1">
        <button type="button" data-action="close-layer" class="flex-1 border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">Annuler</button>
        <button type="submit" class="flex-1 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">Enregistrer</button>
      </div></form>`);
  const f = $('#mv-form'), hint = $('#mv-hint'), up = f.elements.unitPrice;
  const sync = ()=>{
    const p = prod(f.elements.productId.value); if(!p) return;
    if(f.elements.type.value === 'in'){ hint.textContent = 'Quantité ajoutée au stock.'; up.value = p.cost; }
    else if(f.elements.type.value === 'out'){ hint.textContent = 'Quantité retirée du stock.'; up.value = p.price; }
    else { hint.textContent = 'Différence à appliquer (peut être négative). Ex : -2 pour retirer 2.'; up.value = 0; }
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
    if(isNaN(qty) || qty === 0) return err('La quantité ne peut pas être nulle.');
    if(type === 'in'){ p.stock += qty; }
    else if(type === 'out'){
      if(qty > p.stock) return err(`Stock insuffisant : ${fmtQty(p.stock)} disponible.`);
      p.stock -= qty;
    } else {
      if(p.stock + qty < 0) return err(`Le stock ne peut pas être négatif (actuellement ${fmtQty(p.stock)}).`);
      p.stock += qty;
    }
    db.movements.unshift({ id:uid(), type, productId:p.id, qty, unitPrice, date:new Date().toISOString(), note:f.elements.note.value.trim() });
    save(); closeLayer(); renderPage();
    toast('Mouvement enregistré');
  });
}

