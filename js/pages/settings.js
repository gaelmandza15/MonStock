/* ════════════════ 10. PARAMÈTRES ════════════════ */
function renderSettings(){
  $('#set-shop').value = db.settings.shopName;
  $('#set-threshold').value = db.settings.defaultThreshold;
  const addr = $('#set-address'), phone = $('#set-phone'), email = $('#set-email'), tax = $('#set-tax');
  if(addr) addr.value = db.settings.shopAddress || '';
  if(phone) phone.value = db.settings.shopPhone || '';
  if(email) email.value = db.settings.shopEmail || '';
  if(tax) tax.value = db.settings.taxRate || 0;
  $('#set-decimals').value = db.settings.decimals;
  const sto = $('#storage-info'); if(sto) refreshStorageInfo();
  const known = CURRENCIES.some(c=>c.c===db.settings.currency);
  let html = `<option value="" disabled${known?'':' selected'}>${t('settings.selectCurrency')}</option>`;
  html += CURRENCY_GROUPS.map(g => { const ck = 'continent.' + g.id;
      return `<optgroup label="${t(ck)}">` +
      g.currencies.map(c=>`<option value="${c.c}" data-d="${c.d}" ${c.c===db.settings.currency?'selected':''}>${t(c.labelKey)}</option>`).join('') +
      '</optgroup>'; }).join('');
  if(!known) html += `<option value="${esc(db.settings.currency)}" selected>${t('settings.customCurrency', { code: esc(db.settings.currency) })}</option>`;
  $('#set-currency').innerHTML = html;
}
function saveSettings(){
  db.settings.shopName = $('#set-shop').value.trim() || t('seed.shopName');
  const sel = $('#set-currency');
  db.settings.currency = sel.value;
  const opt = sel.selectedOptions[0];
  db.settings.decimals = parseInt($('#set-decimals').value) || 0;
  db.settings.defaultThreshold = Math.max(0, parseInt($('#set-threshold').value) || 0);
  const addr = $('#set-address'), phone = $('#set-phone'), email = $('#set-email'), tax = $('#set-tax');
  db.settings.shopAddress = addr ? addr.value.trim() : '';
  db.settings.shopPhone   = phone ? phone.value.trim() : '';
  db.settings.shopEmail   = email ? email.value.trim() : '';
  db.settings.taxRate     = tax ? Math.max(0, Math.min(100, parseFloat(tax.value) || 0)) : 0;
  save(); updateChrome(); toast(t('settings.saved'));
  refreshStorageInfo();
}

/* Indicateur d'espace occupé par la base SQLite.
   Navigateur : usage et quota fournis par l'API Storage.
   Bureau (Tauri) : la base est un fichier sur le disque, sans quota — on
   n'affiche donc que sa taille (voir dbStorageInfo). */
async function refreshStorageInfo(){
  const el = $('#storage-info'); if(!el) return;
  const info = await dbStorageInfo();
  if(!info){ el.textContent = ''; return; }
  const fmtB = n => n >= 1073741824 ? (n/1073741824).toFixed(0) + ' GB'
                : n >= 1048576 ? Math.round(n/1048576) + ' MB'
                : n >= 1024 ? Math.round(n/1024) + ' KB' : n + ' B';
  el.textContent = info.quota
    ? t('settings.storageUsed', { used: fmtB(info.usage), quota: fmtB(info.quota) })
    : t('settings.storageSize', { size: fmtB(info.usage) });
}

function downloadFile(name, content, mime){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type:mime}));
  a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
function exportCsv(rows, name){
  if(!rows.length) return toast(t('settings.noDataExport'), 'warn');
  downloadFile(name, '\uFEFF' + rows.map(r=>r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast(t('settings.csvDownloaded'));
}

