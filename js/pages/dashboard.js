/* ════════════════ 6. TABLEAU DE BORD ════════════════ */
function animateNum(el, to, fmt){
  const from = parseFloat(el.dataset.v || 0), t0 = performance.now(), dur = 650;
  el.dataset.v = to;
  (function step(t){
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1-k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if(k < 1) requestAnimationFrame(step);
  })(t0);
}

function kpiCard(label, value, sub, icon, tone){
  return `<div class="bg-white rounded-3xl p-5">
    <div class="flex items-center justify-between">
      <p class="text-[11px] font-bold uppercase tracking-wide text-muted">${label}</p>
      <span class="w-8 h-8 rounded-xl ${tone.bg} grid place-items-center"><i data-lucide="${icon}" class="w-4 h-4 ${tone.fg}"></i></span>
    </div>
    <p class="num text-[22px] lg:text-2xl font-extrabold mt-2.5 tracking-tight" data-kpi="${label}">${value}</p>
    <p class="text-xs text-muted mt-1">${sub}</p></div>`;
}

function renderDashboard(){
  $('#dash-hello').textContent = 'Bonjour';
  $('#dash-date').textContent = new Date().toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const al = alerts();
  $('#dash-kpis').innerHTML =
    kpiCard('Valeur du stock', fmtMoney(stockValue()), 'au prix d\'achat', 'warehouse', {bg:'bg-accent-soft', fg:'text-accent'}) +
    kpiCard('Ventes du jour', fmtMoney(salesToday()), `${todayMoves().length} article${todayMoves().length>1?'s':''} vendu${todayMoves().length>1?'s':''}`, 'banknote', {bg:'bg-accent-soft', fg:'text-accent'}) +
    kpiCard('Bénéfice estimé', fmtMoney(profitToday()), 'marge sur ventes du jour', 'trending-up', {bg:'bg-accent-soft', fg:'text-accent'}) +
    kpiCard('Alertes stock', String(al.length), al.length ? 'action requise' : 'tout va bien', 'bell-ring', {bg: al.length?'bg-warn-soft':'bg-accent-soft', fg: al.length?'text-warn':'text-accent'});
  ['#dash-kpis [data-kpi]'].forEach(()=>{});
  document.querySelectorAll('#dash-kpis [data-kpi]').forEach(el=>{
    const label = el.dataset.kpi;
    const v = label==='Valeur du stock' ? stockValue() : label==='Ventes du jour' ? salesToday()
            : label==='Bénéfice estimé' ? profitToday() : al.length;
    animateNum(el, v, n => label==='Alertes stock' ? String(Math.round(n)) : fmtMoney(n));
  });
  renderChart(); renderAlerts(); renderDashMoves();
}

