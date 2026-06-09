/* Koccie Dashboard v1 — đọc ./data.json, render 5 tab client-side. */
let DATA = null, CH = {};
const S = { tab: 'overview', range: 'all', cFrom: '', cTo: '', mode: 'daily', metric: 'spend', dim: 'market', pMarket: 'all', compare: false, mkt: 'Meta' };

const usd = n => '$' + (Math.round(n)).toLocaleString('en-US');
const usd2 = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const k$ = n => Math.abs(n) >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n);
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
function destroyChart(id) { if (CH[id]) { CH[id].destroy(); delete CH[id]; } }
// ----- date helpers (local calendar) -----
const ymdLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const yestStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymdLocal(d); };
const addDaysStr = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymdLocal(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);

fetch('./data.json?_=' + Date.now()).then(r => r.json()).then(d => {
  DATA = d;
  // Chỉ vẽ ngày ĐẦY ĐỦ: cắt từ min(hôm nay, ngày build). Ngày build (generatedAt) còn dở → loại.
  const today = ymdLocal(new Date());
  const genD = (DATA.generatedAt || '').slice(0, 10);
  const cutoff = (genD && genD < today) ? genD : today;
  if (DATA.overview) DATA.overview = DATA.overview.filter(o => o.date < cutoff);
  if (DATA.fact) DATA.fact = DATA.fact.filter(r => r.Date < cutoff);
  if (DATA.ads) DATA.ads = DATA.ads.filter(a => a.date < cutoff);
  document.getElementById('genAt').textContent = 'cập nhật ' + (d.generatedAt || '').slice(0, 16).replace('T', ' ');
  // init custom range bounds
  const dates = DATA.overview.map(o => o.date).sort();
  S.cFrom = dates[0]; S.cTo = dates[dates.length - 1];
  document.getElementById('cFrom').value = S.cFrom; document.getElementById('cTo').value = S.cTo;
  bindUI(); render();
}).catch(e => { document.getElementById('view').innerHTML = '<div class="panel">Không tải được data.json: ' + e + '</div>'; });

function bindUI() {
  document.getElementById('tabs').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    [...e.currentTarget.children].forEach(b => b.classList.toggle('on', b === e.target));
    S.tab = e.target.dataset.tab; render();
  });
  const rng = document.getElementById('range');
  rng.addEventListener('change', () => {
    S.range = rng.value;
    document.getElementById('customRange').style.display = S.range === 'custom' ? 'inline' : 'none';
    syncCmpState();
    render();
  });
  document.getElementById('cFrom').addEventListener('change', e => { S.cFrom = e.target.value; if (S.range === 'custom') render(); });
  document.getElementById('cTo').addEventListener('change', e => { S.cTo = e.target.value; if (S.range === 'custom') render(); });
  document.getElementById('cmp').addEventListener('change', e => { S.compare = e.target.checked; render(); });
  syncCmpState();
}
// range='all' → không có kỳ trước → khóa mờ tickbox compare
function syncCmpState() {
  const dis = S.range === 'all', box = document.getElementById('cmp');
  box.disabled = dis;
  document.getElementById('cmpLabel').classList.toggle('disabled', dis);
}

// ----- date range -----
function rangeDates() {
  const all = DATA.overview.map(o => o.date).sort();
  if (S.range === 'all') return new Set(all);
  if (S.range === 'custom') return new Set(all.filter(d => d >= S.cFrom && d <= S.cTo));
  if (S.range === 'yesterday') { const y = yestStr(); return new Set(all.filter(d => d === y)); }
  const n = +S.range, keep = all.slice(-n);
  return new Set(keep);
}
// khoảng ngày [from,to] của range hiện tại (null nếu 'all')
function curBounds() {
  if (S.range === 'all') return null;
  if (S.range === 'custom') return (S.cFrom && S.cTo) ? [S.cFrom, S.cTo] : null;
  if (S.range === 'yesterday') { const y = yestStr(); return [y, y]; }
  const all = DATA.overview.map(o => o.date).sort(), keep = all.slice(-(+S.range));
  return keep.length ? [keep[0], keep[keep.length - 1]] : null;
}
// tập ngày của KỲ TRƯỚC (cùng độ dài, ngay liền trước theo lịch)
function prevDatesSet() {
  const b = curBounds(); if (!b) return null;
  const len = daysBetween(b[0], b[1]) + 1;
  const prevTo = addDaysStr(b[0], -1), prevFrom = addDaysStr(b[0], -len);
  return new Set(DATA.overview.map(o => o.date).filter(d => d >= prevFrom && d <= prevTo));
}
const ovFiltered = () => { const r = rangeDates(); return DATA.overview.filter(o => r.has(o.date)); };
const factFiltered = () => { const r = rangeDates(); return DATA.fact.filter(o => r.has(o.Date)); };
const adsFiltered = () => { const r = rangeDates(); return DATA.ads.filter(o => r.has(o.date)); };

