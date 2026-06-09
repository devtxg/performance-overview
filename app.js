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
  // Product: card riêng (Total Main Item, Revenue Sub Item từ fact).
  if (S.tab === 'product') {
    const f = factFiltered();
    const mainU = sum(f, r => +r['Main Units'] || 0), subRev = sum(f, r => +r['Sub Revenue'] || 0);
    const pc = (l, v, sub) => `<div class="card"><p class="l">${l}</p><p class="v">${v}</p>${sub ? `<p class="p">${sub}</p>` : ''}</div>`;
    document.getElementById('kpi').innerHTML = `<div class="kpi">${
      pc('Total Orders', cur.orders.toLocaleString()) +
      pc('Total Sales', usd2(cur.sales)) +
      pc('Total Main Item', Math.round(mainU).toLocaleString()) +
      pc('AOV', usd2(cur.aov)) +
      pc('Revenue Sub Item', usd2(subRev), (subRev / cur.sales * 100 || 0).toFixed(1) + '% of sales')
    }</div>`;
    return;
  }
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
  document.getElementById('mktNav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.mkt = b.dataset.c; vMarketing(); } });   // closest: click trúng <span> chữ vẫn nhận
  document.getElementById('mMetric').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { S.metric = e.target.dataset.k; vMarketing(); } });

  // Trend chart — chỉ kênh đang chọn.
  const cAds = adsFiltered().filter(a => a.channel === ch);
  const dates = [...new Set(cAds.map(a => a.date))].sort();
  const data = dates.map(d => { const m = adMetrics(aggByAccount(cAds.filter(x => x.date === d)).tot);
    return S.metric === 'spend' ? m.spend : S.metric === 'cpc' ? m.cpc : S.metric === 'cpm' ? m.cpm : m.roas; });
  lineChart('mChart', dates, [{ label: ch, data, borderColor: MKT_COL[ch], backgroundColor: MKT_COL[ch], pointRadius: 0, borderWidth: 2, tension: .3 }]);
}

