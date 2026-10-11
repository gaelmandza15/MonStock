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
  $('#dash-hello').textContent = t('dash.hello');
  $('#dash-date').textContent = new Date().toLocaleDateString(localeOf(),{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const al = alerts();
  $('#dash-kpis').innerHTML =
    kpiCard(t('kpi.stockValue'), fmtMoney(stockValue()), t('kpi.stockValueSub'), 'warehouse', {bg:'bg-accent-soft', fg:'text-accent'}) +
    kpiCard(t('kpi.salesToday'), fmtMoney(salesToday()), t('kpi.articlesSold', { n: todayMoves().length }), 'banknote', {bg:'bg-accent-soft', fg:'text-accent'}) +
    kpiCard(t('kpi.profit'), fmtMoney(profitToday()), t('kpi.profitSub'), 'trending-up', {bg:'bg-accent-soft', fg:'text-accent'}) +
    kpiCard(t('kpi.alerts'), String(al.length), al.length ? t('kpi.alertsAction') : t('kpi.alertsOk'), 'bell-ring', {bg: al.length?'bg-warn-soft':'bg-accent-soft', fg: al.length?'text-warn':'text-accent'});
  ['#dash-kpis [data-kpi]'].forEach(()=>{});
  document.querySelectorAll('#dash-kpis [data-kpi]').forEach(el=>{
    const label = el.dataset.kpi;
    const v = label===t('kpi.stockValue') ? stockValue() : label===t('kpi.salesToday') ? salesToday()
            : label===t('kpi.profit') ? profitToday() : al.length;
    animateNum(el, v, n => label===t('kpi.alerts') ? String(Math.round(n)) : fmtMoney(n));
  });
  renderChart(); renderAlerts(); renderDashMoves();
}

function renderChart(){
  const days = [...Array(7)].map((_,i)=>{ const d = new Date(); d.setDate(d.getDate()-6+i); return d; });
  const totals = days.map(d => db.movements
    .filter(m => m.type==='out' && m.saleId && dayKey(new Date(m.date)) === dayKey(d))
    .reduce((s,m)=> s + m.qty*m.unitPrice, 0));
  const grand = totals.reduce((a,b)=>a+b,0);
  const actifs = totals.filter(v => v > 0).length;
  const moy = grand / 7;
  let best = 0; totals.forEach((v,i)=>{ if(v > totals[best]) best = i; });

  $('#chart-total').textContent = t('dash.chartTotal', { amount: fmtMoney(grand) });
  $('#chart-meta').textContent = grand > 0
    ? t('dash.chartAvg', { amount: fmtMoney(moy) }) + ' · ' + t('dash.chartBest', {
        day: days[best].toLocaleDateString(localeOf(), { weekday: 'short', day: 'numeric', month: 'short' }),
        amount: fmtMoney(totals[best]) })
    : '';

  /* Repère haut de graphique : on arrondit le maximum à une valeur « ronde »
     pour obtenir des graduations lisibles, et on affiche des « jolis »
     montants au-dessus des barres plutôt que des nombres bruts. */
  const top = (max => {
    if(!max) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(max)));
    const pas = [1,2,2.5,5,10].find(k => max <= k*exp) || 10;
    return pas*exp;
  })(Math.max(...totals, 0));
  const prettySteps = [top, top/2, top/4].filter(v => v > 0);
  const pretty = v => {
    const s = prettySteps.find(p => p <= v);
    return s ? Math.round(v/s)*s : v;
  };

  const wrap = $('#chart-wrap');
  const cw = Math.max(300, wrap.clientWidth || 560);
  const W = cw, H = 264;
  const padL = 8, padR = 6, padT = 26, padB = 44;
  const areaH = H - padT - padB;
  const n = 7, colW = (W - padL - padR) / n, barW = Math.min(46, colW*0.56);

  const yOf = v => padT + areaH - (v / top) * areaH;
  const tick = v => `<line x1="${padL}" y1="${yOf(v)}" x2="${W-padR}" y2="${yOf(v)}" stroke="#EDEAE1" stroke-width="1"${v===0?'':' stroke-dasharray="3 4"'}/>
    <text x="${W-padR}" y="${yOf(v)-5}" text-anchor="end" font-size="10" font-weight="700" fill="#9AA6A0" font-family="Plus Jakarta Sans">${shortMoney(v)}</text>`;

  let bars = '';
  totals.forEach((v,i)=>{
    const center = padL + colW*i + colW/2, x = center - barW/2;
    const isToday = i === 6, maxed = v === totals[best] && v > 0;
    const h = v > 0 ? Math.max((v/top)*areaH, 6) : 0;
    const y = padT + areaH - h;
    const fill = !v ? '#E4E0D6' : isToday ? '#166B4A' : maxed ? '#3E8E6C' : '#A9CFBC';
    const labelFmt = v >= 1000 ? shortMoney(v) : new Intl.NumberFormat(localeOf(),{maximumFractionDigits:0}).format(Math.round(v));
    bars += `<g class="chart-hit" data-idx="${i}" style="cursor:pointer">
      <rect x="${padL+colW*i}" y="${padT}" width="${colW}" height="${areaH}" fill="transparent"></rect>
      ${v > 0
        ? `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="9" fill="${fill}"${isToday?` stroke="#0F4F37" stroke-width="1"`:''}></rect>
           <text x="${center}" y="${y-7}" text-anchor="middle" font-size="10.5" font-weight="800"
             fill="${isToday?'#166B4A':'#68766E'}" font-family="Plus Jakarta Sans">${labelFmt}</text>`
        : `<text x="${center}" y="${padT+areaH-9}" text-anchor="middle" font-size="10" font-weight="700"
             fill="#B4BDB8" font-family="Plus Jakarta Sans">0</text>
           <circle cx="${center}" cy="${padT+areaH-3.5}" r="2" fill="#D8D3C7"></circle>`}
      <text x="${center}" y="${H-26}" text-anchor="middle" font-size="11.5" font-weight="${isToday?800:600}"
        fill="${isToday?'#166B4A':'#68766E'}" font-family="Plus Jakarta Sans">${days[i].toLocaleDateString(localeOf(),{weekday:'narrow'})}</text>
      <text x="${center}" y="${H-11}" text-anchor="middle" font-size="9.5" font-weight="600"
        fill="${isToday?'#166B4A':'#A6B0AB'}" font-family="Plus Jakarta Sans">${days[i].toLocaleDateString(localeOf(),{day:'numeric',month:'short'})}</text></g>`;
  });

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="${esc(t('dash.chartTitle'))}">
      ${prettySteps.map(tick).join('')}
      <line x1="${padL}" y1="${yOf(0)}" x2="${W-padR}" y2="${yOf(0)}" stroke="#D8D3C7" stroke-width="1.25"/>
      ${bars}
    </svg>
    <div id="chart-tip" class="absolute pointer-events-none opacity-0 transition-opacity bg-ink text-white text-[11px] font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10"></div>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-3 pt-3 border-t border-line text-[11px] font-semibold text-muted">
      <span class="inline-flex items-center gap-1.5"><i data-lucide="bar-chart-3" class="w-3.5 h-3.5 text-accent"></i>${t('dash.chartTotal', { amount: fmtMoney(grand) })}</span>
      <span data-i18n="dash.chartSub">${t('dash.chartSub')}</span>
      <span>${actifs}/7</span>
    </div>
    ${grand > 0 ? '' : `<p class="text-xs text-muted text-center py-4">${t('dash.chartNone')}</p>`}`;

  const tip = $('#chart-tip');
  const dayLbl = i => days[i].toLocaleDateString(localeOf(),{weekday:'long', day:'numeric', month:'long'});
  const showTip = i => {
    tip.textContent = `${dayLbl(i)} — ${totals[i] > 0 ? fmtMoney(totals[i]) : t('dash.chartNoDay')}`;
    const center = padL + colW*i + colW/2, scale = (wrap.clientWidth || W) / W;
    const cx = center * scale;
    tip.style.left = Math.max(4, Math.min(wrap.clientWidth - tip.offsetWidth - 4, cx - tip.offsetWidth/2)) + 'px';
    tip.style.top = Math.max(0, (padT + areaH - (totals[i]>0 ? (totals[i]/top)*areaH : 0)) * scale - 40) + 'px';
    tip.classList.remove('opacity-0');
  };
  const hideTip = () => tip.classList.add('opacity-0');
  wrap.querySelectorAll('.chart-hit').forEach(g=>{
    const i = +g.dataset.idx;
    g.addEventListener('mouseenter', ()=> showTip(i));
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('focus', ()=> showTip(i));
    g.addEventListener('blur', hideTip);
    g.addEventListener('click', ()=> showTip(i));
    g.addEventListener('touchstart', e => { e.preventDefault(); showTip(i); }, {passive:false});
    g.setAttribute('tabindex', '0');
  });
}

/* Formate un montant de façon compacte (12 000 → 12 k, 1 500 000 → 1,5 M) :
   sert aux graduations de l'axe et aux étiquettes des barres. */
function shortMoney(v){
  if(v >= 1e6) return new Intl.NumberFormat(localeOf(),{maximumFractionDigits:1}).format(v/1e6) + ' M';
  if(v >= 1e3) return new Intl.NumberFormat(localeOf(),{maximumFractionDigits:v%1e3===0?0:1}).format(v/1e3) + ' k';
  return new Intl.NumberFormat(localeOf(),{maximumFractionDigits:0}).format(v);
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
          ${out ? t('dash.outOfStock') : t('dash.remaining', { qty: fmtQty(p.stock), unit: esc(p.unit||'') })}</p>
      </div>
      <button data-action="quick-restock" data-id="${p.id}" class="shrink-0 text-xs font-bold text-accent hover:text-accent-dark bg-white border border-accent/25 rounded-lg px-3 py-1.5 flex items-center gap-1">
        <i data-lucide="package-plus" class="w-3.5 h-3.5"></i>${t('dash.restockShort')}</button></div>`;
  }).join('');
}

