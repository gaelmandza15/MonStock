/* ════════════════ 5. RENDU GLOBAL ════════════════ */
const PAGES = ['dashboard','products','sell','movements','settings'];

function navigate(p){
  page = p; ui.confirmDel = null;
  PAGES.forEach(id => $('#page-'+id).classList.toggle('hidden', id !== p));
  document.querySelectorAll('.nav-item').forEach(a=>{
    const on = a.dataset.page === p;
    a.classList.toggle('bg-accent-soft', on); a.classList.toggle('text-accent', on);
    a.classList.toggle('text-muted', !on); a.classList.toggle('hover:bg-paper', !on);
  });
  closeSidebar(); renderPage();
}
function closeSidebar(){ $('#sidebar').classList.add('-translate-x-full'); $('#overlay').classList.add('hidden'); }
function openSidebar(){ $('#sidebar').classList.remove('-translate-x-full'); $('#overlay').classList.remove('hidden'); }

function updateChrome(){
  /* Libellés de navigation (statiques, via data-i18n) + sélecteur de langue. */
  applyStaticI18n();
  $('#sb-shop').textContent = db.settings.shopName;
  $('#mb-shop').textContent = db.settings.shopName;
  $('#sb-value-label').textContent = t('sidebar.stockValueTitle');
  $('#sb-value').textContent = fmtMoney(stockValue());
  const n = alerts().length;
  $('#sb-refs').innerHTML = t('sidebar.refs', {n:db.products.length}) +
    (n > 0 ? ` · <span class="text-warn font-bold">${t('sidebar.alertsSuffix',{n})}</span>` : '');
  renderLangSwitches();
}

function renderPage(){
  updateChrome();
  const map = { dashboard:renderDashboard, products:renderProducts, sell:renderSell, movements:renderMovements, settings:renderSettings };
  map[page]();
  icons();
}
