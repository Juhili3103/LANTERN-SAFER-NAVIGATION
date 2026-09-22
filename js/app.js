/* =====================================================================
   LANTERN — application (UI, rendering, incident reporting)
   ---------------------------------------------------------------------
   Data flow:
     1. Render immediately from the synthetic demo dataset.
     2. In the background, fetch saved reports from Supabase (if configured)
        and layer them on top of the demo data, then re-render.
     3. When a user reports an incident, update the UI at once, then save
        it to Supabase. If saving fails, the report is kept for this
        session and a small message explains why.

   If the database is missing or down, the app keeps working on demo data.
   ===================================================================== */
(function () {
'use strict';

const { nodes, edges, edgeById, LANDMARKS, DEFAULT_START, DEFAULT_DEST } = window.LanternData;
const { safetyScore, factorBreakdown } = window.LanternSafety;
const { computeRoutes } = window.LanternRouting;
const DB = window.LanternDB;

/* ---------- rendering helpers ---------- */
const svg = document.getElementById('map');
const NS='http://www.w3.org/2000/svg';
function el(tag, attrs){
  const n=document.createElementNS(NS,tag);
  for(const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function scoreColor(score){
  if(score>=60){
    const t=(score-60)/40;
    return lerpColor('#F2B705','#33C6A0',t);
  } else {
    const t=score/60;
    return lerpColor('#EA5A76','#F2B705',t);
  }
}
function lerpColor(a,b,t){
  const pa=hexToRgb(a), pb=hexToRgb(b);
  const r=Math.round(pa.r+(pb.r-pa.r)*t);
  const g=Math.round(pa.g+(pb.g-pa.g)*t);
  const bl=Math.round(pa.b+(pb.b-pa.b)*t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(hex){
  const v=parseInt(hex.slice(1),16);
  return {r:(v>>16)&255, g:(v>>8)&255, b:v&255};
}

/* Stable 0..1 value from a string. Used to place each incident dot at a
   fixed spot on its street (previously re-rolled on every render, which
   made dots jump around). */
function hashUnit(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h>>>0) % 1000) / 1000;
}

function placeName(id){
  const p = LANDMARKS.find(l=>l.id===id);
  return p ? p.name : id;
}

/* ---------- state ---------- */
let currentHour  = 18;
let currentStart = DEFAULT_START;
let currentDest  = DEFAULT_DEST;
let currentRoutes = null;
let edgeTouched = false;   // highlight the report target only once the user has picked one

/* ---------- map ---------- */
function render(){
  svg.innerHTML='';
  const bgLayer = el('g',{});
  const routeLayer = el('g',{});
  const nodeLayer = el('g',{});
  const incidentLayer = el('g',{});
  const hitLayer = el('g',{});
  svg.appendChild(bgLayer); svg.appendChild(routeLayer); svg.appendChild(nodeLayer); svg.appendChild(incidentLayer); svg.appendChild(hitLayer);

  currentRoutes = computeRoutes(currentHour, currentStart, currentDest);

  edges.forEach(edge=>{
    const a=nodes[edge.n1], b=nodes[edge.n2];
    const score = safetyScore(edge,currentHour);
    const line = el('line',{
      x1:a.x, y1:a.y, x2:b.x, y2:b.y,
      stroke: scoreColor(score), 'stroke-width': 5, 'stroke-linecap':'round',
      opacity: 0.55
    });
    bgLayer.appendChild(line);
  });

  /* Round 2: show which street segment the incident form is pointing at,
     and let people click a street on the map to select it (several
     segments share the same name, so the highlight removes any doubt). */
  const sel = edgeTouched ? edgeById[edgeSelect.value] : null;
  if(sel){
    const a=nodes[sel.n1], b=nodes[sel.n2];
    bgLayer.appendChild(el('line',{
      x1:a.x,y1:a.y,x2:b.x,y2:b.y, stroke:'#EDEFF7', 'stroke-width':13,
      'stroke-linecap':'round', opacity:0.22
    }));
  }
  edges.forEach(edge=>{
    const a=nodes[edge.n1], b=nodes[edge.n2];
    const hit = el('line',{
      x1:a.x,y1:a.y,x2:b.x,y2:b.y, stroke:'rgba(0,0,0,0)', 'stroke-width':20,
      'stroke-linecap':'round', 'pointer-events':'stroke', 'data-edge':edge.id
    });
    hit.style.cursor = 'pointer';
    const tip = document.createElementNS(NS,'title');
    tip.textContent = edge.name+' ('+edge.kind+') — click to report here';
    hit.appendChild(tip);
    hit.addEventListener('click', ()=>{ edgeSelect.value = edge.id; edgeTouched = true; render(); });
    hitLayer.appendChild(hit);
  });

  if(currentRoutes){
    currentRoutes.safe.pathEdges.forEach(id=>{
      const edge=edgeById[id]; const a=nodes[edge.n1], b=nodes[edge.n2];
      routeLayer.appendChild(el('line',{
        x1:a.x,y1:a.y,x2:b.x,y2:b.y, stroke:'var(--teal)', 'stroke-width':7,
        'stroke-linecap':'round', opacity:0.95
      }));
    });
    currentRoutes.fast.pathEdges.forEach(id=>{
      const edge=edgeById[id]; const a=nodes[edge.n1], b=nodes[edge.n2];
      routeLayer.appendChild(el('line',{
        x1:a.x,y1:a.y,x2:b.x,y2:b.y, stroke:'var(--amber)', 'stroke-width':3.5,
        'stroke-linecap':'round','stroke-dasharray':'2 9', opacity:0.95
      }));
    });
  }

  edges.forEach(edge=>{
    if(!edge.lit) return;
    const a=nodes[edge.n1], b=nodes[edge.n2];
    const steps=3;
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
      bgLayer.appendChild(el('circle',{cx:x,cy:y,r:2,fill:'#F6D775',opacity:0.55}));
    }
  });

  edges.forEach(edge=>{
    edge.incidents.forEach(inc=>{
      let d=Math.abs(inc.hour-currentHour); d=Math.min(d,24-d);
      if(d>5) return;
      const a=nodes[edge.n1], b=nodes[edge.n2];
      const t = 0.3+hashUnit(String(inc.id))*0.4;
      const x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
      const r = 3+inc.severity*1.3;
      incidentLayer.appendChild(el('circle',{
        cx:x,cy:y,r:r, fill:'var(--rose)', opacity: 0.25+ (1-d/5)*0.5,
        stroke:'var(--rose)','stroke-width':1
      }));
    });
  });

  Object.values(nodes).forEach(n=>{
    nodeLayer.appendChild(el('circle',{cx:n.x,cy:n.y,r:3.5,fill:'#454c8c'}));
  });

  const s=nodes[currentStart], d=nodes[currentDest];
  nodeLayer.appendChild(el('circle',{cx:s.x,cy:s.y,r:9,fill:'var(--bg-deep)',stroke:'var(--amber-soft)','stroke-width':2.5}));
  const stxt = el('text',{x:s.x, y:s.y+26, fill:'var(--muted)', 'font-size':12, 'font-family':'Inter,sans-serif','text-anchor':'middle'});
  stxt.textContent=placeName(currentStart); nodeLayer.appendChild(stxt);

  nodeLayer.appendChild(el('circle',{cx:d.x,cy:d.y,r:9,fill:'var(--bg-deep)',stroke:'var(--teal)','stroke-width':2.5}));
  const dtxt = el('text',{x:d.x, y:d.y-18, fill:'var(--muted)', 'font-size':12, 'font-family':'Inter,sans-serif','text-anchor':'middle'});
  dtxt.textContent=placeName(currentDest); nodeLayer.appendChild(dtxt);

  renderStats();
}

/* ---------- side panel ---------- */
function fmtHour(h){
  const period = h>=12?'PM':'AM';
  let hh = h%12; if(hh===0) hh=12;
  return hh+':00 '+period;
}
function timeSubLabel(h){
  if(h>=6 && h<11) return 'Morning commute';
  if(h>=11 && h<17) return 'Midday — high foot traffic';
  if(h>=17 && h<20) return 'Dusk — visibility dropping';
  if(h>=20 || h<1) return 'Night — streetlights matter most';
  return 'Late night — lowest foot traffic';
}

const $ = id => document.getElementById(id);
const FACTOR_CELLS = ['fLightFast','fLightSafe','fIsoFast','fIsoSafe','fIncFast','fIncSafe'];

function renderStats(){
  $('timeReadout').textContent = fmtHour(currentHour);
  $('timeSub').textContent = timeSubLabel(currentHour);
  $('hourLabel').textContent = 'Showing conditions at ' + fmtHour(currentHour);
  $('routeTitle').textContent = placeName(currentStart) + ' → ' + placeName(currentDest);

  const whyBox = $('whyBox');

  if(!currentRoutes){
    $('fastMeta').textContent = '—';
    $('safeMeta').textContent = '—';
    FACTOR_CELLS.forEach(id=>{ $(id).textContent = '—'; });
    whyBox.textContent = 'Choose two different places to compare the fastest route with the recommended one.';
    return;
  }

  const fastEdges = currentRoutes.fast.pathEdges.map(id=>edgeById[id]);
  const safeEdges = currentRoutes.safe.pathEdges.map(id=>edgeById[id]);
  const fastDist = fastEdges.reduce((s,e)=>s+e.distance,0);
  const safeDist = safeEdges.reduce((s,e)=>s+e.distance,0);
  const fastAvgScore = Math.round(fastEdges.reduce((s,e)=>s+safetyScore(e,currentHour),0)/fastEdges.length);
  const safeAvgScore = Math.round(safeEdges.reduce((s,e)=>s+safetyScore(e,currentHour),0)/safeEdges.length);

  $('fastMeta').textContent = fastDist+'m · safety '+fastAvgScore;
  $('safeMeta').textContent = safeDist+'m · safety '+safeAvgScore;

  const ff = factorBreakdown(fastEdges, currentHour);
  const sf = factorBreakdown(safeEdges, currentHour);
  $('fLightFast').textContent = ff.lighting.toFixed(2);
  $('fLightSafe').textContent = sf.lighting.toFixed(2);
  $('fIsoFast').textContent   = ff.isolation.toFixed(2);
  $('fIsoSafe').textContent   = sf.isolation.toFixed(2);
  $('fIncFast').textContent   = ff.incident.toFixed(2);
  $('fIncSafe').textContent   = sf.incident.toFixed(2);

  const safeSet = new Set(currentRoutes.safe.pathEdges);
  const diverging = fastEdges.filter(e=>!safeSet.has(e.id));
  if(diverging.length===0){
    whyBox.innerHTML = 'At <b>'+fmtHour(currentHour)+'</b>, the fastest route and the recommended route are the same — no risky shortcuts needed right now.';
  } else {
    diverging.sort((a,b)=>safetyScore(a,currentHour)-safetyScore(b,currentHour));
    const worst = diverging[0];
    const scoreDay = safetyScore(worst, 8);
    const scoreNight = safetyScore(worst, 23);
    const scoreNow = safetyScore(worst, currentHour);
    const reportCount = worst.incidents.length;
    const savedM = safeDist - fastDist;
    const trend = scoreNight < scoreDay ? 'but drops to' : (scoreNight > scoreDay ? 'and rises to' : 'and stays at');
    whyBox.innerHTML = 'The fastest route cuts through <b>'+worst.name+'</b>'+(savedM>0 ? ', saving '+savedM+'m over the recommended route' : '')+'. '+
      'It scores <span class="score-shift">'+scoreDay+'</span> at 8:00 AM '+trend+' <span class="score-shift">'+scoreNight+'</span> at 11:00 PM'+
      (worst.lit ? '' : ' — it has no streetlights') + (reportCount ? ', with '+reportCount+' crowd report'+(reportCount>1?'s':'')+' logged there' : '') + '. '+
      'Right now, at '+fmtHour(currentHour)+', it scores <span class="score-shift">'+scoreNow+'</span>, so Lantern routes you around it instead.';
  }
}

/* ---------- controls: time ---------- */
const slider = $('hourSlider');
slider.addEventListener('input', ()=>{
  currentHour = parseInt(slider.value,10);
  document.querySelectorAll('.presets button').forEach(b=>b.classList.toggle('active', parseInt(b.dataset.hour,10)===currentHour));
  render();
});
document.querySelectorAll('.presets button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    currentHour = parseInt(btn.dataset.hour,10);
    slider.value = currentHour;
    document.querySelectorAll('.presets button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

/* ---------- controls: source / destination ---------- */
const startSelect = $('startSelect');
const destSelect  = $('destSelect');
[[startSelect, DEFAULT_START],[destSelect, DEFAULT_DEST]].forEach(([sel, def])=>{
  LANDMARKS.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.value = def;
});
startSelect.addEventListener('change', ()=>{ currentStart = startSelect.value; render(); });
destSelect.addEventListener('change',  ()=>{ currentDest  = destSelect.value;  render(); });

/* ---------- controls: incident report ---------- */
const edgeSelect = $('edgeSelect');
edges.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(e=>{
  const opt = document.createElement('option');
  opt.value = e.id;
  opt.textContent = e.name + ' (' + e.kind + ')';
  edgeSelect.appendChild(opt);
});
edgeSelect.addEventListener('change', ()=>{ edgeTouched = true; render(); });
let selectedSeverity = 2;
document.querySelectorAll('#sevGroup button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('#sevGroup button').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel');
    selectedSeverity = parseInt(b.dataset.sev,10);
  });
});

/* ---------- database status + messages ---------- */
let savedReportCount = 0;   // user reports that came from / went to the database

function setDbStatus(kind, text){
  $('dbStatus').className = 'db-status' + (kind ? ' '+kind : '');
  $('dbStatusText').textContent = text;
}
function showNotice(text){
  const n = $('dbNotice');
  n.textContent = text || '';
  n.hidden = !text;
}
function connectedText(){
  return 'Connected to Supabase · '+savedReportCount+' saved report'+(savedReportCount===1?'':'s')+' added to the demo data';
}
let confirmTimer = null;
function setConfirm(text, warn){
  const c = $('confirmMsg');
  c.textContent = text;
  c.className = 'confirm' + (warn ? ' warn' : '');
  clearTimeout(confirmTimer);
  if(text) confirmTimer = setTimeout(()=>{ c.textContent=''; c.className='confirm'; }, 9000);
}

/* Layer saved reports on top of the demo data. Database content is
   treated as untrusted: unknown segments and out-of-range values are
   skipped, and nothing from the database is ever written as HTML. */
function addDbReports(rows){
  const seen = new Set();
  edges.forEach(e=>e.incidents.forEach(i=>seen.add(i.id)));
  let added = 0;
  rows.forEach(row=>{
    if(!row || !Object.prototype.hasOwnProperty.call(edgeById, row.route_segment)) return;
    const sev = Number(row.severity), hr = Number(row.incident_hour);
    if(!Number.isInteger(sev) || sev<1 || sev>3) return;
    if(!Number.isInteger(hr)  || hr<0  || hr>23)  return;
    const id = 'db-'+row.id;
    if(seen.has(id)) return;
    edgeById[row.route_segment].incidents.push({hour:hr, severity:sev, id, source:'user'});
    seen.add(id);
    added++;
  });
  return added;
}

function configProblemNotice(reason){
  if(reason==='secret-key') return 'A secret key was found in js/config.js and was ignored. Replace it with the public (publishable/anon) key, and rotate the secret key in Supabase. Using demo data.';
  if(reason==='bad-url')    return 'The Supabase URL in js/config.js is not valid. It should look like https://your-project.supabase.co. Using demo data.';
  return '';
}

async function loadSavedReports(){
  const reason = DB.disabledReason();
  if(reason==='not-configured'){
    setDbStatus('', 'Demo mode — no database connected. Reports you add last until you refresh.');
    return;
  }
  if(reason){
    setDbStatus('warn', 'Database not used — using demo data.');
    showNotice(configProblemNotice(reason));
    return;
  }
  setDbStatus('', 'Loading saved reports…');
  let res;
  try { res = await DB.fetchIncidents(); }
  catch(e){ res = { ok:false, reason:'network' }; }
  if(res.ok){
    savedReportCount = addDbReports(res.rows);
    setDbStatus('ok', connectedText());
    render();
  } else {
    setDbStatus('warn', 'Database unavailable — using demo data.');
    showNotice('Couldn’t load saved reports: '+DB.describeFailure(res.reason)+'. Lantern is running on demo data, and new reports will last until you refresh.');
  }
}

$('submitReport').addEventListener('click', async ()=>{
  const btn = $('submitReport');
  const edge = edgeById[edgeSelect.value];
  if(!edge || btn.disabled) return;

  const hour = currentHour, severity = selectedSeverity;
  const scoreBefore = safetyScore(edge, hour);
  const pathBefore = currentRoutes ? currentRoutes.safe.pathEdges.join(',') : null;

  // 1) Update the UI immediately.
  const inc = {hour, severity, id:'inc-user-'+Date.now(), source:'user-local'};
  edge.incidents.push(inc);
  render();

  const scoreAfter = safetyScore(edge, hour);
  let summary = edge.name+' at '+fmtHour(hour)+': safety '+scoreBefore+' → '+scoreAfter+'.';
  if(currentRoutes && pathBefore!==null){
    summary += currentRoutes.safe.pathEdges.join(',')!==pathBefore
      ? ' The recommended route changed.'
      : ' The recommended route is unchanged.';
  }

  // 2) Save it.
  btn.disabled = true;
  setConfirm('Saving report…');
  let res;
  try {
    res = await DB.saveIncident({
      route_segment: edge.id,
      segment_name: edge.name,
      severity,
      incident_hour: hour,
      reported_at: new Date().toISOString()
    });
  } catch(e){ res = { ok:false, reason:'network' }; }
  btn.disabled = false;

  if(res.ok){
    if(res.row && res.row.id !== undefined) inc.dbId = res.row.id;
    inc.source = 'user';
    savedReportCount++;
    setDbStatus('ok', connectedText());
    showNotice('');
    setConfirm('Saved. '+summary);
  } else if(res.reason==='not-configured'){
    setConfirm('Added for this session only (demo mode). '+summary, true);
  } else {
    setDbStatus('warn', 'Database unavailable — using demo data.');
    showNotice('Couldn’t save your report: '+DB.describeFailure(res.reason)+'. It is kept for this session only.');
    setConfirm('Added for this session only. '+summary, true);
  }
});

/* ---------- "how it works" toggle ---------- */
const howToggle = $('howToggle');
const howBody = $('howBody');
howToggle.addEventListener('click', ()=>{
  const open = howBody.classList.toggle('open');
  howToggle.textContent = 'How the safety score works ' + (open?'▴':'▾');
});

/* ---------- start ---------- */
render();            // demo data first, so the page is never blocked on the network
loadSavedReports();  // then layer saved reports on top if a database is configured

})();