// ===== KPI strip (mọi tab) =====
function kpiVals(ov) {
  const sales = sum(ov, o => o.revenue), ads = sum(ov, o => o.totalAds), orders = sum(ov, o => o.orders);
  const fb = sum(ov, o => o.meta), gg = sum(ov, o => o.google), tk = sum(ov, o => o.tiktok), api = sum(ov, o => o.api), ful = sum(ov, o => o.fulfill), net = sum(ov, o => o.profit);
  return { orders, sales, ads, fb, gg, tk, aov: sales / orders || 0, roas: sales / ads || 0, api, ful, net };
}
// % thay đổi vs kỳ trước → ▲ xanh (tăng) / ▼ đỏ (giảm)
function deltaHtml(cur, prev) {
  if (prev == null) return '';
  if (prev === 0) return cur > 0 ? `<p class="cmp up">▲ new</p>` : `<p class="cmp flat">— 0%</p>`;
  const pct = (cur - prev) / Math.abs(prev) * 100;
  if (Math.abs(pct) < 0.05) return `<p class="cmp flat">— 0%</p>`;
  const up = cur > prev;
  return `<p class="cmp ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</p>`;
}
function renderKPI() {
  const cur = kpiVals(ovFiltered());
  let prev = null;
  if (S.compare && S.range !== 'all') { const ps = prevDatesSet(); if (ps && ps.size) prev = kpiVals(DATA.overview.filter(o => ps.has(o.date))); }
  // Dòng cốt lõi (mọi tab). Marketing thêm dòng 2 chi tiết kênh/chi phí.
  const core = [
    ['Total Orders', 'orders', v => v.toLocaleString(), null],
    ['Total Sales', 'sales', usd2, null],
    ['Total Ads Spend', 'ads', usd2, c => (c.ads / c.sales * 100 || 0).toFixed(1) + '% of sales'],
    ['ROAS', 'roas', v => v.toFixed(2) + 'x', null],
    ['Net Profit', 'net', usd2, c => (c.net / c.sales * 100 || 0).toFixed(1) + '% of sales']
  ];
  const detail = [
    ['FB Ads', 'fb', usd2, c => (c.fb / c.ads * 100 || 0).toFixed(1) + '% of ads'],
    ['Google Ads', 'gg', usd2, c => (c.gg / c.ads * 100 || 0).toFixed(1) + '% of ads'],
    ['TikTok', 'tk', usd2, c => (c.tk / c.ads * 100 || 0).toFixed(1) + '% of ads'],
    ['AOV', 'aov', usd2, null],
    ['API Cost', 'api', usd2, c => (c.api / c.sales * 100 || 0).toFixed(1) + '% of sales'],
    ['Fulfill Cost', 'ful', usd2, c => (c.ful / c.sales * 100 || 0).toFixed(1) + '% of sales']
  ];
  const cardHtml = arr => arr.map(([label, key, fmt, subFn]) => {
    const sub = subFn ? subFn(cur) : '';
    const cmp = prev ? deltaHtml(cur[key], prev[key]) : '';
    return `<div class="card"><p class="l">${label}</p><p class="v">${fmt(cur[key])}</p>${sub ? `<p class="p">${sub}</p>` : ''}${cmp}</div>`;
  }).join('');
  document.getElementById('kpi').innerHTML = S.tab === 'marketing'
    ? `<div class="kpi">${cardHtml(core)}</div><div class="kpi krow2">${cardHtml(detail)}</div>`
    : `<div class="kpi">${cardHtml(core)}</div>`;
}

function render() { renderKPI(); ({ overview: vOverview, marketing: vMarketing, product: vProduct, explorer: vExplorer, forecast: vForecast }[S.tab])(); }

