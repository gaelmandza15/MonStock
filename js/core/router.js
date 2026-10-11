/* ════════════════ 5. RENDU GLOBAL ════════════════ */
const PAGES = ['dashboard','products','sell','movements','settings'];

function navigate(p){
  page = p;
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
  $('#sb-shop').textContent = db.settings.shopName;
  $('#mb-shop').textContent = db.settings.shopName;
  $('#sb-value').textContent = fmtMoney(stockValue());
  $('#sb-refs').textContent = `${db.products.length} référence${db.products.length>1?'s':''} en stock`;
  const n = alerts().length;
  if(n > 0){
    $('#sb-refs').innerHTML += ` · <span class="text-warn font-bold">${n} alerte${n>1?'s':''}</span>`;
  }
}

function renderPage(){
  updateChrome();
  const map = { dashboard:renderDashboard, products:renderProducts, sell:renderSell, movements:renderMovements, settings:renderSettings };
  map[page]();
  icons();
}

