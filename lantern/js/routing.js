/* =====================================================================
   LANTERN — routing
   ---------------------------------------------------------------------
   Dijkstra over the street graph, run twice with different edge weights:

     fastest      weight = distance
     recommended  weight = distance * (1 + 2.5 * penalty(edge, hour))

   The algorithm and weights are unchanged from the original prototype.
   The only change: start / destination are now parameters instead of
   hard-coded constants, so the user can pick their own trip.
   ===================================================================== */
(function (global) {
'use strict';

const { nodes, adj } = global.LanternData;
const { penalty } = global.LanternSafety;

function dijkstra(weightFn, START, DEST){
  const dist = {}, prevEdge = {}, prevNode = {}, visited = {};
  Object.keys(nodes).forEach(id=>dist[id]=Infinity);
  dist[START]=0;
  while(true){
    let u=null, best=Infinity;
    for(const id in dist){ if(!visited[id] && dist[id]<best){best=dist[id]; u=id;} }
    if(u===null) break;
    visited[u]=true;
    if(u===DEST) break;
    adj[u].forEach(({to,edge})=>{
      if(visited[to]) return;
      const w = weightFn(edge);
      const nd = dist[u]+w;
      if(nd < dist[to]){
        dist[to]=nd; prevNode[to]=u; prevEdge[to]=edge.id;
      }
    });
  }
  const pathEdges=[]; let cur=DEST;
  while(cur!==START && prevNode[cur]!==undefined){
    pathEdges.push(prevEdge[cur]);
    cur = prevNode[cur];
  }
  pathEdges.reverse();
  return {distance: dist[DEST], pathEdges};
}

/* Returns {fast, safe}, or null when the trip is not routable
   (same start and destination, or an unknown node). */
function computeRoutes(hour, start, dest){
  if(!start || !dest || start === dest || !nodes[start] || !nodes[dest]) return null;
  const fast = dijkstra(e=>e.distance, start, dest);
  const safe = dijkstra(e=>e.distance*(1+2.5*penalty(e,hour)), start, dest);
  return {fast, safe};
}

global.LanternRouting = { dijkstra, computeRoutes };

})(window);
