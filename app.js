/* Koccie Dashboard v1 — đọc ./data.json, render 5 tab client-side. */
let DATA = null, CH = {};
const S = { tab: 'overview', range: 'all', cFrom: '', cTo: '', mode: 'daily', metric: 'spend', dim: 'market', pMarket: 'all' };

const usd = n => '$' + (Math.round(n)).toLocaleString('en-US');
const usd2 = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const k$ = n => Math.abs(n) >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n);
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
function destroyChart(id) { if (CH[id]) { CH[id].destroy(); delete CH[id]; } }

fetch('./data.json?_=' + Date.now()).then(r => r.json()).then(d => {
  DATA = d;
  document.getElementById('genAt').textContent = 'cập nhật ' + (d.generatedAt || '').slice(0, 16).replace('T', ' ');
  // init custom range bounds
  const dates = d.overview.map(o => o.date).sort();
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
    render();
  });
  document.getElementById('cFrom').addEventListener('change', e => { S.cFrom = e.target.value; if (S.range === 'custom') render(); });
  document.getElementById('cTo').addEventListener('change', e => { S.cTo = e.target.value; if (S.range === 'custom') render(); });
}

// ----- date range -----
function rangeDates() {
  const all = DATA.overview.map(o => o.date).sort();
  if (S.range === 'all') return new Set(all);
  if (S.range === 'custom') return new Set(all.filter(d => d >= S.cFrom && d <= S.cTo));
  const n = +S.range, keep = all.slice(-n);
  return new Set(keep);
}
const ovFiltered = () => { const r = rangeDates(); return DATA.overview.filter(o => r.has(o.date)); };
const factFiltered = () => { const r = rangeDates(); return DATA.fact.filter(o => r.has(o.Date)); };
const adsFiltered = () => { const r = rangeDates(); return DATA.ads.filter(o => r.has(o.date)); };

// ===== KPI strip (mọi tab) =====
function renderKPI() {
  const ov = ovFiltered();
  const S_ = sum(ov, o => o.revenue), A = sum(ov, o => o.totalAds), O = sum(ov, o => o.orders);
  const fb = sum(ov, o => o.meta), gg = sum(ov, o => o.google);
  const api = sum(ov, o => o.api), ful = sum(ov, o => o.fulfill), net = sum(ov, o => o.profit);
  const cards = [
    ['Total Orders', O.toLocaleString()], ['Total Sales', usd2(S_)],
    ['Total Ads Spend', usd2(A), (A / S_ * 100 || 0).toFixed(1) + '% of sales'],
    ['FB Ads', usd2(fb), (fb / A * 100 || 0).toFixed(1) + '% of ads'],
    ['Google Ads', usd2(gg), (gg / A * 100 || 0).toFixed(1) + '% of ads'],
    ['AOV', usd2(S_ / O || 0)], ['ROAS', (S_ / A || 0).toFixed(2) + 'x'],
    ['API Cost', usd2(api), (api / S_ * 100 || 0).toFixed(1) + '%'],
    ['Fulfill Cost', usd2(ful), (ful / S_ * 100 || 0).toFixed(1) + '%'],
    ['Net Profit', usd2(net)]
  ];
  document.getElementById('kpi').innerHTML = cards.map(c =>
    `<div class="card"><p class="l">${c[0]}</p><p class="v">${c[1]}</p>${c[2] ? `<p class="p">${c[2]}</p>` : ''}</div>`).join('');
}

function render() { renderKPI(); ({ overview: vOverview, marketing: vMarketing, product: vProduct, explorer: vExplorer, forecast: vForecast }[S.tab])(); }

