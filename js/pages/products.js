/* ════════════════ 7. PRODUITS ════════════════ */
function stockBadge(p){
  const th = thresholdOf(p);
  if(p.stock <= 0) return `<span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-danger bg-danger-soft px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-danger"></span>${t('products.badgeOut')}</span>`;
  if(p.stock <= th) return `<span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-warn bg-warn-soft px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-warn"></span>${t('products.badgeLow', { qty: fmtQty(p.stock) })}</span>`;
  return `<span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent bg-accent-soft px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-accent"></span>${fmtQty(p.stock)} ${esc(p.unit||'')}</span>`;
}

function renderProducts(){
  const cats = [...new Set(db.products.map(p=>p.category).filter(Boolean))].sort();
  $('#prod-cat').innerHTML = `<option value="">${t('products.allCategories')}</option>` + cats.map(c=>`<option ${ui.prodCat===c?'selected':''}>${esc(c)}</option>`).join('');
  $('#prod-sort').value = ui.prodSort;
  let list = db.products.filter(p=>{
    const q = ui.prodSearch.toLowerCase();
    const okQ = !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q);
    const okC = !ui.prodCat || p.category === ui.prodCat;
    return okQ && okC;
  });
  const sorters = { 'name':(a,b)=>a.name.localeCompare(b.name,'fr'), 'stock-asc':(a,b)=>a.stock-b.stock,
                    'margin':(a,b)=>(marginOf(b)??-1)-(marginOf(a)??-1), 'price':(a,b)=>b.price-a.price };
  list.sort(sorters[ui.prodSort]);
  $('#prod-sub').textContent = t('products.summary', { prodCount: db.products.length, catCount: cats.length });
  $('#prod-empty').classList.toggle('hidden', list.length > 0);
  if(list.length){
    $('#prod-body').classList.remove('hidden');
    $('#prod-body').innerHTML = list.map(p=>{
      const m = marginOf(p);
      const del = ui.confirmDel === p.id;
      return `<tr class="hover:bg-panel/70 transition">
        <td class="px-5 py-3.5">
          <p class="font-bold">${esc(p.name)}</p>
          <p class="text-xs text-muted mt-0.5">${esc(p.category||t('products.noCategory'))}${p.sku ? ' · ' + esc(p.sku) : ''}</p></td>
        <td class="px-4 py-3.5 text-right num text-muted">${fmtMoney(p.cost)}</td>
        <td class="px-4 py-3.5 text-right num font-bold">${fmtMoney(p.price)}</td>
        <td class="px-4 py-3.5 text-right num ${m>=15?'text-accent font-bold':'text-muted'}">${m===null?'—':'+'+m.toFixed(0)+' %'}</td>
        <td class="px-4 py-3.5">${stockBadge(p)}</td>
        <td class="px-5 py-3.5">
          <div class="flex items-center justify-end gap-1.5">
            ${del
              ? `<button data-action="confirm-del" data-id="${p.id}" class="text-xs font-bold text-white bg-danger hover:brightness-95 rounded-lg px-3 py-1.5">${t('products.confirmDeleteBtn')}</button>
                 <button data-action="cancel-del" class="text-xs font-semibold text-muted hover:text-ink rounded-lg px-2.5 py-1.5">${t('form.cancel')}</button>`
              : `<button data-action="sell-one" data-id="${p.id}" title="${t('products.titleSell')}" class="w-8 h-8 rounded-lg hover:bg-accent-soft text-accent grid place-items-center"><i data-lucide="shopping-basket" class="w-4 h-4"></i></button>
                 <button data-action="quick-restock" data-id="${p.id}" title="${t('products.titleRestock')}" class="w-8 h-8 rounded-lg hover:bg-accent-soft text-accent grid place-items-center"><i data-lucide="package-plus" class="w-4 h-4"></i></button>
                 <button data-action="edit-product" data-id="${p.id}" title="${t('products.titleEdit')}" class="w-8 h-8 rounded-lg hover:bg-paper text-muted grid place-items-center"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                 <button data-action="del-product" data-id="${p.id}" title="${t('products.titleDelete')}" class="w-8 h-8 rounded-lg hover:bg-danger-soft text-muted hover:text-danger grid place-items-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
          </div></td></tr>`;
    }).join('');
  } else {
    $('#prod-body').classList.add('hidden');
    $('#prod-empty').innerHTML = db.products.length
      ? `<span class="w-12 h-12 rounded-2xl bg-paper grid place-items-center mx-auto"><i data-lucide="search-x" class="w-6 h-6 text-muted"></i></span>
         <p class="font-bold mt-3">${t('products.emptyResults')}</p><p class="text-sm text-muted mt-1">${t('products.emptyResultsHint')}</p>`
      : `<span class="w-12 h-12 rounded-2xl bg-accent-soft grid place-items-center mx-auto"><i data-lucide="package-open" class="w-6 h-6 text-accent"></i></span>
         <p class="font-bold mt-3">${t('products.emptyStock')}</p><p class="text-sm text-muted mt-1">${t('products.emptyStockHint')}</p>
         <button data-action="open-new-product" class="mt-4 bg-accent hover:bg-accent-dark text-white font-semibold text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>${t('products.new')}</button>`;
  }
}

function productForm(p){
  const isNew = !p;
  p = p || { name:'', category:'', sku:'', unit:t('units.piece'), cost:'', price:'', stock:'', threshold:'' };
  const cats = [...new Set(db.products.map(x=>x.category).filter(Boolean))];
  return `${modalHeader(isNew?t('form.newProductTitle'):t('form.editProductTitle'), isNew?t('form.newProductSub'):t('form.editProductSub'))}
    <form id="product-form" class="px-6 pb-6 pt-4 space-y-3.5">
      <div><label class="${labelCls}">${t('form.nameLabel')}</label>
        <input name="name" type="text" required value="${esc(p.name)}" class="${inputCls}" placeholder="${t('form.namePlaceholder')}"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">${t('form.categoryLabel')}</label>
          <input name="category" list="cat-list" type="text" value="${esc(p.category)}" class="${inputCls}" placeholder="${t('form.freeInput')}">
          <datalist id="cat-list">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label class="${labelCls}">${t('form.skuLabel')}</label>
          <input name="sku" type="text" value="${esc(p.sku)}" class="${inputCls}" placeholder="${t('form.optional')}"></div>
      </div>
      <div><label class="${labelCls}">${t('form.unitLabel')}</label>
        <input name="unit" list="unit-list" type="text" value="${esc(p.unit)}" class="${inputCls}">
        <datalist id="unit-list">${UNIT_KEYS.map(u=>`<option value="${t(u)}">`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">${t('form.costLabel')}</label>
          <input name="cost" type="number" min="0" step="any" value="${p.cost}" class="${inputCls} num" placeholder="0"></div>
        <div><label class="${labelCls}">${t('form.priceLabel')}</label>
          <input name="price" type="number" min="0" step="any" required value="${p.price}" class="${inputCls} num" placeholder="0"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">${isNew?t('form.initialStock'):t('form.currentStock')}</label>
          <input name="stock" type="number" min="0" step="any" value="${p.stock}" class="${inputCls} num">
          ${!isNew?`<p class="text-[11px] text-muted mt-1">${t('form.diffAdjustment')}</p>`:''}</div>
        <div><label class="${labelCls}">${t('form.thresholdLabel')}</label>
          <input name="threshold" type="number" min="0" step="1" value="${p.threshold}" class="${inputCls} num" placeholder="${db.settings.defaultThreshold}"></div>
      </div>
      <p id="pf-error" class="hidden text-xs font-semibold text-danger"></p>
      <div class="flex gap-2.5 pt-2">
        <button type="button" data-action="close-layer" class="flex-1 border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">${t('form.cancel')}</button>
        <button type="submit" class="flex-1 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">${isNew?t('form.addProduct'):t('form.save')}</button>
      </div>
    </form>`;
}

function saveProductFromForm(editId){
  const f = $('#product-form');
  const v = name => f.elements[name].value.trim();
  const num = name => parseFloat(f.elements[name].value);
  const err = msg => { const e = $('#pf-error'); e.textContent = msg; e.classList.remove('hidden'); };
  if(!v('name')) return err(t('err.nameRequired'));
  const price = num('price'); if(isNaN(price) || price < 0) return err(t('err.pricePositive'));
  const cost = isNaN(num('cost')) ? 0 : num('cost'); if(cost < 0) return err(t('err.costPositive'));
  const stock = isNaN(num('stock')) ? 0 : num('stock'); if(stock < 0) return err(t('err.stockPositive'));
  const data = { name:v('name'), category:v('category'), sku:v('sku'), unit:v('unit')||t('units.piece'), cost, price,
                 stock, threshold: v('threshold')==='' ? null : Math.max(0, Math.round(num('threshold'))) };
  if(editId){
    const p = prod(editId), diff = data.stock - p.stock;
    Object.assign(p, data);
    if(diff !== 0) db.movements.unshift({ id:uid(), type:'adj', productId:p.id, qty:diff, unitPrice:0, date:new Date().toISOString(), note:t('seed.correctionNote') });
    toast(t('products.updated', { name: esc(p.name) }));
  } else {
    const p = { id:uid(), ...data };
    db.products.push(p);
    if(p.stock > 0) db.movements.unshift({ id:uid(), type:'in', productId:p.id, qty:p.stock, unitPrice:p.cost, date:new Date().toISOString(), note:t('seed.initialStockNote') });
    toast(t('products.addedToStock', { name: esc(p.name) }));
  }
  save(); closeLayer(); renderPage();
}

function restockModal(p){
  openModal(`${modalHeader(t('restock.title'), esc(p.name))}
    <form id="restock-form" class="px-6 pb-6 pt-2 space-y-3.5">
      <div class="bg-accent-soft rounded-2xl px-4 py-3 text-sm">
        <span class="text-muted font-semibold">${t('restock.currentStock')}</span>
        <span class="num font-extrabold text-accent ml-1">${fmtQty(p.stock)} ${esc(p.unit||'')}</span></div>
      <div><label class="${labelCls}">${t('restock.qtyLabel')}</label>
        <input name="qty" type="number" min="0.01" step="any" required autofocus class="${inputCls} num" placeholder="0"></div>
      <div><label class="${labelCls}">${t('restock.costLabel')}</label>
        <input name="cost" type="number" min="0" step="any" value="${p.cost}" class="${inputCls} num">
        <p class="text-[11px] text-muted mt-1">${t('restock.costHint')}</p></div>
      <div><label class="${labelCls}">${t('restock.noteLabel')}</label>
        <input name="note" type="text" class="${inputCls}" placeholder="${t('restock.notePlaceholder')}"></div>
      <div class="flex gap-2.5 pt-1">
        <button type="button" data-action="close-layer" class="flex-1 border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">${t('form.cancel')}</button>
        <button type="submit" class="flex-1 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">${t('restock.submit')}</button>
      </div></form>`);
  $('#restock-form').addEventListener('submit', e=>{
    e.preventDefault();
    const qty = parseFloat(e.target.qty.value);
    if(isNaN(qty) || qty <= 0) return;
    const cost = parseFloat(e.target.cost.value);
    if(!isNaN(cost) && cost >= 0) p.cost = cost;
    p.stock += qty;
    db.movements.unshift({ id:uid(), type:'in', productId:p.id, qty, unitPrice:p.cost, date:new Date().toISOString(), note:e.target.note.value.trim() || t('restock.defaultNote') });
    save(); closeLayer(); renderPage();
    toast(`+${fmtQty(qty)} ${esc(p.unit||'')} · ${esc(p.name)}`);
  });
}

