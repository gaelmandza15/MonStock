/* ════════════════ 11. ÉVÉNEMENTS ════════════════ */
document.addEventListener('click', async e=>{
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
      toast(t('products.deleteDone', { name: esc(p.name) }), 'warn'); break;
    }
    case 'quick-restock': restockModal(prod(id)); break;
    case 'sell-one': navigate('sell'); setTimeout(()=>sellAdd(id), 60); break;

    case 'sell-add': sellAdd(id); break;
    case 'cart-inc': { const l = ui.cart.find(x=>x.productId===id); if(l) cartSetQty(id, l.qty+1); break; }
    case 'cart-dec': { const l = ui.cart.find(x=>x.productId===id); if(l) cartSetQty(id, l.qty-1); break; }
    case 'cart-rm': cartSetQty(id, 0); break;
    case 'clear-cart': ui.cart = []; ui.cash=''; ui.customer=''; $('#cash-input').value=''; $('#sell-customer').value=''; renderSell(); icons(); break;
    case 'quick-cash': $('#cash-input').value = el.dataset.v; renderChange(); break;
    case 'checkout': checkout(); break;

    case 'new-movement': movementModal(); break;

    case 'new-invoice': openNewInvoice(); break;
    case 'invoice-view': invoiceViewModal(id); break;
    case 'invoice-print': printInvoice(id); break;
    case 'invoice-export-txt': { const iv = db.invoices.find(x=>x.id===id); if(iv) exportInvoiceTxt(iv); break; }
    case 'invoice-edit': openEditInvoice(id); break;
    case 'invoice-del': deleteInvoice(id); break;
    case 'export-invoices-csv': exportInvoicesCsv(); break;
    case 'snapshot-restore': await restoreSnapshot(el.dataset.name); break;
    case 'snapshot-del': await deleteSnapshot(el.dataset.name); break;
    case 'mv-type': ui.mvType = el.dataset.v; renderMovements(); icons(); break;

    case 'save-settings': saveSettings(); break;
    case 'export-json': downloadFile('klarstock-sauvegarde.json', JSON.stringify(db, null, 2), 'application/json'); toast(t('settings.jsonDownloaded')); break;
    case 'import-json': $('#import-file').click(); break;
    case 'export-db': {
      if(!sqliteDb){ toast(t('settings.sqliteUnavailable'), 'warn'); break; }
      const bytes = await dbExportDb();
      if(IS_TAURI){
        /* Sous Tauri : on écrit directement dans un fichier choisi par l'utilisateur. */
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ defaultPath: 'klarstock.db',
          filters: [{ name: 'SQLite', extensions: ['db'] }] });
        if(!path) break;
        await window.__TAURI__.core.invoke('write_file_bytes', { path, bytes: Array.from(bytes) });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.sqlite3'}));
        a.download = 'klarstock.db'; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      }
      toast(t('settings.dbDownloaded')); break;
    }
    case 'import-db': $('#import-db-file').click(); break;
    case 'export-products-csv':
      exportCsv([t('csv.productsHeader').split(';'),
        ...db.products.map(p=>[p.name,p.category,p.sku,p.unit,p.cost,p.price,p.stock,p.threshold??db.settings.defaultThreshold])],
        'klarstock-produits.csv'); break;
    case 'export-sales-csv': {
      const sales = db.movements.filter(m=>m.type==='out' && m.saleId);
      exportCsv([t('csv.salesHeader').split(';'),
        ...sales.map(m=>[fmtDate(m.date), '#'+m.saleId.slice(-4), prod(m.productId)?.name||'', m.qty, m.unitPrice, m.qty*m.unitPrice])],
        'klarstock-ventes.csv'); break;
    }
    case 'reset-data': openModal(`${modalHeader(t('reset.title'), t('reset.sub'))}
      <div class="px-6 pb-6 pt-3 space-y-2.5">
        <button data-action="load-demo" class="w-full bg-accent hover:bg-accent-dark text-white font-bold text-sm py-3 rounded-xl">${t('reset.loadDemo')}</button>
        <button data-action="wipe-all" class="w-full bg-danger hover:brightness-95 text-white font-bold text-sm py-3 rounded-xl">${t('reset.wipeAll')}</button>
        <button data-action="close-layer" class="w-full border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">${t('form.cancel')}</button></div>`); break;
    case 'load-demo': await snapshotCreate(); db = seed(true); await dbReset(db); closeLayer(); navigate('dashboard'); toast(t('reset.demoLoaded')); break;
    case 'wipe-all': await snapshotCreate(); db = seed(false); await dbReset(db); closeLayer(); navigate('dashboard'); toast(t('reset.wiped'), 'warn'); break;
  }
});