// ============ OVERVIEW ============
function vOverview() {
  const ov = ovFiltered();
  // cumulative YTD (toàn bộ, không theo range)
  const allOv = DATA.overview.slice().sort((a, b) => a.date.localeCompare(b.date));
  let cr = 0, cs = 0, cp = 0; const cum = {};
  allOv.forEach(o => { cr += o.revenue; cs += o.totalAds; cp += o.profit; cum[o.date] = { r: cr, s: cs, p: cp }; });
  const rows = ov.slice(-14);
  const prov = DATA.provisionalDays || 0, lastDates = DATA.overview.map(o => o.date).sort().slice(-prov);
  document.getElementById('view').innerHTML = `
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0" id="ovT">Daily Performance</h3>
      <span class="seg" id="ovMode"><button data-m="daily" class="${S.mode==='daily'?'on':''}">Daily</button><button data-m="cum" class="${S.mode==='cum'?'on':''}">Lũy kế YTD</button></span></div>
      <div class="chartwrap"><canvas id="ovChart"></canvas></div></div>
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
function vMarketing() {
  const ads = adsFiltered(), fact = factFiltered();
  const chans = ['Meta','Google','TikTok'].map(ch => { const a = ads.filter(x=>x.channel===ch);
    const sp=sum(a,x=>x.spend), cl=sum(a,x=>x.clicks), im=sum(a,x=>x.impressions), pr=sum(a,x=>x.platformRevenue);
    return { ch, sp, roas: sp?pr/sp:0, cpc: cl?sp/cl:0, cpm: im?sp/im*1000:0 }; });
  const dimKey = { market:'Market', recipient:'Recipient', type:'Product Type' }[S.dim];
  const agg = {}; fact.forEach(r => { const key=r[dimKey]; agg[key]=agg[key]||{sp:0,rev:0,or:0}; agg[key].sp+=r['Total Ads Spend']; agg[key].rev+=r.Revenue; agg[key].or+=r.Orders; });
  document.getElementById('view').innerHTML = `
    <div class="kpi">${chans.map(c=>`<div class="card"><p class="l">${c.ch}</p><p class="v">${usd(c.sp)}</p><p class="p">ROAS ${c.roas.toFixed(2)}x · CPC $${c.cpc.toFixed(2)} · CPM $${c.cpm.toFixed(2)}</p></div>`).join('')}</div>
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0">Trend theo kênh</h3>
      <span class="seg" id="mMetric">${['spend','cpc','cpm','roas'].map(m=>`<button data-k="${m}" class="${S.metric===m?'on':''}">${m.toUpperCase()}</button>`).join('')}</span></div>
      <div class="chartwrap"><canvas id="mChart"></canvas></div></div>
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0">Hiệu quả theo chiều</h3>
      <span class="seg" id="mDim">${[['market','Market'],['recipient','Recipient'],['type','Product Type']].map(d=>`<button data-d="${d[0]}" class="${S.dim===d[0]?'on':''}">${d[1]}</button>`).join('')}</span></div>
      <div class="scroll"><table><thead><tr><th>${dimKey}</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>CPA</th><th>AOV</th><th>Orders</th></tr></thead><tbody>${
        Object.keys(agg).sort((a,b)=>agg[b].rev-agg[a].rev).map(k=>{const x=agg[k];return `<tr><td>${k}</td><td>${k$(x.sp)}</td><td>${k$(x.rev)}</td><td>${(x.rev/x.sp||0).toFixed(2)}x</td><td>$${(x.sp/x.or||0).toFixed(1)}</td><td>$${(x.rev/x.or||0).toFixed(0)}</td><td>${x.or}</td></tr>`;}).join('')
      }</tbody></table></div>
      <p class="note">ROAS = Revenue(Shopify)/Spend · platform ROAS ở thẻ kênh là số nền tảng tự báo (tham khảo).</p></div>`;
  document.getElementById('mMetric').addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){S.metric=e.target.dataset.k;vMarketing();}});
  document.getElementById('mDim').addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){S.dim=e.target.dataset.d;vMarketing();}});
  // trend: by date per channel
  const dates=[...new Set(ads.map(a=>a.date))].sort();
  const col={Meta:'#378ADD',Google:'#1D9E75',TikTok:'#EF9F27'};
  const ds=['Meta','Google','TikTok'].map(ch=>{ const data=dates.map(d=>{const a=ads.filter(x=>x.channel===ch&&x.date===d);
    const sp=sum(a,x=>x.spend),cl=sum(a,x=>x.clicks),im=sum(a,x=>x.impressions),pr=sum(a,x=>x.platformRevenue);
    return S.metric==='spend'?sp:S.metric==='cpc'?(cl?sp/cl:0):S.metric==='cpm'?(im?sp/im*1000:0):(sp?pr/sp:0); });
    return {label:ch,data,borderColor:col[ch],backgroundColor:col[ch],pointRadius:0,borderWidth:2,tension:.3}; });
  lineChart('mChart',dates,ds);
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

// ============ FORECAST ============
function vForecast() {
  const ov = DATA.overview.slice().sort((a,b)=>a.date.localeCompare(b.date));
  const last7 = ov.slice(-7), last3 = ov.slice(-3), y = ov.slice(-1);
  const baseW = { '7': last7, '3': last3, '1': y };
  const lastDate = ov.length ? ov[ov.length-1].date : new Date().toISOString().slice(0,10);
  const fStart = new Date(lastDate+'T00:00:00Z'); fStart.setUTCDate(fStart.getUTCDate()+1);
  S.fc = S.fc || { base:'7', H:14, ramp:12, mer:2.27, peak:'', cut:'' };
  if (!S.fc.peak){ const p=new Date(fStart); p.setUTCDate(p.getUTCDate()+8); S.fc.peak=p.toISOString().slice(0,10); const c=new Date(fStart);c.setUTCDate(c.getUTCDate()+11);S.fc.cut=c.toISOString().slice(0,10);}
  // mer mặc định từ last7
  const merDefault = sum(last7,o=>o.totalAds) ? sum(last7,o=>o.revenue)/sum(last7,o=>o.totalAds) : 2.27;
  const COST = 0.404, breakeven = (1/(1-COST)).toFixed(2);
  document.getElementById('view').innerHTML = `
    <div class="panel"><h3>Forecast — mô phỏng dòng tiền <span style="font-weight:400;color:var(--muted);font-size:11px">(kịch bản theo giả định, không phải cam kết)</span></h3>
      <div class="fields">
        <div class="fld"><label>Baseline</label><select id="fcBase"><option value="1">Yesterday</option><option value="3">Last 3d</option><option value="7" selected>Last 7d</option></select></div>
        <div class="fld"><label>Horizon</label><select id="fcH"><option value="7">7 ngày</option><option value="14" selected>14 ngày</option></select></div>
        <div class="fld"><label>Budget Δ/ngày: <b id="fcRv">+${S.fc.ramp}%</b></label><input type="range" id="fcRamp" min="-10" max="30" value="${S.fc.ramp}"></div>
        <div class="fld"><label>MER: <b id="fcMv">${(S.fc.mer||merDefault).toFixed(2)}</b></label><input type="range" id="fcMer" min="1.4" max="3.2" step="0.01" value="${S.fc.mer||merDefault}"></div>
        <div class="fld"><label>Ngày spend đỉnh</label><input type="date" id="fcPeak" value="${S.fc.peak}"></div>
        <div class="fld"><label>Ngày cut-off</label><input type="date" id="fcCut" value="${S.fc.cut}"></div>
      </div>
      <div id="fcKpi" class="kpi"></div>
      <div class="chartwrap"><canvas id="fcChart"></canvas></div>
      <p class="note">Breakeven MER ≈ ${breakeven} — dưới mức này tăng spend = lỗ. Forecast từ ${fStart.toISOString().slice(0,10)}. Chưa tính độ trễ payout.</p>
    </div>`;
  const baseSpend = (()=>{const w=baseW[document.getElementById?.('fcBase')?.value||S.fc.base]||last7;return sum(w,o=>o.totalAds)/(w.length||1);})();
  const recompute=()=>{
    S.fc.base=fcBase.value; S.fc.H=+fcH.value; S.fc.ramp=+fcRamp.value; S.fc.mer=+fcMer.value; S.fc.peak=fcPeak.value; S.fc.cut=fcCut.value;
    fcRv.textContent=(S.fc.ramp>=0?'+':'')+S.fc.ramp+'%'; fcMv.textContent=S.fc.mer.toFixed(2);
    const w=baseW[S.fc.base]||last7, b=sum(w,o=>o.totalAds)/(w.length||1), r=S.fc.ramp/100, mer=S.fc.mer, H=S.fc.H;
    const off=v=>{const d=new Date(v+'T00:00:00Z');return Math.round((d-fStart)/864e5)+1;};
    let peak=Math.min(Math.max(off(S.fc.peak),1),H), cut=Math.min(Math.max(off(S.fc.cut),1),H); if(cut<peak)cut=peak;
    const fc=[]; for(let t=1;t<=H;t++){let sp; if(t<=peak)sp=b*Math.pow(1+r,t); else if(t<=cut)sp=b*Math.pow(1+r,peak); else sp=b*0.4;
      fc.push({t,sp,rev:sp*mer,pf:sp*mer*(1-COST)-sp,u:0.04+0.028*t});}
    const SP=sum(fc,x=>x.sp),RV=sum(fc,x=>x.rev),PF=sum(fc,x=>x.pf);
    document.getElementById('fcKpi').innerHTML=[['Ad spend cần chuẩn bị',usd(SP)],['Revenue kỳ vọng',usd(RV)],['Net Profit kỳ vọng',usd(PF)],['Breakeven MER',breakeven+'x']].map(c=>`<div class="card"><p class="l">${c[0]} (${H}d)</p><p class="v">${c[1]}</p></div>`).join('');
    // chart: actual last 14 + forecast
    const act=ov.slice(-14); const labels=act.map(o=>o.date).concat(fc.map(x=>{const d=new Date(fStart);d.setUTCDate(d.getUTCDate()+x.t-1);return d.toISOString().slice(0,10);}));
    const na=act.length; const pad=v=>act.map(()=>null);
    const fRev=pad(),fSp=pad(),fPf=pad(); fRev[na-1]=act[na-1].revenue;fSp[na-1]=act[na-1].totalAds;fPf[na-1]=act[na-1].profit;
    fc.forEach(x=>{fRev.push(Math.round(x.rev));fSp.push(Math.round(x.sp));fPf.push(Math.round(x.pf));});
    const aRev=act.map(o=>o.revenue).concat(fc.map(()=>null)),aSp=act.map(o=>o.totalAds).concat(fc.map(()=>null)),aPf=act.map(o=>o.profit).concat(fc.map(()=>null));
    const dash=(lab,d,c)=>({label:lab,data:d,borderColor:c,borderDash:[5,4],pointRadius:0,borderWidth:2,tension:.3});
    const sol=(lab,d,c)=>({label:lab,data:d,borderColor:c,pointRadius:0,borderWidth:2,tension:.3});
    lineChart('fcChart',labels,[sol('Revenue',aRev,'#378ADD'),dash('Rev(fc)',fRev,'rgba(55,138,221,.6)'),sol('Spend',aSp,'#EF9F27'),dash('Spend(fc)',fSp,'rgba(239,159,39,.6)'),sol('Profit',aPf,'#1D9E75'),dash('Profit(fc)',fPf,'rgba(29,158,117,.6)')]);
  };
  ['fcBase','fcH','fcPeak','fcCut'].forEach(id=>document.getElementById(id).addEventListener('change',recompute));
  ['fcRamp','fcMer'].forEach(id=>document.getElementById(id).addEventListener('input',recompute));
  if(!S.fc.mer) S.fc.mer=merDefault; recompute();
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
