/* =====================================================================
   LANTERN — time-aware safety model
   ---------------------------------------------------------------------
   penalty = lightingRisk + isolationRisk + incidentRisk   (clamped 0–1.8)
   score   = 100 * (1 - penalty / 1.8)                      (0–100, higher = safer)

   Every function takes the departure hour (0–23), so the selected time
   changes the result. The formulas are unchanged from the original
   prototype.
   ===================================================================== */
(function (global) {
'use strict';

function footTraffic(kind, hour){
  if(kind==='avenue') return (hour>=6 && hour<=23) ? 0.8 : 0.3;
  if(kind==='cross')  return (hour>=6 && hour<=22) ? 0.55 : 0.25;
  return (hour>=7 && hour<=19) ? 0.5 : 0.1; // alley
}
function lightingRisk(edge, hour){
  const night = hour>=20 || hour<6;
  if(!night) return 0;
  return edge.lit ? 0.08 : 0.55;
}
function isolationRisk(edge, hour){
  return (1-footTraffic(edge.kind, hour)) * 0.35;
}
function incidentRisk(edge, hour){
  if(!edge.incidents.length) return 0;
  let sum=0;
  edge.incidents.forEach(inc=>{
    let d = Math.abs(inc.hour-hour);
    d = Math.min(d, 24-d);
    const proximity = Math.max(0, 1-d/6);
    sum += proximity * (inc.severity/3);
  });
  return Math.min(1, sum/2.2);
}
function penalty(edge, hour){
  const p = lightingRisk(edge,hour)+isolationRisk(edge,hour)+incidentRisk(edge,hour);
  return Math.max(0, Math.min(1.8, p));
}
function safetyScore(edge, hour){
  const p = penalty(edge, hour);
  return Math.round(100 * (1 - p/1.8));
}

/* Average of each risk factor across a route's segments (used for the
   "safety factors" comparison in the UI). Same formulas as penalty(). */
function factorBreakdown(edgeList, hour){
  const n = edgeList.length || 1;
  const sum = { lighting: 0, isolation: 0, incident: 0 };
  edgeList.forEach(e => {
    sum.lighting  += lightingRisk(e, hour);
    sum.isolation += isolationRisk(e, hour);
    sum.incident  += incidentRisk(e, hour);
  });
  return { lighting: sum.lighting / n, isolation: sum.isolation / n, incident: sum.incident / n };
}

global.LanternSafety = {
  footTraffic, lightingRisk, isolationRisk, incidentRisk,
  penalty, safetyScore, factorBreakdown
};

})(window);
