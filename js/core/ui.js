/* ════════════════ 4. PRIMITIVES UI ════════════════ */
function toast(msg, type='ok'){
  const conf = { ok:{i:'check-circle-2', c:'text-accent'}, warn:{i:'alert-triangle', c:'text-warn'}, err:{i:'x-circle', c:'text-danger'} }[type];
  const el = document.createElement('div');
  el.className = 'anim-toast bg-white shadow-pop rounded-2xl px-4 py-3.5 flex items-start gap-3';
  el.innerHTML = `<i data-lucide="${conf.i}" class="w-5 h-5 mt-0.5 ${conf.c} shrink-0"></i>
                  <p class="text-sm font-semibold leading-snug flex-1">${msg}</p>
                  <button class="text-muted hover:text-ink shrink-0" onclick="this.parentElement.remove()"><i data-lucide="x" class="w-4 h-4"></i></button>`;
  $('#toasts').appendChild(el); icons();
  setTimeout(()=>{ el.style.transition='opacity .3s, transform .3s'; el.style.opacity='0'; el.style.transform='translateY(8px)';
                   setTimeout(()=>el.remove(), 300); }, 3800);
}

function openLayer(html){
  $('#layer').innerHTML = `<div class="fixed inset-0 z-50">
    <div class="absolute inset-0 bg-ink/45" data-action="close-layer"></div>${html}</div>`;
  icons();
}
function closeLayer(){ $('#layer').innerHTML=''; }
function openModal(inner){
  openLayer(`<div class="absolute inset-0 grid place-items-center p-4 overflow-y-auto">
    <div class="anim-modal bg-white rounded-3xl shadow-pop w-full max-w-md my-8">${inner}</div></div>`);
}
function openDrawer(inner){
  openLayer(`<div class="absolute inset-y-0 right-0 w-full max-w-[440px] p-3 sm:p-4 flex">
    <div class="anim-drawer bg-white rounded-3xl shadow-pop w-full overflow-y-auto">${inner}</div></div>`);
}
function modalHeader(title, sub){
  return `<div class="flex items-start justify-between px-6 pt-6">
    <div><h3 class="font-extrabold text-lg">${title}</h3>${sub?`<p class="text-xs text-muted mt-0.5">${sub}</p>`:''}</div>
    <button data-action="close-layer" class="w-8 h-8 rounded-lg hover:bg-paper grid place-items-center text-muted"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
}
const inputCls = 'mt-1.5 w-full bg-paper border border-line rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft';
const labelCls = 'text-xs font-bold uppercase tracking-wide text-muted';