document.addEventListener('submit', e=>{
  if(e.target.id === 'product-form'){ e.preventDefault(); saveProductFromForm($('#product-form').dataset.edit || null); }
});
document.addEventListener('input', e=>{
  if(e.target.id === 'prod-search'){ ui.prodSearch = e.target.value; renderProducts(); icons(); }
  if(e.target.id === 'sell-search'){ ui.sellSearch = e.target.value; renderSell(); icons(); }
  if(e.target.id === 'sell-customer'){ ui.customer = e.target.value; }
  if(e.target.id === 'inv-search'){ ui.invSearch = e.target.value; renderInvoices(); icons(); }
  if(e.target.id === 'cash-input'){ renderChange(); }
  if(e.target.dataset?.action === 'cart-set'){ /* géré au change */ }
});
document.addEventListener('change', e=>{
  if(e.target.id === 'prod-cat'){ ui.prodCat = e.target.value; renderProducts(); icons(); }
  if(e.target.id === 'sell-cat-select'){ ui.sellCat = e.target.value; renderSell(); icons(); }
  if(e.target.id === 'prod-sort'){ ui.prodSort = e.target.value; renderProducts(); icons(); }
  if(e.target.id === 'mv-range'){ ui.mvRange = parseInt(e.target.value); renderMovements(); icons(); }
  if(e.target.id === 'inv-status'){ ui.invStatus = e.target.value; renderInvoices(); icons(); }
  if(e.target.id === 'set-lang-sidebar' || e.target.id === 'set-lang-mobile'){ setLang(e.target.value); }
  if(e.target.id === 'set-currency'){ const d = e.target.selectedOptions[0].dataset.d; if(d!==undefined) $('#set-decimals').value = d; }
  if(e.target.dataset?.action === 'cart-set'){ cartSetQty(e.target.dataset.id, parseFloat(e.target.value)); }
});
document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeLayer(); });
 $('#import-file').addEventListener('change', async e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data.settings || !Array.isArray(data.products) || !Array.isArray(data.movements)) throw 0;
      replaceDb(data); await dbSave(db); renderPage(); updateChrome();
      toast(t('settings.restoreToast', { n: db.products.length }));
    }catch(_){ toast(t('settings.invalidFile'), 'err'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});
$('#import-db-file').addEventListener('change', async e=>{
  const file = e.target.files[0]; if(!file) return;
  try{
    await dbImportDb(file);
    replaceDb(dbLoad()); renderPage(); updateChrome();
    toast(t('settings.dbRestored'));
  }catch(_){ toast(t('settings.invalidDbFile'), 'err'); }
  e.target.value = '';
});

/* ════════════════ 12. DÉMARRAGE ════════════════ */
(async function boot(){
  try{
    if(IS_TAURI) await cfgInit();   /* config lue depuis le disque avant tout usage */
    await initSqlite();
    const stored = await dbLoad();
    if(stored && (stored.products.length || stored.movements.length || stored.invoices.length
                 || (stored.settings.shopName !== '' && !load()))){
      replaceDb(stored);
    } else {
      await dbSave(db);          /* première base : écriture du jeu de démo */
    }
  }catch(err){
    console.error('SQLite indisponible, repli localStorage :', err);
    saveLegacy(db);
    setTimeout(()=> toast(t('settings.sqliteUnavailable'), 'warn'), 700);
  }
  navigate('dashboard');
  if(db.settings.shopName === t('seed.demoShopName')){
    setTimeout(()=> toast(t('welcome.toast')), 700);
  }
})();