// ============ OVERVIEW ============
function vOverview() {
  const ov = ovFiltered();
  // cumulative YTD (toàn bộ, không theo range)
  const allOv = DATA.overview.slice().sort((a, b) => a.date.localeCompare(b.date));
  let cr = 0, cs = 0, cp = 0; const cum = {};
  allOv.forEach(o => { cr += o.revenue; cs += o.totalAds; cp += o.profit; cum[o.date] = { r: cr, s: cs, p: cp }; });
  const rows = ov.slice().sort((a, b) => a.date.localeCompare(b.date));   // theo đúng time range đã chọn
  const prov = DATA.provisionalDays || 0, lastDates = DATA.overview.map(o => o.date).sort().slice(-prov);
  document.getElementById('view').innerHTML = `
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0" id="ovT">Daily Performance</h3>
      <span class="seg" id="ovMode"><button data-m="daily" class="${S.mode==='daily'?'on':''}">Daily</button><button data-m="cum" class="${S.mode==='cum'?'on':''}">Lũy kế YTD</button></span></div>
      <div class="chartwrap r4"><canvas id="ovChart"></canvas></div></div>
    <div class="panel"><h3>Daily data <span style="font-weight:400;color:var(--muted);font-size:11px">(3 cột cuối = lũy kế từ ${DATA.fromDate})</span></h3>
      <div class="scroll"><table><thead><tr><th>Date</th><th>Orders</th><th>Sales</th><th>Total Ads</th><th>FB</th><th>Google</th><th>TikTok</th><th>API</th><th>Fulfill</th><th>Net Profit</th><th>Σ Revenue</th><th>Σ Spend</th><th>Σ Net Profit</th></tr></thead><tbody>${
        rows.map(o => { const c = cum[o.date] || {}; const pv = lastDates.indexOf(o.date) >= 0;
          return `<tr><td>${pv?'<span class="prov">●</span> ':''}${o.date.slice(5)}</td><td>${o.orders}</td><td>${k$(o.revenue)}</td><td>${k$(o.totalAds)}</td><td>${k$(o.meta)}</td><td>${k$(o.google)}</td><td>${k$(o.tiktok)}</td><td>${k$(o.api)}</td><td>${k$(o.fulfill)}</td><td class="${o.profit<0?'neg':''}">${k$(o.profit)}</td><td>${k$(c.r||0)}</td><td>${k$(c.s||0)}</td><td class="${(c.p||0)<0?'neg':''}">${k$(c.p||0)}</td></tr>`; }).join('')
      }</tbody></table></div></div>`;
  document.getElementById('ovMode').addEventListener('click', e => { if (e.target.tagName==='BUTTON'){ S.mode=e.target.dataset.m; vOverview(); }});
  const mk = (lab, arr, col) => ({ label: lab, data: arr, borderColor: col, backgroundColor: col, pointRadius: 0, borderWidth: 2, tension: .3 });
  let labels, ds, title;
  if (S.mode === 'daily') { title='Daily Performance'; labels = ov.map(o=>o.date); ds=[mk('Sales',ov.map(o=>o.revenue),'#378ADD'),mk('Ads Spend',ov.map(o=>o.totalAds),'#EF9F27'),mk('Net Profit',ov.map(o=>o.profit),'#1D9E75')]; }
  else { title='Lũy kế YTD'; labels = allOv.map(o=>o.date); ds=[mk('Σ Revenue',allOv.map(o=>cum[o.date].r),'#378ADD'),mk('Σ Ads',allOv.map(o=>cum[o.date].s),'#EF9F27'),mk('Σ Net Profit',allOv.map(o=>cum[o.date].p),'#1D9E75')]; }
  document.getElementById('ovT').textContent = title;
  lineChart('ovChart', labels, ds);
}

// ============ MARKETING ============
const MKT_COL = { Meta: '#0866FF', Google: '#34A853', TikTok: '#25F4EE' };   // màu brand từng nền tảng (chart line)
// Label tab phối màu từng chữ giống logo. Google: G-o-o-g-l-e; TikTok: glitch cyan/hồng (class .ttk).
const GOOGLE_LETTERS = [['G','#4285F4'],['o','#EA4335'],['o','#FBBC05'],['g','#4285F4'],['l','#34A853'],['e','#EA4335']];
const mktTabLabel = c => c === 'Google' ? GOOGLE_LETTERS.map(([l, col]) => `<span style="color:${col}">${l}</span>`).join('')
  : c === 'TikTok' ? '<span class="ttk">TikTok</span>' : c;
