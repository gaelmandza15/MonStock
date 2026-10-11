/* ════════════════ 10. FACTURATION ════════════════ */
/* Règle i18n : aucun texte destinataire avec accents ni devise en dur — tout passe par t('...'). */

const INV_STATUSES = ['draft', 'sent', 'paid', 'void'];

function invoiceOf(saleId){ return db.invoices.find(i => i.saleId === saleId); }
function invTotal(inv){ return inv.lines.reduce((s,l)=> s + l.qty*l.price, 0); }
function invDisplayTotal(inv){ const taxPct = db.settings.taxRate || 0; return invTotal(inv) * (1 + taxPct/100); }
const INV_STATUS_KEYS = { draft:'invoices.status.draft', sent:'invoices.status.sent',
                          paid:'invoices.status.paid', void:'invoices.status.void' };
function invStatusLabel(st){ return t(INV_STATUS_KEYS[st] || 'invoices.status.draft'); }
function invStatusClass(st){
  return { draft:'text-warn bg-warn-soft', sent:'text-info bg-info-soft',
           paid:'text-accent bg-accent-soft', void:'text-muted bg-paper' }[st] || 'text-muted bg-paper';
}
function nextInvNumber(){
  const y = new Date().getFullYear();
  const seq = db.invoices.filter(i => i.number && i.number.indexOf('F-' + y) === 0).length + 1;
  return 'F-' + y + '-' + String(seq).padStart(4, '0');
}

/* Construit une facture à partir des mouvements de vente (saleId). */
function buildInvoice(saleId, customer){
  const mv = db.movements.filter(m => m.saleId === saleId);
  if(!mv.length) return null;
  const lines = mv.map(m => {
    const p = prod(m.productId);
    return { productId:m.productId, name:p ? p.name : t('movements.deletedProduct'), unit:p ? p.unit : '', qty:m.qty, price:m.unitPrice };
  });
  return { id:uid(), number:nextInvNumber(), saleId, date:mv[0].date,
           customer:(customer || '').trim() || t('invoices.walkIn'), status:'paid', lines };
}

/* Rattachement / création de facture pour les ventes historiques sans pièce jointe. */
function ensureInvoices(){
  let changed = false;
  const seen = new Set(db.invoices.map(i => i.saleId));
  const bySale = {};
  db.movements.forEach(m => { if(m.type === 'out' && m.saleId) (bySale[m.saleId] = bySale[m.saleId] || []).push(m); });
  Object.keys(bySale).forEach(sid => {
    if(seen.has(sid)) return;
    const inv = buildInvoice(sid, '');
    if(inv){ inv.date = bySale[sid][0].date; db.invoices.push(inv); changed = true; }
  });
  if(changed) save();
}

