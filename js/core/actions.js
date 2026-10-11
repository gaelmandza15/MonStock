/* ════════════════ 11. ÉVÉNEMENTS ════════════════ */
document.addEventListener('click', e=>{
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  switch(a){
    case 'nav': e.preventDefault(); navigate(el.dataset.page); break;
    case 'open-sidebar': openSidebar(); break;
    case 'close-sidebar': closeSidebar(); break;
    case 'close-layer': closeLayer(); break;

    case 'open-new-product': openDrawer(productForm(null)); break;
    case 'edit-product': openDrawer(productForm(prod(id))); break;
    case 'save-product': saveProductFromForm(el.dataset.edit || null); break;
    case 'del-product': ui.confirmDel = id; renderProducts(); icons(); break;
    case 'cancel-del': ui.confirmDel = null; renderProducts(); icons(); break;
    case 'confirm-del': {
      const p = prod(id);
      db.products = db.products.filter(x=>x.id!==id);
      ui.cart = ui.cart.filter(l=>l.productId!==id);
      ui.confirmDel = null; save(); renderPage();
      toast(`« ${esc(p.name)} » supprimé`, 'warn'); break;
    }
    case 'quick-restock': restockModal(prod(id)); break;
    case 'sell-one': navigate('sell'); setTimeout(()=>sellAdd(id), 60); break;

    case 'sell-cat': ui.sellCat = el.dataset.cat==='Toutes' ? '' : el.dataset.cat; renderSell(); icons(); break;
    case 'sell-add': sellAdd(id); break;
    case 'cart-inc': { const l = ui.cart.find(x=>x.productId===id); if(l) cartSetQty(id, l.qty+1); break; }
    case 'cart-dec': { const l = ui.cart.find(x=>x.productId===id); if(l) cartSetQty(id, l.qty-1); break; }
    case 'cart-rm': cartSetQty(id, 0); break;
    case 'clear-cart': ui.cart = []; ui.cash=''; $('#cash-input').value=''; renderSell(); icons(); break;
    case 'quick-cash': $('#cash-input').value = el.dataset.v; renderChange(); break;
    case 'checkout': checkout(); break;

    case 'new-movement': movementModal(); break;
    case 'mv-type': ui.mvType = el.dataset.v; renderMovements(); icons(); break;

    case 'save-settings': saveSettings(); break;
    case 'export-json': downloadFile('monstock-sauvegarde.json', JSON.stringify(db, null, 2), 'application/json'); toast('Sauvegarde JSON téléchargée'); break;
    case 'import-json': $('#import-file').click(); break;
    case 'export-products-csv':
      exportCsv([['Nom','Catégorie','Référence','Unité','Prix achat','Prix vente','Stock','Seuil'],
        ...db.products.map(p=>[p.name,p.category,p.sku,p.unit,p.cost,p.price,p.stock,p.threshold??db.settings.defaultThreshold])],
        'monstock-produits.csv'); break;
    case 'export-sales-csv': {
      const sales = db.movements.filter(m=>m.type==='out' && m.saleId);
      exportCsv([['Date','Vente','Produit','Quantité','Prix unitaire','Total'],
        ...sales.map(m=>[fmtDate(m.date), '#'+m.saleId.slice(-4), prod(m.productId)?.name||'', m.qty, m.unitPrice, m.qty*m.unitPrice])],
        'monstock-ventes.csv'); break;
    }
    case 'reset-data': openModal(`${modalHeader('Réinitialiser les données','Cette action est irréversible.')}
      <div class="px-6 pb-6 pt-3 space-y-2.5">
        <button data-action="load-demo" class="w-full bg-accent hover:bg-accent-dark text-white font-bold text-sm py-3 rounded-xl shadow-soft">Recharger les données de démonstration</button>
        <button data-action="wipe-all" class="w-full bg-danger hover:brightness-95 text-white font-bold text-sm py-3 rounded-xl shadow-soft">Tout effacer (boutique vide)</button>
        <button data-action="close-layer" class="w-full border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">Annuler</button></div>`); break;
    case 'load-demo': db = seed(true); save(); closeLayer(); navigate('dashboard'); toast('Données de démonstration rechargées'); break;
    case 'wipe-all': db = seed(false); save(); closeLayer(); navigate('dashboard'); toast('Toutes les données ont été effacées', 'warn'); break;
  }
});

document.addEventListener('submit', e=>{
  if(e.target.id === 'product-form'){ e.preventDefault(); saveProductFromForm($('#product-form').dataset.edit || null); }
});
document.addEventListener('input', e=>{
  if(e.target.id === 'prod-search'){ ui.prodSearch = e.target.value; renderProducts(); icons(); }
  if(e.target.id === 'sell-search'){ ui.sellSearch = e.target.value; renderSell(); icons(); }
  if(e.target.id === 'cash-input'){ renderChange(); }
  if(e.target.dataset?.action === 'cart-set'){ /* géré au change */ }
});
document.addEventListener('change', e=>{
  if(e.target.id === 'prod-cat'){ ui.prodCat = e.target.value; renderProducts(); icons(); }
  if(e.target.id === 'prod-sort'){ ui.prodSort = e.target.value; renderProducts(); icons(); }
  if(e.target.id === 'mv-range'){ ui.mvRange = parseInt(e.target.value); renderMovements(); icons(); }
  if(e.target.id === 'set-currency'){ const d = e.target.selectedOptions[0].dataset.d; if(d!==undefined) $('#set-decimals').value = d; }
  if(e.target.dataset?.action === 'cart-set'){ cartSetQty(e.target.dataset.id, parseFloat(e.target.value)); }
});
document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeLayer(); });
 $('#import-file').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data.settings || !Array.isArray(data.products) || !Array.isArray(data.movements)) throw 0;
      db = data; save(); renderPage();
      toast(`Sauvegarde restaurée : ${db.products.length} produits`);
    }catch(_){ toast('Fichier invalide : restauration impossible.', 'err'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ════════════════ 12. DÉMARRAGE ════════════════ */
navigate('dashboard');
if(db.settings.shopName === 'Chez Awa Boutique'){
  setTimeout(()=> toast('Bienvenue ! Des données de démonstration sont chargées — effacez-les depuis <b>Paramètres</b>.'), 700);
}