// Gom ads theo account + tổng (spend/clicks/impr/platformRevenue).
function aggByAccount(arr) {
  const by = {}, tot = { spend: 0, clicks: 0, impr: 0, rev: 0 };
  arr.forEach(a => { const k = a.account || '(no account)';
    const g = by[k] || (by[k] = { spend: 0, clicks: 0, impr: 0, rev: 0 });
    g.spend += a.spend; g.clicks += a.clicks; g.impr += a.impressions; g.rev += a.platformRevenue;
    tot.spend += a.spend; tot.clicks += a.clicks; tot.impr += a.impressions; tot.rev += a.platformRevenue; });
  return { by, tot };
}
const adMetrics = g => ({ spend: g.spend, cpc: g.clicks ? g.spend / g.clicks : 0, cpm: g.impr ? g.spend / g.impr * 1000 : 0, roas: g.spend ? g.rev / g.spend : 0, impr: g.impr, ctr: g.impr ? g.clicks / g.impr * 100 : 0 });
// Δ% vs kỳ trước. opt.invert: thấp hơn = tốt (CPC/CPM → giảm xanh); opt.neutral: không phán xét (spend).
function deltaEl(cur, prev, opt, tag) {
  tag = tag || 'span'; if (prev == null) return '';
  let cls, txt;
  if (prev === 0) { if (!cur) return ''; cls = opt && opt.neutral ? 'flat' : 'up'; txt = '▲ new'; }
  else { const pct = (cur - prev) / Math.abs(prev) * 100;
    if (Math.abs(pct) < 0.05) { cls = 'flat'; txt = '—'; }
    else { const up = cur > prev, good = opt && opt.neutral ? null : (opt && opt.invert ? !up : up);
      cls = good === null ? 'flat' : good ? 'up' : 'down'; txt = (up ? '▲' : '▼') + ' ' + Math.abs(pct).toFixed(1) + '%'; } }
  return `<${tag} class="cmp ${cls}">${txt}</${tag}>`;
}
const fM2 = v => '$' + v.toFixed(2), fRoas = v => v.toFixed(2) + 'x', fInt = v => Math.round(v).toLocaleString(), fPct = v => v.toFixed(2) + '%';
// Card tổng theo nền tảng: [label, metricKey, format, deltaOpt]. invert: thấp=tốt; neutral: không phán xét.
const MKT_CARDS = {
  Meta:   [['Amount spent','spend',usd2,{neutral:1}], ['CPC','cpc',fM2,{invert:1}], ['CPM','cpm',fM2,{invert:1}], ['ROAS','roas',fRoas,{}]],
  Google: [['Cost','spend',usd2,{neutral:1}], ['Impressions','impr',fInt,{neutral:1}], ['CTR','ctr',fPct,{}], ['CPC','cpc',fM2,{invert:1}], ['ROAS','roas',fRoas,{}]],
  TikTok: [['Cost','spend',usd2,{neutral:1}], ['CPC','cpc',fM2,{invert:1}], ['CPM','cpm',fM2,{invert:1}], ['ROAS','roas',fRoas,{}]]
};