/* ── Rendu de la page ─────────────────────────────── */
function renderInvoices(){
  ensureInvoices();
  const sel = $('#inv-status');
  sel.innerHTML = `<option value="all">${t('invoices.filterAll')}</option>` +
    INV_STATUSES.map(s => `<option value="${s}">${invStatusLabel(s)}</option>`).join('');
  sel.value = ui.invStatus;

  const q = ui.invSearch.toLowerCase();
  const list = db.invoices
    .filter(i => ui.invStatus === 'all' || i.status === ui.invStatus)
    .filter(i => !q || i.number.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q) ||
                 i.lines.some(l => l.name.toLowerCase().includes(q)))
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  $('#inv-empty').classList.toggle('hidden', list.length > 0);
  if(list.length){
    $('#inv-body').innerHTML = list.slice(0, 200).map(i => {
      const items = i.lines.reduce((s,l) => s + l.qty, 0);
      return `<tr class="hover:bg-panel/70 transition">
        <td class="px-5 py-3 num font-bold whitespace-nowrap">${esc(i.number)}</td>
        <td class="px-4 py-3 num text-muted whitespace-nowrap">${fmtDate(i.date)}</td>
        <td class="px-4 py-3 font-semibold max-w-[180px] truncate">${esc(i.customer)}</td>
        <td class="px-4 py-3 text-right num">${fmtQty(items)}</td>
        <td class="px-4 py-3 text-right num font-extrabold">${fmtMoney(invDisplayTotal(i))}</td>
        <td class="px-4 py-3"><span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${invStatusClass(i.status)}">${invStatusLabel(i.status)}</span></td>
        <td class="px-5 py-3">
          <div class="flex items-center justify-end gap-1.5">
            <button data-action="invoice-view" data-id="${i.id}" title="${t('invoices.view')}" aria-label="${t('invoices.view')}"
              class="w-8 h-8 rounded-lg bg-paper hover:bg-line grid place-items-center"><i data-lucide="eye" class="w-4 h-4"></i></button>
            <button data-action="invoice-print" data-id="${i.id}" title="${t('invoices.print')}" aria-label="${t('invoices.print')}"
              class="w-8 h-8 rounded-lg bg-paper hover:bg-line grid place-items-center"><i data-lucide="printer" class="w-4 h-4"></i></button>
            <button data-action="invoice-edit" data-id="${i.id}" title="${t('invoices.edit')}" aria-label="${t('invoices.edit')}"
              class="w-8 h-8 rounded-lg bg-paper hover:bg-line grid place-items-center"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button data-action="invoice-del" data-id="${i.id}" title="${t('invoices.delete')}" aria-label="${t('invoices.delete')}"
              class="w-8 h-8 rounded-lg bg-paper hover:bg-danger-soft text-muted hover:text-danger grid place-items-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div></td></tr>`;
    }).join('');
  } else {
    $('#inv-body').innerHTML = '';
    $('#inv-empty').innerHTML = `<span class="w-12 h-12 rounded-2xl bg-paper grid place-items-center mx-auto"><i data-lucide="receipt-text" class="w-6 h-6 text-muted"></i></span>
      <p class="font-bold mt-3">${t('invoices.emptyTitle')}</p><p class="text-sm text-muted mt-1">${t('invoices.emptyHint')}</p>`;
  }
  const total = list.reduce((s,i) => s + invDisplayTotal(i), 0);
  $('#inv-summary').textContent = t('invoices.summary', { n: list.length, amount: fmtMoney(total) });
  icons();
}

/* ── Document imprimable ──────────────────────────── */
function invoiceDocHtml(i){
  const shop = esc(db.settings.shopName);
  const sub = [db.settings.shopAddress, db.settings.shopPhone, db.settings.shopEmail]
    .filter(Boolean).map(esc).join(' · ');
  const taxPct = db.settings.taxRate || 0;
  const subtotal = invTotal(i), tax = subtotal * taxPct / 100;
  const rows = i.lines.map(l => `<tr>
      <td>${esc(l.name)}</td>
      <td class="pr-right">${fmtQty(l.qty)}${l.unit ? ' ' + esc(l.unit) : ''}</td>
      <td class="pr-right">${fmtMoney(l.price)}</td>
      <td class="pr-right">${fmtMoney(l.qty * l.price)}</td></tr>`).join('');
  return `<div style="max-width:680px;margin:auto;font-family:sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div><h1 style="font-size:20px;margin:0">${shop}</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#555">${sub}</p></div>
      <div style="text-align:right">
        <h2 style="font-size:16px;margin:0;text-transform:uppercase">${t('invoices.docTitle')}</h2>
        <p style="margin:4px 0 0;font-size:13px" class="num">${esc(i.number)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#555">${fmtDate(i.date)}</p></div>
    </div>
    <p style="font-size:13px;margin:0 0 16px"><strong>${t('invoices.colCustomer')} :</strong> ${esc(i.customer)}</p>
    <table>
      <thead><tr><th>${t('invoices.lineProduct')}</th><th class="pr-right">${t('invoices.lineQty')}</th>
        <th class="pr-right">${t('invoices.linePrice')}</th><th class="pr-right">${t('invoices.lineTotal')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <div style="width:260px;font-size:13px">
        <div style="display:flex;justify-content:space-between;padding:4px 0"><span>${t('invoices.subtotal')}</span><span class="num">${fmtMoney(subtotal)}</span></div>
        ${taxPct ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${t('invoices.taxLine', { pct: taxPct })}</span><span class="num">${fmtMoney(tax)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:800;border-top:2px solid #111">
          <span>${t('invoices.totalLabel')}</span><span class="num">${fmtMoney(subtotal + tax)}</span></div>
      </div>
    </div>
    <p style="margin-top:28px;font-size:12px;color:#555;text-align:center">${t('invoices.thanks')}</p>
  </div>`;
}

function printInvoice(id){
  const i = db.invoices.find(x => x.id === id); if(!i) return;
  $('#print-root').innerHTML = invoiceDocHtml(i);
  window.print();
}