function renderChart(){
  const days = [...Array(7)].map((_,i)=>{ const d = new Date(); d.setDate(d.getDate()-6+i); return d; });
  const totals = days.map(d => db.movements
    .filter(m => m.type==='out' && m.saleId && dayKey(new Date(m.date)) === dayKey(d))
    .reduce((s,m)=> s + m.qty*m.unitPrice, 0));
  const grand = totals.reduce((a,b)=>a+b,0);
  $('#chart-total').textContent = 'Total : ' + fmtMoney(grand);
  const max = Math.max(...totals, 1);
  const W=560, H=210, padL=16, colW=(W-2*padL)/7, barW=Math.min(44, colW*.5);
  const labels = days.map(d => d.toLocaleDateString('fr-FR',{weekday:'narrow'}));
  const dateLbls = days.map(d => d.toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long'}));
  let bars = '';
  totals.forEach((v,i)=>{
    const h = v/max * 132, x = padL + i*colW + (colW-barW)/2, y = 176 - h;
    const isToday = i === 6;
    bars += `<g class="chart-hit" data-idx="${i}" style="cursor:default">
      <rect x="${x-6}" y="20" width="${barW+12}" height="164" fill="transparent"></rect>
      <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, v>0?6:0)}" rx="9"
        fill="${v>0 ? (isToday ? '#166B4A' : '#166B4A' + '3D' && '#A9CFBC') : '#EDEAE1'}"></rect>
      ${v<=0 ? `<rect x="${x}" y="170" width="${barW}" height="6" rx="3" fill="#EDEAE1"></rect>` : ''}
      <text x="${x+barW/2}" y="196" text-anchor="middle" font-size="11" font-weight="${isToday?800:600}"
        fill="${isToday?'#166B4A':'#68766E'}" font-family="Plus Jakarta Sans">${labels[i]}</text></g>`;
  });
  $('#chart-wrap').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full">${bars}</svg>
    <div id="chart-tip" class="absolute pointer-events-none opacity-0 transition-opacity bg-ink text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap"></div>
    <div class="flex justify-between mt-1 px-2 text-[10px] text-muted/70">
      <span>${days[0].toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span>
      <span>Aujourd'hui</span></div>`;
  const tip = $('#chart-tip'), wrap = $('#chart-wrap');
  wrap.querySelectorAll('.chart-hit').forEach(g=>{
    g.addEventListener('mouseenter', ()=>{
      const i = +g.dataset.idx;
      tip.textContent = `${dateLbls[i]} — ${fmtMoney(totals[i])}`;
      const bar = g.querySelectorAll('rect')[1] || g.querySelector('rect');
      const wr = wrap.getBoundingClientRect(), br = bar.getBoundingClientRect();
      tip.style.left = Math.min(wr.width - 10, br.left - wr.left + br.width/2 - tip.offsetWidth/2) + 'px';
      tip.style.top = (br.top - wr.top - 34) + 'px';
      tip.classList.remove('opacity-0');
    });
    g.addEventListener('mouseleave', ()=> tip.classList.add('opacity-0'));
  });
}

function renderAlerts(){
  const al = alerts();
  $('#alerts-count').textContent = `${al.length} produit${al.length>1?'s':''}`;
  if(!al.length){
    $('#alerts-list').innerHTML = `<div class="flex-1 grid place-items-center py-10 text-center">
      <div><span class="w-12 h-12 rounded-2xl bg-accent-soft grid place-items-center mx-auto"><i data-lucide="shield-check" class="w-6 h-6 text-accent"></i></span>
      <p class="text-sm font-semibold mt-3">Tous les stocks sont bons</p>
      <p class="text-xs text-muted mt-1">Aucun produit sous le seuil d'alerte.</p></div></div>`;
    return;
  }
  $('#alerts-list').innerHTML = al.map(p=>{
    const out = p.stock <= 0;
    return `<div class="flex items-center gap-3 rounded-2xl border ${out?'border-danger/25 bg-danger-soft/60':'border-warn/25 bg-warn-soft/60'} px-3.5 py-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-bold truncate">${esc(p.name)}</p>
        <p class="text-xs font-semibold ${out?'text-danger':'text-warn'} mt-0.5">
          ${out ? 'Rupture de stock' : `Plus que ${fmtQty(p.stock)} ${esc(p.unit||'')}`}</p>
      </div>
      <button data-action="quick-restock" data-id="${p.id}" class="shrink-0 text-xs font-bold text-accent hover:text-accent-dark bg-white border border-accent/25 rounded-lg px-3 py-1.5 flex items-center gap-1">
        <i data-lucide="package-plus" class="w-3.5 h-3.5"></i>Réappro</button></div>`;
  }).join('');
}

function moveRow(m){
  const p = prod(m.productId);
  const conf = { in:{l:'Entrée', c:'text-accent bg-accent-soft', i:'arrow-down-to-line'},
                 out:{l:'Sortie', c:'text-info bg-info-soft', i:'arrow-up-from-line'},
                 adj:{l:'Ajustement', c:'text-warn bg-warn-soft', i:'sliders-horizontal'} }[m.type];
  return `<div class="flex items-center gap-3 py-3">
    <span class="w-9 h-9 rounded-xl ${conf.c} grid place-items-center shrink-0"><i data-lucide="${conf.i}" class="w-4 h-4"></i></span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-bold truncate">${esc(p ? p.name : 'Produit supprimé')}</p>
      <p class="text-xs text-muted mt-0.5">${fmtDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</p></div>
    <div class="text-right shrink-0">
      <p class="num text-sm font-bold ${m.type==='adj' ? (m.qty>=0?'text-accent':'text-danger') : m.type==='in'?'text-accent':'text-ink'}">
        ${m.type==='adj' && m.qty>=0 ? '+' : ''}${fmtQty(m.qty)}</p>
      <p class="num text-xs text-muted mt-0.5">${fmtMoney(m.qty * m.unitPrice)}</p></div></div>`;
}

function renderDashMoves(){
  const list = db.movements.slice(0, 6);
  $('#dash-moves').innerHTML = list.length ? list.map(moveRow).join('')
    : `<p class="py-8 text-center text-sm text-muted">Aucun mouvement enregistré pour le moment.</p>`;
}

