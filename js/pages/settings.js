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
  const bw = $('#set-backup-window'); if(bw) bw.value = String(backupWindow());
  renderSnapshots();
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

/* ---------- sauvegardes automatiques : liste et restauration ----------
   Le nom du fichier porte l'horodatage (voir snapshotStamp côté stockage). */
/* Libellé lisible d'une sauvegarde, à partir de son horodatage.
   « autres » liste les autres noms : si plusieurs sauvegardes tombent dans la
   même minute, on affiche les secondes pour pouvoir les distinguer. */
function snapshotLabel(name, autres){
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})h(\d{2})m(\d{2})s(\d{2})?/);
  if(!m) return name;
  const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  const memeMinute = (autres || []).some(o => o !== name && o.slice(0, 16) === name.slice(0, 16));
  const opts = { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' };
  if(memeMinute) opts.second = '2-digit';
  return d.toLocaleString(localeOf(), opts);
}

async function renderSnapshots(){
  const box = $('#snapshots-list'); if(!box) return;
  const list = await snapshotList();
  if(!list.length){
    box.innerHTML = `<p class="text-xs text-muted py-3 text-center">${t('settings.snapshotsEmpty')}</p>`;
    return;
  }
  const fmtB = n => n >= 1048576 ? (n/1048576).toFixed(1) + ' MB'
                : n >= 1024 ? Math.round(n/1024) + ' KB' : n + ' B';
  const noms = list.map(s => s.name);
  box.innerHTML = list.map((s, i) => `
    <div class="flex items-center gap-3 rounded-2xl border border-line px-3.5 py-2.5">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-bold">${esc(snapshotLabel(s.name, noms))}</p>
        <p class="text-[11px] text-muted mt-0.5">${fmtB(s.size)}${i === 0 ? ' · ' + t('settings.snapshotLatest') : ''}</p>
      </div>
      <button data-action="snapshot-restore" data-name="${esc(s.name)}"
        class="shrink-0 text-xs font-bold text-accent hover:text-accent-dark bg-accent-soft hover:bg-accent hover:text-white rounded-lg px-3 py-1.5 transition">
        ${t('settings.snapshotRestore')}</button>
      <button data-action="snapshot-del" data-name="${esc(s.name)}"
        class="shrink-0 text-muted hover:text-danger" title="${t('settings.snapshotDelete')}">
        <i data-lucide="trash-2" class="w-4 h-4"></i></button>
    </div>`).join('');
  icons();
}

async function restoreSnapshot(name){
  try{
    await snapshotRestore(name);
    replaceDb(await dbLoad());
    renderPage(); updateChrome();
    const noms = (await snapshotList()).map(s => s.name);
    toast(t('settings.snapshotRestored', { date: snapshotLabel(name, noms) }));
  }catch(e){
    toast(t('settings.snapshotRestoreFailed'), 'err');
  }
}

async function deleteSnapshot(name){
  try{
    await snapshotDelete(name);
    renderSnapshots();
    toast(t('settings.snapshotDeleted'));
  }catch(e){ toast(t('settings.snapshotRestoreFailed'), 'err'); }
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