function vMarketing() {
  const ch = S.mkt || (S.mkt = 'Meta');
  const cur = aggByAccount(adsFiltered().filter(a => a.channel === ch));
  const ps = prevDatesSet();   // kỳ trước cùng độ dài (null nếu range='all')
  const prev = ps ? aggByAccount(DATA.ads.filter(a => a.channel === ch && ps.has(a.date))) : null;
  const ct = adMetrics(cur.tot), pt = prev ? adMetrics(prev.tot) : null;

  const MKT_CLS = { Meta: 'tab-meta', Google: 'tab-goog', TikTok: 'tab-tik' };
  const subnav = `<div class="seg" id="mktNav" style="margin-bottom:12px">${['Meta','Google','TikTok'].map(c => `<button data-c="${c}" class="${MKT_CLS[c]}${ch===c?' on':''}"${ch===c?'':' style="opacity:.45"'}>${mktTabLabel(c)}</button>`).join('')}</div>`;
  const tcard = (lab, key, fmt, opt) => `<div class="card"><p class="l">${lab}</p><p class="v">${fmt(ct[key])}</p>${pt ? deltaEl(ct[key], pt[key], opt, 'p') : ''}</div>`;
  const totals = `<div class="kpi">${MKT_CARDS[ch].map(c => tcard(c[0], c[1], c[2], c[3])).join('')}</div>`;

  // Theo tài khoản — chỉ Meta (nhiều account). Account spend>0 mới hiện.
  let acctPanel = '';
  if (ch === 'Meta') {
    const accts = Object.keys(cur.by).filter(a => cur.by[a].spend > 0).sort((a, b) => cur.by[b].spend - cur.by[a].spend);
    const cell = (m, pm, key, fmt, opt) => `<td>${fmt(m[key])}${pm ? ' ' + deltaEl(m[key], pm[key], opt, 'span') : ''}</td>`;
    const rows = accts.map(a => { const m = adMetrics(cur.by[a]), pm = prev && prev.by[a] ? adMetrics(prev.by[a]) : null;
      return `<tr><td>${a}</td>${cell(m,pm,'spend',usd2,{neutral:1})}${cell(m,pm,'cpc',fM2,{invert:1})}${cell(m,pm,'cpm',fM2,{invert:1})}${cell(m,pm,'roas',fRoas,{})}</tr>`; }).join('');
    acctPanel = `<div class="panel"><h3>Theo tài khoản <span style="font-weight:400;color:var(--muted);font-size:11px">(spend > 0${pt ? ' · Δ vs kỳ trước cùng độ dài' : ''})</span></h3>
      <div class="scroll"><table><thead><tr><th>Tài khoản</th><th>Amount spent</th><th>CPC</th><th>CPM</th><th>ROAS</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="color:var(--muted)">Không có tài khoản nào có spend trong kỳ.</td></tr>'}</tbody></table></div></div>`;
  }

  const trend = `<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0">Trend ${ch}</h3>
      <span class="seg" id="mMetric">${['spend','cpc','cpm','roas'].map(m => `<button data-k="${m}" class="${S.metric===m?'on':''}">${m.toUpperCase()}</button>`).join('')}</span></div>
      <div class="chartwrap r4"><canvas id="mChart"></canvas></div></div>`;

  document.getElementById('view').innerHTML = subnav + totals + acctPanel + trend;
  document.getElementById('mktNav').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { S.mkt = e.target.dataset.c; vMarketing(); } });
  document.getElementById('mMetric').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { S.metric = e.target.dataset.k; vMarketing(); } });

  // Trend chart — chỉ kênh đang chọn.
  const cAds = adsFiltered().filter(a => a.channel === ch);
  const dates = [...new Set(cAds.map(a => a.date))].sort();
  const data = dates.map(d => { const m = adMetrics(aggByAccount(cAds.filter(x => x.date === d)).tot);
    return S.metric === 'spend' ? m.spend : S.metric === 'cpc' ? m.cpc : S.metric === 'cpm' ? m.cpm : m.roas; });
  lineChart('mChart', dates, [{ label: ch, data, borderColor: MKT_COL[ch], backgroundColor: MKT_COL[ch], pointRadius: 0, borderWidth: 2, tension: .3 }]);
}