// ============ PRODUCT ============
// Bảng top sản phẩm theo lượng bán (units) trong time range, kèm ảnh Shopify.
function productSalesTable() {
  if (!DATA.productSales) return '';
  const r = rangeDates(), meta = DATA.productMeta || {}, agg = {};
  DATA.productSales.forEach(s => { if (!r.has(s.d)) return; const g = agg[s.p] || (agg[s.p] = { u: 0, rev: 0 }); g.u += s.u; g.rev += s.rev; });
  const list = Object.keys(agg).filter(p => agg[p].u > 0).sort((a, b) => agg[b].u - agg[a].u).slice(0, 50);
  if (!list.length) return '';
  const rows = list.map((p, i) => { const m = meta[p] || {};
    const img = m.img ? `<img src="${m.img}" loading="lazy" style="width:38px;height:38px;object-fit:cover;border-radius:6px;background:var(--surface2)">`
      : `<div style="width:38px;height:38px;border-radius:6px;background:var(--surface2)"></div>`;
    return `<tr><td>${i + 1}</td><td>${img}</td><td style="white-space:normal;max-width:320px">${m.t || p}</td><td>${Math.round(agg[p].u).toLocaleString()}</td><td>${k$(agg[p].rev)}</td></tr>`; }).join('');
  return `<div class="panel"><h3>Top sản phẩm theo lượng bán <span style="font-weight:400;color:var(--muted);font-size:11px">(theo time range · top 50 · units = SL bán)</span></h3>
    <div class="scroll" style="max-height:560px;overflow:auto"><table><thead><tr><th>#</th><th>Ảnh</th><th>Sản phẩm</th><th>Units</th><th>Revenue</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function vProduct() {
  const fact = factFiltered();
  const recCol = { Papa:'#378ADD', Maman:'#D4537E', Mamie:'#1D9E75', Papy:'#EF9F27', 'Pet Lover':'#7F77DD', Other:'#8a93a8' };
  const recMode = S.pRecMode || (S.pRecMode = 'pm');   // 'pm' = Papa vs Maman; 'all' = tất cả recipient

  // gom theo loại SP: main units, sub units, sub revenue
  const byType = {};
  fact.forEach(r => { const t = r['Product Type']; const g = byType[t] || (byType[t] = { mainU:0, subU:0, subRev:0 });
    g.mainU += +r['Main Units']||0; g.subU += +r['Sub Units']||0; g.subRev += +r['Sub Revenue']||0; });
  const totMainU = sum(Object.values(byType), x => x.mainU) || 1;
  const mainRows = Object.keys(byType).filter(t => byType[t].mainU > 0).sort((a,b)=>byType[b].mainU-byType[a].mainU)
    .map(t => `<tr><td>${t}</td><td>${Math.round(byType[t].mainU).toLocaleString()}</td><td>${(byType[t].mainU/totMainU*100).toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">—</td></tr>';
  const subRows = Object.keys(byType).filter(t => byType[t].subU > 0).sort((a,b)=>byType[b].subRev-byType[a].subRev)
    .map(t => `<tr><td>${t}</td><td>${Math.round(byType[t].subU).toLocaleString()}</td><td>${k$(byType[t].subRev)}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">—</td></tr>';

  // gom theo recipient (gộp Pet Lover vào Other)
  const REC5 = ['Papa','Maman','Mamie','Papy','Other'];
  const byRec = {}; REC5.forEach(r => byRec[r] = { mainU:0, rev:0 });
  fact.forEach(r => { const rec = byRec[r.Recipient] ? r.Recipient : 'Other'; byRec[rec].mainU += +r['Main Units']||0; byRec[rec].rev += r.Revenue; });
  const totRev = sum(REC5, r => byRec[r].rev) || 1;
  const recRows = REC5.filter(r => byRec[r].rev > 0 || byRec[r].mainU > 0).sort((a,b)=>byRec[b].rev-byRec[a].rev)
    .map(r => `<tr><td><span style="color:${recCol[r]}">●</span> ${r}</td><td>${Math.round(byRec[r].mainU).toLocaleString()}</td><td>${(byRec[r].rev/totRev*100).toFixed(1)}%</td></tr>`).join('');

  document.getElementById('view').innerHTML = `
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">Recipient theo thời gian</h3>
      <span class="seg" id="pRecMode"><button data-r="pm" class="${recMode==='pm'?'on':''}">Papa vs Maman</button><button data-r="all" class="${recMode==='all'?'on':''}">Tất cả recipient</button></span></div>
      <div class="chartwrap r4"><canvas id="pTrend"></canvas></div></div>
    <div class="row">
      <div class="panel"><h3>Main item — số lượng bán</h3>
        <div class="scroll"><table><thead><tr><th>Item</th><th>Units</th><th>% units</th></tr></thead><tbody>${mainRows}</tbody></table></div></div>
      <div class="panel"><h3>Sub item — số lượng & doanh thu</h3>
        <div class="scroll"><table><thead><tr><th>Item</th><th>Units</th><th>Total Sale</th></tr></thead><tbody>${subRows}</tbody></table></div></div>
    </div>
    <div class="row">
      <div class="panel"><h3>Theo đối tượng (recipient)</h3>
        <div class="scroll"><table><thead><tr><th>Đối tượng</th><th>Main item bán</th><th>Revenue Share</th></tr></thead><tbody>${recRows}</tbody></table></div></div>
      <div class="panel"><h3>Recipient — revenue share</h3><div class="chartwrap"><canvas id="pDonut"></canvas></div></div>
    </div>
    ${productSalesTable()}`;
  document.getElementById('pRecMode').addEventListener('click',e=>{const b=e.target.closest('button');if(b){S.pRecMode=b.dataset.r;vProduct();}});
  destroyChart('pDonut');
  CH['pDonut']=new Chart(document.getElementById('pDonut'),{type:'doughnut',data:{labels:REC5,datasets:[{data:REC5.map(r=>Math.round(byRec[r].rev)),backgroundColor:REC5.map(r=>recCol[r]),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#93a4c4',boxWidth:10,font:{size:11}}}}}});
  const dates=[...new Set(fact.map(r=>r.Date))].sort();
  const series=rec=>dates.map(d=>sum(fact.filter(r=>r.Date===d&&r.Recipient===rec),r=>r.Revenue));
  const allRec={}; fact.forEach(r=>allRec[r.Recipient]=(allRec[r.Recipient]||0)+r.Revenue);
  const recs = recMode==='all' ? Object.keys(allRec).filter(r=>allRec[r]>0).sort((a,b)=>allRec[b]-allRec[a]) : ['Papa','Maman'];
  lineChart('pTrend',dates,recs.map(r=>({label:r,data:series(r),borderColor:recCol[r]||'#8a93a8',backgroundColor:recCol[r]||'#8a93a8',pointRadius:0,borderWidth:2,tension:.3})));
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
const FC_EVENT = '2026-06-21', FC_CUT_STD = '2026-06-12', FC_CUT_EXP = '2026-06-16', FC_END = '2026-06-30';
// đường cong cầu (days-before-event → hệ số): tăng vào cut-off, đỉnh ~express (16/6), rớt mạnh sau, đuôi sau sự kiện.
const FC_CURVE = [[30,0.50],[16,0.85],[12,1.05],[9,1.45],[5,1.70],[3,1.15],[1,0.80],[0,0.60],[-3,0.42],[-9,0.35]];
function vForecast() {
  const ov = DATA.overview.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!ov.length) { document.getElementById('view').innerHTML = '<div class="panel">Chưa có data.</div>'; return; }
  const lastActual = ov[ov.length - 1].date, ovBy = {}; ov.forEach(o => ovBy[o.date] = o);
  const last7 = ov.slice(-7);
  const sumSp = sum(last7, o => o.totalAds), sumRev = sum(last7, o => o.revenue);
  const S0 = sumSp / (last7.length || 1) || 1, R0 = sumRev / (last7.length || 1) || 1;   // spend & revenue TB/ngày
  const curROAS = sumSp ? sumRev / sumSp : 2;
  const fulfillR = sumRev ? sum(last7, o => o.fulfill) / sumRev : 0.25;
  const varCost = sumRev ? sum(last7, o => (o.api + o.fulfill + (o.fixed || 0))) / sumRev : 0.4;   // % chi phí biến đổi (fulfill+fixed+API)
  const rawCurve = d => { const x = daysBetween(d, FC_EVENT), C = FC_CURVE;
    if (x >= C[0][0]) return C[0][1]; if (x <= C[C.length-1][0]) return C[C.length-1][1];
    for (let i = 0; i < C.length-1; i++) { const a = C[i], b = C[i+1]; if (x <= a[0] && x >= b[0]) return a[1] + (b[1]-a[1]) * (a[0]-x) / (a[0]-b[0]); } return 1; };
  const mBase = sum(last7, o => rawCurve(o.date)) / (last7.length || 1) || 1;   // hệ số cầu TB của baseline
  const spendU = S0 / mBase, revU = R0 / mBase;   // per-unit (cầu = 1.0) ở mức spend hiện tại

  S.fc = S.fc || {};
  if (S.fc.c0 == null) S.fc.c0 = 0.70;    // capture: spend hiện tại đang "bắt" ~70% cầu (độ bão hòa)
  const futureD = []; for (let d = addDaysStr(lastActual, 1); d <= FC_END; d = addDaysStr(d, 1)) futureD.push(d);
  const winStart = addDaysStr(lastActual, -20);
  const winDates = []; for (let d = winStart; d <= FC_END; d = addDaysStr(d, 1)) winDates.push(d);

  // Mô hình bão hòa: f = mức chi vs cầu (1.0 = bám cầu). revenue ∝ (1−(1−c0)^f); spend ∝ f → chi ít vẫn giữ phần lớn doanh thu.
  const dayFc = (d, f, c0) => { const m = rawCurve(d), spend = spendU * m * f, rev = (revU / c0) * m * (1 - Math.pow(1 - c0, f));
    return { spend, rev, profit: rev * (1 - varCost) - spend, ful: rev * fulfillR }; };
  const totals = (f, c0) => { let sp = 0, rev = 0, prof = 0, ful = 0;
    futureD.forEach(d => { const x = dayFc(d, f, c0); sp += x.spend; rev += x.rev; prof += x.profit; ful += x.ful; });
    return { spend: sp, rev, profit: prof, fulfill: ful, roas: sp ? rev / sp : 0, margin: rev ? prof / rev : 0, cash: sp + ful }; };

  // tìm mức chi tối ưu PROFIT
  let bestF = 1, bestP = -1e18;
  for (let f = 0.4; f <= 1.5001; f += 0.05) { const p = totals(f, S.fc.c0).profit; if (p > bestP) { bestP = p; bestF = Math.round(f * 100) / 100; } }
  if (S.fc.f == null) S.fc.f = bestF;   // mở tab ở mức tối ưu profit

  function render() {
    const f = S.fc.f, c0 = S.fc.c0, t = totals(f, c0);
    document.getElementById('fcFV').textContent = Math.round(f * 100) + '%';
    document.getElementById('fcC0V').textContent = Math.round(c0 * 100) + '%';
    document.getElementById('fcKpi').innerHTML = [
      `<div class="card"><p class="l">📈 Net Profit (còn lại)</p><p class="v ${t.profit<0?'neg':''}">${usd(t.profit)}</p><p class="p">margin ${(t.margin*100).toFixed(0)}%</p></div>`,
      `<div class="card"><p class="l">💵 Revenue (còn lại)</p><p class="v">${usd(t.rev)}</p></div>`,
      `<div class="card"><p class="l">📊 Ad Spend (còn lại)</p><p class="v">${usd(t.spend)}</p><p class="p">ROAS ${t.roas.toFixed(2)}x</p></div>`,
      `<div class="card"><p class="l">📦 Fulfill cần chuẩn bị</p><p class="v">${usd(t.fulfill)}</p><p class="p">${(fulfillR*100).toFixed(0)}% revenue</p></div>`,
      `<div class="card"><p class="l">⏳ Tiền cần chuẩn bị</p><p class="v" style="color:var(--amber)">${usd(t.cash)}</p><p class="p">spend + fulfill</p></div>`
    ].join('');
    // bảng kịch bản
    const set = [0.6, 0.8, 1.0, 1.2, 1.4]; if (!set.some(s => Math.abs(s-bestF)<1e-9)) set.push(bestF); set.sort((a,b)=>a-b);
    document.getElementById('fcScen').innerHTML = set.map(s => { const ts = totals(s, c0), hot = Math.abs(s-bestF)<1e-9, cur = Math.abs(s-f)<1e-9;
      return `<tr class="${hot?'fcbest':''}${cur?' fccur':''}" style="cursor:pointer" data-f="${s}"><td>${Math.round(s*100)}%${hot?' ⭐':''}${cur?' ◀':''}</td><td>${k$(ts.spend)}</td><td>${k$(ts.rev)}</td><td class="${ts.profit<0?'neg':''}">${k$(ts.profit)}</td><td>${ts.roas.toFixed(2)}x</td><td>${(ts.margin*100).toFixed(0)}%</td></tr>`; }).join('');
    document.querySelectorAll('#fcScen tr[data-f]').forEach(tr => tr.addEventListener('click', () => { S.fc.f = +tr.dataset.f; document.getElementById('fcF').value = S.fc.f; render(); }));
    // chart
    const aRev = winDates.map(d => (ovBy[d] && d <= lastActual) ? ovBy[d].revenue : null);
    const aPf = winDates.map(d => (ovBy[d] && d <= lastActual) ? ovBy[d].profit : null);
    const fRev = winDates.map(() => null), fPf = winDates.map(() => null);
    const li = winDates.indexOf(lastActual);
    if (li >= 0 && ovBy[lastActual]) { fRev[li] = ovBy[lastActual].revenue; fPf[li] = ovBy[lastActual].profit; }
    winDates.forEach((d, i) => { if (d > lastActual) { const x = dayFc(d, f, c0); fRev[i] = Math.round(x.rev); fPf[i] = Math.round(x.profit); } });
    const sol = (lab, dt, c) => ({ label: lab, data: dt, borderColor: c, pointRadius: 0, borderWidth: 2, tension: .3, spanGaps: false });
    const dsh = (lab, dt, c) => ({ label: lab, data: dt, borderColor: c, borderDash: [5, 4], pointRadius: 0, borderWidth: 2, tension: .3, spanGaps: false });
    fcLineChart('fcChart', winDates, [
      sol('Revenue', aRev, '#378ADD'), dsh('Rev (dự báo)', fRev, 'rgba(55,138,221,.85)'),
      sol('Profit', aPf, '#1D9E75'), dsh('Profit (dự báo)', fPf, 'rgba(29,158,117,.85)')],
      [{ date: FC_CUT_STD, label: 'Cut thường 12/6' }, { date: FC_CUT_EXP, label: 'Cut express 16/6' }, { date: FC_EVENT, label: "Father's Day 21/6" }]);
  }

  document.getElementById('view').innerHTML = `
    <div class="panel"><h3>Forecast tối ưu Profit — Father's Day 🇫🇷 <span style="font-weight:400;color:var(--muted);font-size:11px">(còn lại ${addDaysStr(lastActual,1).slice(5)} → ${FC_END.slice(5)} · cut thường 12/6, express 16/6, sự kiện 21/6)</span></h3>
      <div class="fields">
        <div class="fld"><label>🎚️ Mức chi tiêu vs "bám cầu": <b id="fcFV"></b></label><input type="range" id="fcF" min="0.4" max="1.5" step="0.05" value="${S.fc.f}"></div>
        <div class="fld"><label>📐 Độ bão hòa hiện tại (capture): <b id="fcC0V"></b></label><input type="range" id="fcC0" min="0.5" max="0.85" step="0.05" value="${S.fc.c0}"></div>
      </div>
      <div id="fcKpi" class="kpi"></div>
      <div class="chartwrap r4"><canvas id="fcChart"></canvas></div>
      <h3 style="margin:14px 0 6px">So sánh kịch bản chi tiêu — phần còn lại</h3>
      <div class="scroll"><table><thead><tr><th>Mức chi</th><th>Ad Spend</th><th>Revenue</th><th>Net Profit</th><th>ROAS</th><th>Margin</th></tr></thead><tbody id="fcScen"></tbody></table></div>
      <p class="note">⭐ = mức tối đa PROFIT. <b>Bấm một dòng để chọn.</b> Mô hình bão hòa: chi 100% = bám sát cầu (ROAS ≈ hiện tại ${curROAS.toFixed(2)}x); chi ít hơn vẫn giữ phần lớn doanh thu nên lãi thường cao hơn. Kéo "độ bão hòa": cao = chi hiện tại đã gần kịch trần cầu → cắt spend càng an toàn. varCost ${(varCost*100).toFixed(0)}% & fulfill ${(fulfillR*100).toFixed(0)}% tự tính từ 7 ngày thực. Đường liền = thực, nét đứt = dự báo.</p>
    </div>`;
  document.getElementById('fcF').addEventListener('input', e => { S.fc.f = +e.target.value; render(); });
  document.getElementById('fcC0').addEventListener('input', e => { S.fc.c0 = +e.target.value;
    let bp = -1e18; for (let g = 0.4; g <= 1.5001; g += 0.05) { const p = totals(g, S.fc.c0).profit; if (p > bp) { bp = p; bestF = Math.round(g*100)/100; } } render(); });
  render();
}

// line chart + vạch dọc mốc (cut-off / sự kiện)
function fcLineChart(id, labels, datasets, markers) {
  destroyChart(id);
  const mk = { id: 'fcMk', afterDraw(ch) { const { ctx, chartArea: { top, bottom }, scales: { x } } = ch; ctx.save();
    (markers || []).forEach(m => { const i = labels.indexOf(m.date); if (i < 0) return; const px = x.getPixelForValue(i);
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.strokeStyle = 'rgba(212,83,126,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#D4537E'; ctx.font = '9px Inter,sans-serif'; ctx.fillText(m.label, px + 3, top + 9); }); ctx.restore(); } };
  CH[id] = new Chart(document.getElementById(id), { type: 'line', data: { labels, datasets }, plugins: [mk],
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#93a4c4', boxWidth: 12, font: { size: 11 }, usePointStyle: true } } },
      scales: { y: { ticks: { color: '#93a4c4', font: { size: 10 }, callback: v => Math.abs(v) >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : v }, grid: { color: '#243154' } },
                x: { ticks: { color: '#93a4c4', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: '#1a2540' } } } } });
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
