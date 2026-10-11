/* ════════════════ 7. PRODUITS ════════════════ */
function stockBadge(p){
  const th = thresholdOf(p);
  if(p.stock <= 0) return `<span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-danger bg-danger-soft px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-danger"></span>Rupture</span>`;
  if(p.stock <= th) return `<span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-warn bg-warn-soft px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-warn"></span>Stock bas · ${fmtQty(p.stock)}</span>`;
  return `<span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent bg-accent-soft px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-accent"></span>${fmtQty(p.stock)} ${esc(p.unit||'')}</span>`;
}

function renderProducts(){
  const cats = [...new Set(db.products.map(p=>p.category).filter(Boolean))].sort();
  $('#prod-cat').innerHTML = `<option value="">Toutes catégories</option>` + cats.map(c=>`<option ${ui.prodCat===c?'selected':''}>${esc(c)}</option>`).join('');
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
  $('#prod-sub').textContent = `${db.products.length} référence${db.products.length>1?'s':''} · ${cats.length} catégorie${cats.length>1?'s':''}`;
  $('#prod-empty').classList.toggle('hidden', list.length > 0);
  if(list.length){
    $('#prod-body').classList.remove('hidden');
    $('#prod-body').innerHTML = list.map(p=>{
      const m = marginOf(p);
      const del = ui.confirmDel === p.id;
      return `<tr class="hover:bg-panel/70 transition">
        <td class="px-5 py-3.5">
          <p class="font-bold">${esc(p.name)}</p>
          <p class="text-xs text-muted mt-0.5">${esc(p.category||'Sans catégorie')}${p.sku ? ' · ' + esc(p.sku) : ''}</p></td>
        <td class="px-4 py-3.5 text-right num text-muted">${fmtMoney(p.cost)}</td>
        <td class="px-4 py-3.5 text-right num font-bold">${fmtMoney(p.price)}</td>
        <td class="px-4 py-3.5 text-right num ${m>=15?'text-accent font-bold':'text-muted'}">${m===null?'—':'+'+m.toFixed(0)+' %'}</td>
        <td class="px-4 py-3.5">${stockBadge(p)}</td>
        <td class="px-5 py-3.5">
          <div class="flex items-center justify-end gap-1.5">
            ${del
              ? `<button data-action="confirm-del" data-id="${p.id}" class="text-xs font-bold text-white bg-danger hover:brightness-95 rounded-lg px-3 py-1.5">Supprimer ?</button>
                 <button data-action="cancel-del" class="text-xs font-semibold text-muted hover:text-ink rounded-lg px-2.5 py-1.5">Annuler</button>`
              : `<button data-action="sell-one" data-id="${p.id}" title="Vendre" class="w-8 h-8 rounded-lg hover:bg-accent-soft text-accent grid place-items-center"><i data-lucide="shopping-basket" class="w-4 h-4"></i></button>
                 <button data-action="quick-restock" data-id="${p.id}" title="Réapprovisionner" class="w-8 h-8 rounded-lg hover:bg-accent-soft text-accent grid place-items-center"><i data-lucide="package-plus" class="w-4 h-4"></i></button>
                 <button data-action="edit-product" data-id="${p.id}" title="Modifier" class="w-8 h-8 rounded-lg hover:bg-paper text-muted grid place-items-center"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                 <button data-action="del-product" data-id="${p.id}" title="Supprimer" class="w-8 h-8 rounded-lg hover:bg-danger-soft text-muted hover:text-danger grid place-items-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
          </div></td></tr>`;
    }).join('');
  } else {
    $('#prod-body').classList.add('hidden');
    $('#prod-empty').innerHTML = db.products.length
      ? `<span class="w-12 h-12 rounded-2xl bg-paper grid place-items-center mx-auto"><i data-lucide="search-x" class="w-6 h-6 text-muted"></i></span>
         <p class="font-bold mt-3">Aucun résultat</p><p class="text-sm text-muted mt-1">Essayez une autre recherche ou catégorie.</p>`
      : `<span class="w-12 h-12 rounded-2xl bg-accent-soft grid place-items-center mx-auto"><i data-lucide="package-open" class="w-6 h-6 text-accent"></i></span>
         <p class="font-bold mt-3">Votre stock est vide</p><p class="text-sm text-muted mt-1">Ajoutez votre premier produit pour démarrer.</p>
         <button data-action="open-new-product" class="mt-4 bg-accent hover:bg-accent-dark text-white font-semibold text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Nouveau produit</button>`;
  }
}

function productForm(p){
  const isNew = !p;
  p = p || { name:'', category:'', sku:'', unit:'pièce', cost:'', price:'', stock:'', threshold:'' };
  const cats = [...new Set(db.products.map(x=>x.category).filter(Boolean))];
  return `${modalHeader(isNew?'Nouveau produit':'Modifier le produit', isNew?'Ajoutez une référence à votre stock':'Les modifications sont enregistrées immédiatement')}
    <form id="product-form" class="px-6 pb-6 pt-4 space-y-3.5">
      <div><label class="${labelCls}">Nom du produit *</label>
        <input name="name" type="text" required value="${esc(p.name)}" class="${inputCls}" placeholder="Ex : Riz parfumé 25 kg"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">Catégorie</label>
          <input name="category" list="cat-list" type="text" value="${esc(p.category)}" class="${inputCls}" placeholder="Libre">
          <datalist id="cat-list">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label class="${labelCls}">Référence</label>
          <input name="sku" type="text" value="${esc(p.sku)}" class="${inputCls}" placeholder="Optionnel"></div>
      </div>
      <div><label class="${labelCls}">Unité</label>
        <input name="unit" list="unit-list" type="text" value="${esc(p.unit)}" class="${inputCls}">
        <datalist id="unit-list">${UNITS.map(u=>`<option value="${u}">`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">Prix d'achat</label>
          <input name="cost" type="number" min="0" step="any" value="${p.cost}" class="${inputCls} num" placeholder="0"></div>
        <div><label class="${labelCls}">Prix de vente *</label>
          <input name="price" type="number" min="0" step="any" required value="${p.price}" class="${inputCls} num" placeholder="0"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">${isNew?'Stock initial':'Stock actuel'}</label>
          <input name="stock" type="number" min="0" step="any" value="${p.stock}" class="${inputCls} num">
          ${!isNew?'<p class="text-[11px] text-muted mt-1">Toute différence crée un ajustement tracé.</p>':''}</div>
        <div><label class="${labelCls}">Seuil d'alerte</label>
          <input name="threshold" type="number" min="0" step="1" value="${p.threshold}" class="${inputCls} num" placeholder="${db.settings.defaultThreshold}"></div>
      </div>
      <p id="pf-error" class="hidden text-xs font-semibold text-danger"></p>
      <div class="flex gap-2.5 pt-2">
        <button type="button" data-action="close-layer" class="flex-1 border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">Annuler</button>
        <button type="submit" class="flex-1 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">${isNew?'Ajouter le produit':'Enregistrer'}</button>
      </div>
    </form>`;
}

function saveProductFromForm(editId){
  const f = $('#product-form');
  const v = name => f.elements[name].value.trim();
  const num = name => parseFloat(f.elements[name].value);
  const err = msg => { const e = $('#pf-error'); e.textContent = msg; e.classList.remove('hidden'); };
  if(!v('name')) return err('Le nom du produit est obligatoire.');
  const price = num('price'); if(isNaN(price) || price < 0) return err('Le prix de vente doit être un nombre positif.');
  const cost = isNaN(num('cost')) ? 0 : num('cost'); if(cost < 0) return err('Le prix d\'achat doit être positif.');
  const stock = isNaN(num('stock')) ? 0 : num('stock'); if(stock < 0) return err('Le stock doit être positif.');
  const data = { name:v('name'), category:v('category'), sku:v('sku'), unit:v('unit')||'pièce', cost, price,
                 stock, threshold: v('threshold')==='' ? null : Math.max(0, Math.round(num('threshold'))) };
  if(editId){
    const p = prod(editId), diff = data.stock - p.stock;
    Object.assign(p, data);
    if(diff !== 0) db.movements.unshift({ id:uid(), type:'adj', productId:p.id, qty:diff, unitPrice:0, date:new Date().toISOString(), note:'Correction de stock' });
    toast(`« ${esc(p.name)} » mis à jour`);
  } else {
    const p = { id:uid(), ...data };
    db.products.push(p);
    if(p.stock > 0) db.movements.unshift({ id:uid(), type:'in', productId:p.id, qty:p.stock, unitPrice:p.cost, date:new Date().toISOString(), note:'Stock initial' });
    toast(`« ${esc(p.name)} » ajouté au stock`);
  }
  save(); closeLayer(); renderPage();
}

function restockModal(p){
  openModal(`${modalHeader('Réapprovisionner', esc(p.name))}
    <form id="restock-form" class="px-6 pb-6 pt-2 space-y-3.5">
      <div class="bg-accent-soft rounded-2xl px-4 py-3 text-sm">
        <span class="text-muted font-semibold">Stock actuel :</span>
        <span class="num font-extrabold text-accent ml-1">${fmtQty(p.stock)} ${esc(p.unit||'')}</span></div>
      <div><label class="${labelCls}">Quantité reçue</label>
        <input name="qty" type="number" min="0.01" step="any" required autofocus class="${inputCls} num" placeholder="0"></div>
      <div><label class="${labelCls}">Prix d'achat unitaire</label>
        <input name="cost" type="number" min="0" step="any" value="${p.cost}" class="${inputCls} num">
        <p class="text-[11px] text-muted mt-1">Modifiable si le prix fournisseur a changé.</p></div>
      <div><label class="${labelCls}">Note</label>
        <input name="note" type="text" class="${inputCls}" placeholder="Ex : Livraison grossiste"></div>
      <div class="flex gap-2.5 pt-1">
        <button type="button" data-action="close-layer" class="flex-1 border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">Annuler</button>
        <button type="submit" class="flex-1 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">Ajouter au stock</button>
      </div></form>`);
  $('#restock-form').addEventListener('submit', e=>{
    e.preventDefault();
    const qty = parseFloat(e.target.qty.value);
    if(isNaN(qty) || qty <= 0) return;
    const cost = parseFloat(e.target.cost.value);
    if(!isNaN(cost) && cost >= 0) p.cost = cost;
    p.stock += qty;
    db.movements.unshift({ id:uid(), type:'in', productId:p.id, qty, unitPrice:p.cost, date:new Date().toISOString(), note:e.target.note.value.trim() || 'Réapprovisionnement' });
    save(); closeLayer(); renderPage();
    toast(`+${fmtQty(qty)} ${esc(p.unit||'')} · ${esc(p.name)}`);
  });
}