// ============ PRODUCT ============
function vProduct() {
  const fact = factFiltered();
  const byType={}; fact.forEach(r=>{const t=r['Product Type'];byType[t]=byType[t]||{u:0,rev:0};byType[t].u+=r.Quantity;byType[t].rev+=r.Revenue;});
  const totRev=sum(Object.values(byType),x=>x.rev)||1;
  const byRec={}; fact.forEach(r=>{byRec[r.Recipient]=(byRec[r.Recipient]||0)+r.Revenue;});
  const recCol={Papa:'#378ADD',Maman:'#D4537E',Mamie:'#1D9E75',Papy:'#EF9F27','Pet Lover':'#7F77DD',Other:'#8a93a8'};
  document.getElementById('view').innerHTML = `
    <div class="panel"><h3>Theo product type — units vs value</h3>
      <div class="scroll"><table><thead><tr><th>Product Type</th><th>Units</th><th>Revenue</th><th>% Revenue</th></tr></thead><tbody>${
        Object.keys(byType).sort((a,b)=>byType[b].rev-byType[a].rev).map(t=>{const x=byType[t];return `<tr><td>${t}</td><td>${Math.round(x.u).toLocaleString()}</td><td>${x.rev?k$(x.rev):'<span style="color:var(--muted)">$0 (sub)</span>'}</td><td>${x.rev?(x.rev/totRev*100).toFixed(1)+'%':'—'}</td></tr>`;}).join('')
      }</tbody></table></div>
      <p class="note">Sub-item (Support/Insurance/Back side card) có Units nhưng Revenue=0 (giá trị dồn vào main).</p></div>
    <div class="row">
      <div class="panel"><h3>Recipient — revenue share</h3><div class="chartwrap"><canvas id="pDonut"></canvas></div></div>
      <div class="panel"><h3>Papa vs Maman theo thời gian</h3><div class="chartwrap"><canvas id="pTrend"></canvas></div></div>
    </div>`;
  destroyChart('pDonut');
  CH['pDonut']=new Chart(document.getElementById('pDonut'),{type:'doughnut',data:{labels:Object.keys(byRec),datasets:[{data:Object.values(byRec).map(v=>Math.round(v)),backgroundColor:Object.keys(byRec).map(r=>recCol[r]||'#8a93a8'),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#93a4c4',boxWidth:10,font:{size:11}}}}}});
  const dates=[...new Set(fact.map(r=>r.Date))].sort();
  const series=rec=>dates.map(d=>sum(fact.filter(r=>r.Date===d&&r.Recipient===rec),r=>r.Revenue));
  lineChart('pTrend',dates,[{label:'Papa',data:series('Papa'),borderColor:'#378ADD',pointRadius:0,borderWidth:2,tension:.3},{label:'Maman',data:series('Maman'),borderColor:'#D4537E',pointRadius:0,borderWidth:2,tension:.3}]);
}

// ============ EXPLORER ============
function vExplorer() {
  const fact = factFiltered();
  const sumRev=sum(fact,r=>r.Revenue), sumAds=sum(fact,r=>r['Total Ads Spend']);
  const other=sum(fact.filter(r=>r['Product Type']==='Other'),r=>r.Revenue);
  const mkts=[...new Set(fact.map(r=>r.Market))], types=[...new Set(fact.map(r=>r['Product Type']))], recs=[...new Set(fact.map(r=>r.Recipient))];
  document.getElementById('view').innerHTML = `
    <div class="kpi">
      <div class="card"><p class="l">Σ Revenue (range)</p><p class="v">${usd(sumRev)}</p></div>
      <div class="card"><p class="l">Σ Total Ads</p><p class="v">${usd(sumAds)}</p></div>
      <div class="card"><p class="l">% Revenue Other (type)</p><p class="v ${other/sumRev>0.1?'warn':'ok'}">${(other/sumRev*100||0).toFixed(1)}%</p></div>
      <div class="card"><p class="l">Provisional</p><p class="v" style="color:var(--amber)">${DATA.provisionalDays} ngày</p></div>
    </div>
    <div class="panel"><h3>Bảng chi tiết</h3>
      <div class="filters">
        <select id="fM"><option value="">Market: All</option>${mkts.map(m=>`<option>${m}</option>`).join('')}</select>
        <select id="fT"><option value="">Type: All</option>${types.map(t=>`<option>${t}</option>`).join('')}</select>
        <select id="fR"><option value="">Recipient: All</option>${recs.map(r=>`<option>${r}</option>`).join('')}</select>
        <input id="fQ" placeholder="Search…" style="flex:1;min-width:120px">
      </div>
      <div class="scroll"><table><thead><tr><th>Date</th><th>Market</th><th>Type</th><th>Recipient</th><th>Meta</th><th>Google</th><th>TikTok</th><th>Total Ads</th><th>API</th><th>Fulfill</th><th>Fixed</th><th>Total Cost</th><th>Revenue</th><th>Profit</th></tr></thead><tbody id="expRows"></tbody></table></div></div>`;
  const draw=()=>{const fm=fM.value,ft=fT.value,fr=fR.value,q=fQ.value.toLowerCase();
    const out=fact.filter(r=>(!fm||r.Market===fm)&&(!ft||r['Product Type']===ft)&&(!fr||r.Recipient===fr)&&(!q||(r.Date+r.Market+r['Product Type']+r.Recipient).toLowerCase().includes(q))).slice(0,400);
    document.getElementById('expRows').innerHTML=out.map(r=>`<tr><td>${r.Date.slice(5)}</td><td>${r.Market}</td><td>${r['Product Type']}</td><td>${r.Recipient}</td><td>${k$(r['Meta Spend'])}</td><td>${k$(r['Google Spend'])}</td><td>${k$(r['TikTok Spend'])}</td><td>${k$(r['Total Ads Spend'])}</td><td>${k$(r['API Cost'])}</td><td>${k$(r.Fulfillment)}</td><td>${k$(r['Fixed Cost'])}</td><td>${k$(r['Total Cost'])}</td><td>${k$(r.Revenue)}</td><td class="${r.Profit<0?'neg':''}">${k$(r.Profit)}</td></tr>`).join('');};
  ['fM','fT','fR'].forEach(id=>document.getElementById(id).addEventListener('change',draw));
  document.getElementById('fQ').addEventListener('input',draw); draw();
}

// ============ FORECAST (Father's Day FR 21/6 — chuẩn bị dòng tiền) ============
const FC_EVENT = '2026-06-21', FC_CUT_STD = '2026-06-12', FC_CUT_EXP = '2026-06-16';
const FC_WIN_START = '2026-05-22', FC_WIN_END = '2026-07-06';
// đường cong cầu (days-before-event → hệ số), khuôn từ Father's Day Đức 2026 (đỉnh quanh cut-off, rớt sau)
const FC_CURVE = [[30,0.55],[22,0.78],[16,1.0],[12,1.35],[9,1.6],[5,1.85],[3,1.4],[0,0.75],[-7,0.5],[-15,0.45]];
function vForecast() {
  const ov = DATA.overview.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!ov.length) { document.getElementById('view').innerHTML = '<div class="panel">Chưa có data.</div>'; return; }
  const lastActual = ov[ov.length - 1].date, ovBy = {}; ov.forEach(o => ovBy[o.date] = o);
  const last7 = ov.slice(-7), last10 = ov.slice(-10);
  const S0 = (sum(last7, o => o.totalAds) / (last7.length || 1)) || 1;
  const curROAS = sum(last7, o => o.totalAds) ? sum(last7, o => o.revenue) / sum(last7, o => o.totalAds) : 2;
  const fulfillRatio = sum(last10, o => o.revenue) ? sum(last10, o => o.fulfill) / sum(last10, o => o.revenue) : 0;
  const varCost = sum(last10, o => o.revenue) ? sum(last10, o => (o.api + o.fulfill + (o.fixed || 0))) / sum(last10, o => o.revenue) : 0.4;
  const rawCurve = d => { const x = daysBetween(d, FC_EVENT), C = FC_CURVE;
    if (x >= C[0][0]) return C[0][1]; if (x <= C[C.length-1][0]) return C[C.length-1][1];
    for (let i = 0; i < C.length-1; i++) { const a = C[i], b = C[i+1]; if (x <= a[0] && x >= b[0]) return a[1] + (b[1]-a[1]) * (a[0]-x) / (a[0]-b[0]); } return 1; };
  const norm = rawCurve(lastActual) || 1, curveMod = d => rawCurve(d) / norm;
  const c0 = 0.7, k0 = -S0 / Math.log(1 - c0);   // k co giãn theo cầu ở build()
  const windowDates = []; for (let d = FC_WIN_START; d <= FC_WIN_END; d = addDaysStr(d, 1)) windowDates.push(d);
  S.fc = S.fc || {};
  if (S.fc.roas == null) S.fc.roas = Math.round(curROAS * 100) / 100;
  const futureD = windowDates.filter(d => d > lastActual);
  const NS = sum(futureD, d => S0 * curveMod(d)) || 1;   // tổng spend "bám cầu" tương lai (scale=1 → ROAS ≈ slider)
  if (S.fc.tgtSpend == null) S.fc.tgtSpend = Math.round(NS / 1000) * 1000;

  function build() {
    const ROAS = S.fc.roas, D0 = (S0 * ROAS) / c0, scale = (S.fc.tgtSpend || NS) / NS;
    const fc = {};
    futureD.forEach(d => {
      const m = curveMod(d), spend = S0 * m * scale, kt = k0 * m;   // rải Target Spend theo đường cầu
      const rev = D0 * m * (1 - Math.exp(-spend / kt));
      fc[d] = { spend, rev, profit: rev * (1 - varCost) - spend, ful: rev * fulfillRatio };
    });
    return fc;
  }
  function totals(fc) {
    const fut = futureD.filter(d => fc[d]), act = windowDates.filter(d => d <= lastActual && ovBy[d]);
    const spF = sum(fut, d => fc[d].spend), revF = sum(fut, d => fc[d].rev);
    return { fut, act, spend: spF, fulfillNeed: sum(fut, d => fc[d].ful),
      cash7: sum(fut.slice(0, 7), d => fc[d].spend + fc[d].ful), effRoas: spF ? revF / spF : 0,
      totRev: sum(act, d => ovBy[d].revenue) + revF,
      totProfit: sum(act, d => ovBy[d].profit) + sum(fut, d => fc[d].profit) };
  }

  function recompute() {
    S.fc.roas = +fcRoas.value; S.fc.tgtSpend = +fcTgtSpend.value || 0;
    fcRoasV.textContent = S.fc.roas.toFixed(2) + 'x';
    const fc = build(), t = totals(fc);
    document.getElementById('fcKpi').innerHTML = [
      `<div class="card"><p class="l">💵 Forecast Revenue (cả kỳ)</p><p class="v">${usd(t.totRev)}</p></div>`,
      `<div class="card"><p class="l">📈 Forecast Net Profit (cả kỳ)</p><p class="v ${t.totProfit<0?'neg':''}">${usd(t.totProfit)}</p></div>`,
      `<div class="card"><p class="l">📊 ROAS hiệu dụng</p><p class="v">${t.effRoas.toFixed(2)}x</p><p class="p">trên spend ${usd(t.spend)}</p></div>`,
      `<div class="card"><p class="l">📦 Fulfill cần chuẩn bị</p><p class="v">${usd2(t.fulfillNeed)}</p><p class="p">${(fulfillRatio*100).toFixed(0)}% revenue</p></div>`,
      `<div class="card"><p class="l">⏳ Tiền cần 7 ngày tới</p><p class="v" style="color:var(--amber)">${usd2(t.cash7)}</p><p class="p">spend + fulfill</p></div>`
    ].join('');
    const aRev = windowDates.map(d => (ovBy[d] && d <= lastActual) ? ovBy[d].revenue : null);
    const aSp = windowDates.map(d => (ovBy[d] && d <= lastActual) ? ovBy[d].totalAds : null);
    const aPf = windowDates.map(d => (ovBy[d] && d <= lastActual) ? ovBy[d].profit : null);
    const fRev = windowDates.map(() => null), fSp = windowDates.map(() => null), fPf = windowDates.map(() => null);
    const li = windowDates.indexOf(lastActual);
    if (li >= 0 && ovBy[lastActual]) { fRev[li] = ovBy[lastActual].revenue; fSp[li] = ovBy[lastActual].totalAds; fPf[li] = ovBy[lastActual].profit; }
    windowDates.forEach((d, i) => { if (fc[d]) { fRev[i] = Math.round(fc[d].rev); fSp[i] = Math.round(fc[d].spend); fPf[i] = Math.round(fc[d].profit); } });
    const sol = (lab, dt, c) => ({ label: lab, data: dt, borderColor: c, pointRadius: 0, borderWidth: 2, tension: .3, spanGaps: false });
    const dsh = (lab, dt, c) => ({ label: lab, data: dt, borderColor: c, borderDash: [5, 4], pointRadius: 0, borderWidth: 2, tension: .3, spanGaps: false });
    lineChart('fcChart', windowDates, [
      sol('Revenue', aRev, '#378ADD'), dsh('Rev (fc)', fRev, 'rgba(55,138,221,.75)'),
      sol('Spend', aSp, '#EF9F27'), dsh('Spend (fc)', fSp, 'rgba(239,159,39,.75)'),
      sol('Profit', aPf, '#1D9E75'), dsh('Profit (fc)', fPf, 'rgba(29,158,117,.75)')]);
  }
  document.getElementById('view').innerHTML = `
    <div class="panel"><h3>Forecast — Father's Day 🇫🇷 21/6 <span style="font-weight:400;color:var(--muted);font-size:11px">(chuẩn bị dòng tiền · cut-off thường 12/6, express 16/6)</span></h3>
      <div class="fields">
        <div class="fld"><label>💰 Target Total Spend (từ nay → ${FC_WIN_END.slice(5)})</label><input type="number" id="fcTgtSpend" value="${S.fc.tgtSpend}" step="1000"></div>
        <div class="fld"><label>ROAS dự kiến: <b id="fcRoasV">${S.fc.roas.toFixed(2)}x</b></label><input type="range" id="fcRoas" min="1" max="4" step="0.05" value="${S.fc.roas}"></div>
      </div>
      <div id="fcKpi" class="kpi"></div>
      <div class="chartwrap"><canvas id="fcChart"></canvas></div>
      <p class="note">Nhập Target Total Spend → rải theo đường cầu (khuôn Đức, đỉnh 12–16/6) → ra Revenue/Profit. Spend càng cao thì ROAS hiệu dụng càng giảm (bão hòa). Mặc định = mức "bám sát cầu" (ROAS ≈ hiện tại ${curROAS.toFixed(2)}x). varCost ${(varCost*100).toFixed(0)}% & fulfill ${(fulfillRatio*100).toFixed(0)}% tự tính thực tế. Ngày đã có data = số thực, còn lại = dự báo.</p>
    </div>`;
  document.getElementById('fcRoas').addEventListener('input', recompute);
  document.getElementById('fcTgtSpend').addEventListener('input', recompute);
  recompute();
}

// ----- chart helper (dark theme) -----
function lineChart(id, labels, datasets) {
  destroyChart(id);
  CH[id] = new Chart(document.getElementById(id), { type: 'line', data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#93a4c4', boxWidth: 12, font: { size: 11 }, usePointStyle: true } } },
      scales: { y: { ticks: { color: '#93a4c4', font: { size: 10 }, callback: v => Math.abs(v) >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : v }, grid: { color: '#243154' } },
                x: { ticks: { color: '#93a4c4', font: { size: 9 }, maxTicksLimit: 9 }, grid: { color: '#1a2540' } } } } });
}