function exportInvoiceTxt(i){
  const L = [];
  L.push(t('invoices.docTitle') + ' ' + i.number);
  L.push(db.settings.shopName + ' — ' + fmtDate(i.date));
  L.push(t('invoices.colCustomer') + ' : ' + i.customer);
  L.push('—'.repeat(40));
  i.lines.forEach(l => L.push(l.name + ' | ' + fmtQty(l.qty) + ' x ' + fmtMoney(l.price) + ' = ' + fmtMoney(l.qty * l.price)));
  L.push('—'.repeat(40));
  L.push(t('invoices.totalLabel') + ' : ' + fmtMoney(invDisplayTotal(i)));
  downloadFile(i.number + '.txt', L.join('\r\n'), 'text/plain;charset=utf-8');
  toast(t('invoices.exported'));
}

/* ── Fiche détaillée (modale) ─────────────────────── */
function invoiceViewModal(id){
  const i = db.invoices.find(x => x.id === id); if(!i) return;
  const rows = i.lines.map(l => `<div class="flex items-center justify-between gap-3 py-2 border-b border-line/70 last:border-0">
      <div class="min-w-0"><p class="text-sm font-bold truncate">${esc(l.name)}</p>
        <p class="num text-xs text-muted mt-0.5">${fmtQty(l.qty)}${l.unit ? ' ' + esc(l.unit) : ''} × ${fmtMoney(l.price)}</p></div>
      <p class="num text-sm font-extrabold shrink-0">${fmtMoney(l.qty * l.price)}</p></div>`).join('');
  openModal(`${modalHeader(t('invoices.docTitle') + ' ' + esc(i.number), fmtDate(i.date) + ' · ' + esc(i.customer))}
    <div class="px-6 pb-6 pt-3">
      <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${invStatusClass(i.status)}">${invStatusLabel(i.status)}</span>
      <div class="mt-4">${rows}</div>
      <div class="flex items-baseline justify-between mt-4 pt-3 border-t border-line">
        <span class="text-sm font-semibold text-muted">${t('invoices.totalLabel')}</span>
        <span class="num text-xl font-extrabold">${fmtMoney(invDisplayTotal(i))}</span></div>
      <div class="grid grid-cols-2 gap-2.5 mt-5">
        <button data-action="invoice-print" data-id="${i.id}" class="flex items-center justify-center gap-2 bg-accent hover:bg-accent-dark text-white font-bold text-sm py-2.5 rounded-xl">
          <i data-lucide="printer" class="w-4 h-4"></i>${t('invoices.print')}</button>
        <button data-action="invoice-export-txt" data-id="${i.id}" class="flex items-center justify-center gap-2 border border-line bg-paper hover:bg-accent-soft font-semibold text-sm py-2.5 rounded-xl">
          <i data-lucide="download" class="w-4 h-4"></i>${t('invoices.exportTxt')}</button>
      </div>
      <button data-action="close-layer" class="mt-2.5 w-full border border-line text-muted hover:text-ink font-semibold text-sm py-2.5 rounded-xl">${t('form.cancel')}</button>
    </div>`);
}

/* ── Édition statut / client / note ───────────────── */
function invoiceEditModal(id){
  const i = db.invoices.find(x => x.id === id); if(!i) return;
  const opts = INV_STATUSES.map(s => `<option value="${s}"${s === i.status ? ' selected' : ''}>${invStatusLabel(s)}</option>`).join('');
  openModal(`${modalHeader(t('invoices.editTitle'), esc(i.number))}
    <form id="inv-form" class="px-6 pb-6 pt-3 space-y-3.5">
      <div><label class="${labelCls}">${t('invoices.colCustomer')}</label>
        <input name="customer" type="text" value="${esc(i.customer)}" class="${inputCls}"></div>
      <div><label class="${labelCls}">${t('invoices.colStatus')}</label>
        <select name="status" class="${inputCls}">${opts}</select></div>
      <div><label class="${labelCls}">${t('invoices.noteLabel')}</label>
        <textarea name="note" rows="3" class="${inputCls}" placeholder="${t('invoices.notePh')}">${esc(i.note || '')}</textarea></div>
      <button class="w-full bg-accent hover:bg-accent-dark text-white font-bold text-sm py-3 rounded-xl">${t('invoices.saveBtn')}</button>
    </form>`);
  $('#inv-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    i.customer = (f.get('customer') || '').trim() || t('invoices.walkIn');
    i.status = INV_STATUSES.includes(f.get('status')) ? f.get('status') : i.status;
    i.note = (f.get('note') || '').trim();
    save(); closeLayer(); renderPage(); toast(t('invoices.saved'));
  });
}

