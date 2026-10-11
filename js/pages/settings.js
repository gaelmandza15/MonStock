/* ════════════════ 10. PARAMÈTRES ════════════════ */
function renderSettings(){
  $('#set-shop').value = db.settings.shopName;
  $('#set-threshold').value = db.settings.defaultThreshold;
  $('#set-decimals').value = db.settings.decimals;
  $('#set-currency').innerHTML = CURRENCIES.map(c=>`<option value="${c.c}" data-d="${c.d}" ${c.c===db.settings.currency?'selected':''}>${c.label}</option>`).join('')
    + (CURRENCIES.some(c=>c.c===db.settings.currency) ? '' : `<option value="${esc(db.settings.currency)}" selected>${esc(db.settings.currency)} (personnalisée)</option>`);
}
function saveSettings(){
  db.settings.shopName = $('#set-shop').value.trim() || 'Ma Boutique';
  const sel = $('#set-currency');
  db.settings.currency = sel.value;
  const opt = sel.selectedOptions[0];
  db.settings.decimals = parseInt($('#set-decimals').value) || 0;
  db.settings.defaultThreshold = Math.max(0, parseInt($('#set-threshold').value) || 0);
  save(); updateChrome(); toast('Paramètres enregistrés');
}

function downloadFile(name, content, mime){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type:mime}));
  a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
function exportCsv(rows, name){
  if(!rows.length) return toast('Aucune donnée à exporter.', 'warn');
  downloadFile(name, '\uFEFF' + rows.map(r=>r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast('Fichier CSV téléchargé');
}