function moveRow(m){
  const p = prod(m.productId);
  const conf = { in:{l:t('movements.typeIn'), c:'text-accent bg-accent-soft', i:'arrow-down-to-line'},
                 out:{l:t('movements.typeOut'), c:'text-info bg-info-soft', i:'arrow-up-from-line'},
                 adj:{l:t('movements.typeAdj'), c:'text-warn bg-warn-soft', i:'sliders-horizontal'} }[m.type];
  return `<div class="flex items-center gap-3 py-3">
    <span class="w-9 h-9 rounded-xl ${conf.c} grid place-items-center shrink-0"><i data-lucide="${conf.i}" class="w-4 h-4"></i></span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-bold truncate">${esc(p ? p.name : t('movements.deletedProduct'))}</p>
      <p class="text-xs text-muted mt-0.5">${fmtDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</p></div>
    <div class="text-right shrink-0">
      <p class="num text-sm font-bold ${m.type==='adj' ? (m.qty>=0?'text-accent':'text-danger') : m.type==='in'?'text-accent':'text-ink'}">
        ${m.type==='adj' && m.qty>=0 ? '+' : ''}${fmtQty(m.qty)}</p>
      <p class="num text-xs text-muted mt-0.5">${fmtMoney(m.qty * m.unitPrice)}</p></div></div>`;
}

function renderDashMoves(){
  const list = db.movements.slice(0, 6);
  $('#dash-moves').innerHTML = list.length ? list.map(moveRow).join('')
    : `<p class="py-8 text-center text-sm text-muted">${t('dash.noMoves')}</p>`;
}