function deleteInvoice(id){
  const idx = db.invoices.findIndex(x => x.id === id); if(idx === -1) return;
  const i = db.invoices[idx];
  db.invoices.splice(idx, 1); save(); renderPage();
  toast(t('invoices.deleted', { number: i.number }), 'warn');
}

/* ── Nouvelle facture manuelle ────────────────────── */
function invoiceFormHtml(inv){
  const isNew = !inv;
  const lines = inv ? inv.lines.map(l => ({ ...l })) : [];
  const opts = db.products.slice().sort((a,b) => a.name.localeCompare(b.name, localeOf()))
    .map(p => `<option value="${p.id}">${esc(p.name)} — ${fmtMoney(p.price)}</option>`).join('');
  const lineRows = lines.map((l,idx) => {
    return `<div class="flex items-center gap-2 py-2 border-b border-line/70 last:border-0" data-inv-line="${idx}">
      <div class="min-w-0 flex-1"><p class="text-sm font-bold truncate">${esc(l.name)}</p>
        <p class="num text-xs text-muted">${fmtMoney(l.price)} ${t('invoices.perUnit')}</p></div>
      <input name="qty-${idx}" type="number" min="0.01" step="any" value="${l.qty}"
        data-price="${l.price}" data-name="${esc(l.name)}"
        class="w-16 text-center num text-sm font-bold bg-paper border border-line rounded-lg py-1.5">
      <button type="button" data-action="inv-line-rm" data-idx="${idx}" class="text-muted hover:text-danger shrink-0" aria-label="${t('invoices.removeLine')}">
        <i data-lucide="x" class="w-4 h-4"></i></button></div>`;
  }).join('');
  return `${modalHeader(isNew ? t('invoices.newTitle') : t('invoices.editTitle'),
                       isNew ? t('invoices.newSub') : esc(inv.number))}
    <form id="inv-form" class="px-6 pb-6 pt-3 space-y-3.5">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${labelCls}">${t('invoices.colCustomer')}</label>
          <input name="customer" type="text" value="${esc(inv ? inv.customer : '')}" placeholder="${t('sell.customerPh')}" class="${inputCls}"></div>
        <div><label class="${labelCls}">${t('invoices.colStatus')}</label>
          <select name="status" class="${inputCls}">${INV_STATUSES.map(s => `<option value="${s}"${inv && inv.status === s ? ' selected' : (s === 'sent' && isNew ? ' selected' : '')}>${invStatusLabel(s)}</option>`).join('')}</select></div>
      </div>
      <div>
        <label class="${labelCls}">${t('invoices.addLineLabel')}</label>
        <div class="relative mt-1.5">
          <select id="inv-add-select" class="${inputCls} pr-9 appearance-none cursor-pointer">
            <option value="">${t('invoices.pickProduct')}</option>${opts}</select>
          <i data-lucide="chevron-down" class="w-4 h-4 text-muted absolute right-3 top-[calc(50%+0.4rem)] pointer-events-none"></i>
        </div>
        <button type="button" data-action="inv-line-add" class="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>${t('invoices.addLineBtn')}</button>
      </div>
      <div>
        <label class="${labelCls}">${t('invoices.linesLabel')}</label>
        <div id="inv-lines" class="mt-1.5 bg-paper border border-line rounded-xl px-4 py-1">${lineRows || `<p id="inv-no-lines" class="text-xs text-muted py-3 text-center">${t('invoices.noLinesYet')}</p>`}</div>
      </div>
      <div class="flex items-baseline justify-between pt-1">
        <span class="text-sm font-semibold text-muted">${t('invoices.totalLabel')}</span>
        <span id="inv-form-total" class="num text-lg font-extrabold">${fmtMoney(lines.reduce((s,l) => s + l.qty * l.price, 0))}</span></div>
      <div><label class="${labelCls}">${t('invoices.noteLabel')}</label>
        <textarea name="note" rows="2" class="${inputCls}" placeholder="${t('invoices.notePh')}">${esc(inv ? inv.note : '')}</textarea></div>
      <button class="w-full bg-accent hover:bg-accent-dark disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl">${t('invoices.saveBtn')}</button>
    </form>`;
}

function openNewInvoice(){
  if(!db.products.length) return toast(t('movements.addProductFirst'), 'warn');
  openDrawer(invoiceFormHtml(null));
  bindInvoiceForm(null);
}

function openEditInvoice(id){
  const inv = db.invoices.find(x => x.id === id); if(!inv) return;
  openDrawer(invoiceFormHtml(inv));
  bindInvoiceForm(inv);
}

function bindInvoiceForm(existing){
  const sel = $('#inv-add-select');
  const totalEl = () => {
    let sum = 0;
    document.querySelectorAll('#inv-lines [data-inv-line]').forEach(row => {
      const inp = row.querySelector('input[name^="qty-"]');
      if(inp) sum += (parseFloat(inp.value) || 0) * (parseFloat(inp.dataset.price) || 0);
    });
    $('#inv-form-total').textContent = fmtMoney(sum);
  };
  const refreshRowTotals = totalEl;
  $('#inv-form').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]'); if(!btn) return;
    if(btn.dataset.action === 'inv-line-add'){
      const pid = sel.value; if(!pid) return toast(t('invoices.pickFirst'), 'warn');
      const p = prod(pid); if(!p) return;
      const wrap = $('#inv-lines');
      const empty = $('#inv-no-lines'); if(empty) empty.remove();
      const idx = wrap.querySelectorAll('[data-inv-line]').length;
      const div = document.createElement('div');
      div.className = 'flex items-center gap-2 py-2 border-b border-line/70 last:border-0';
      div.dataset.invLine = idx;
      div.innerHTML = `<div class="min-w-0 flex-1"><p class="text-sm font-bold truncate">${esc(p.name)}</p>
        <p class="num text-xs text-muted">${fmtMoney(p.price)} ${t('invoices.perUnit')}</p></div>
        <input name="qty-${idx}" type="number" min="0.01" step="any" value="1" data-price="${p.price}" data-name="${esc(p.name)}"
          class="w-16 text-center num text-sm font-bold bg-white border border-line rounded-lg py-1.5">
        <button type="button" data-action="inv-line-rm" data-idx="${idx}" class="text-muted hover:text-danger shrink-0" aria-label="${t('invoices.removeLine')}">
          <i data-lucide="x" class="w-4 h-4"></i></button>`;
      wrap.appendChild(div); icons(); totalEl();
    }
    if(btn.dataset.action === 'inv-line-rm'){
      const row = btn.closest('[data-inv-line]'); row.remove();
      if(!wrap_hasLines()) $('#inv-lines').insertAdjacentHTML('beforeend', `<p id="inv-no-lines" class="text-xs text-muted py-3 text-center">${t('invoices.noLinesYet')}</p>`);
      totalEl();
    }
  });
  function wrap_hasLines(){ return document.querySelectorAll('#inv-lines [data-inv-line]').length > 0; }
  $('#inv-form').addEventListener('input', e => { if(e.target.name && e.target.name.indexOf('qty-') === 0) totalEl(); });
  $('#inv-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lines = [];
    document.querySelectorAll('#inv-lines [data-inv-line]').forEach(row => {
      const inp = row.querySelector('input[name^="qty-"]'); if(!inp) return;
      const qty = parseFloat(inp.value);
      if(!isNaN(qty) && qty > 0) lines.push({ productId:null, name:(inp.dataset.name || '').replace(/&quot;/g,'"'), unit:'', qty, price:parseFloat(inp.dataset.price) || 0 });
    });
    if(!lines.length) return toast(t('invoices.needLine'), 'warn');
    const customer = (f.get('customer') || '').trim() || t('invoices.walkIn');
    const status = INV_STATUSES.includes(f.get('status')) ? f.get('status') : 'sent';
    const note = (f.get('note') || '').trim();
    if(existing){
      existing.customer = customer; existing.status = status; existing.note = note;
    } else {
      db.invoices.push({ id:uid(), number:nextInvNumber(), saleId:null, date:new Date().toISOString(),
                         customer, status, note, lines });
    }
    save(); closeLayer(); navigate('invoices'); toast(t('invoices.saved'));
  });
  totalEl();
}

/* ── Export CSV ───────────────────────────────────── */
function exportInvoicesCsv(){
  ensureInvoices();
  const header = t('csv.invoicesHeader').split(';');
  const rows = db.invoices.slice().sort((a,b) => new Date(b.date) - new Date(a.date))
    .map(i => [i.number, fmtDate(i.date), i.customer, invStatusLabel(i.status),
               i.lines.reduce((s,l) => s + l.qty, 0), Math.round(invDisplayTotal(i) * 100) / 100]);
  exportCsv([header, ...rows], 'monstock-factures.csv');
}
