/* =====================================================================
   LANTERN — synthetic demo dataset
   ---------------------------------------------------------------------
   Everything in this file is SYNTHETIC. The street grid, street names,
   streetlight coverage and the baseline incident reports are generated
   from a fixed random seed so the demo looks the same on every load.
   It is NOT real map data and NOT real incident data.

   This dataset is always loaded. It is the demo baseline, and it is the
   fallback when the database is unavailable. Reports saved in Supabase
   are layered on top of it (see app.js).

   IMPORTANT: the order of rand() calls below determines the dataset.
   Do not reorder or insert rand() calls above the graph construction.
   ===================================================================== */
(function (global) {
'use strict';

/* ---------- seeded PRNG ---------- */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7);

/* ---------- grid graph ---------- */
const ROWS = 4, COLS = 5;
const X0 = 80, XSTEP = 180, Y0 = 70, YSTEP = 145;

const nodes = {};
for(let r=0;r<ROWS;r++){
  for(let c=0;c<COLS;c++){
    const id = r+'_'+c;
    nodes[id] = {id, r, c, x: X0+c*XSTEP, y: Y0+r*YSTEP};
  }
}

const AVENUE_NAMES = ["Main Avenue","Grand Avenue","Riverside Avenue","Broadway"];
const ALLEY_NAMES  = ["Elm Alley","Birch Cut-Through","Hollow Lane","Fern Passage"];
const CROSS_NAMES  = ["Market Street","Cedar Street","Pine Street","Oak Street","Maple Street"];

const edges = [];
let edgeCounter = 0;

function nightHours(){ return [19,20,21,22,23,0,1,2,3,4,5]; }
function dayHours(){ return [6,7,8,9,10,11,12,13,14,15,16,17,18]; }
function pick(arr){ return arr[Math.floor(rand()*arr.length)]; }

function makeIncidents(kind){
  const incidents = [];
  let count;
  if(kind==='alley'){
    count = 2 + Math.floor(rand()*3); // 2-4
    for(let i=0;i<count;i++){
      const hour = rand()<0.85 ? pick(nightHours()) : pick(dayHours());
      incidents.push({hour, severity: 1+Math.floor(rand()*3), id:'inc'+(edgeCounter*10+i)});
    }
  } else if(kind==='cross'){
    const r = rand();
    count = r<0.45?1:(r<0.75?2:0);
    for(let i=0;i<count;i++){
      const hour = rand()<0.5 ? pick(nightHours()) : pick(dayHours());
      incidents.push({hour, severity: 1+Math.floor(rand()*3), id:'inc'+(edgeCounter*10+i)});
    }
  } else { // avenue
    if(rand()<0.3){
      incidents.push({hour: pick(dayHours()), severity: 1, id:'inc'+(edgeCounter*10)});
    }
  }
  return incidents;
}

// horizontal edges
for(let r=0;r<ROWS;r++){
  for(let c=0;c<COLS-1;c++){
    const kind = (r===0||r===ROWS-1) ? 'avenue' : 'alley';
    const dist = kind==='avenue' ? 180 : 128;
    const lit = kind==='avenue' ? true : (rand()<0.15);
    const nameList = kind==='avenue' ? AVENUE_NAMES : ALLEY_NAMES;
    const name = nameList[c % nameList.length];
    edges.push({
      id:'e'+(edgeCounter++), n1: r+'_'+c, n2: r+'_'+(c+1),
      kind, distance: dist, lit, name,
      incidents: makeIncidents(kind)
    });
  }
}
// vertical edges
for(let r=0;r<ROWS-1;r++){
  for(let c=0;c<COLS;c++){
    const kind = 'cross';
    const dist = 150;
    const lit = (c===0||c===COLS-1) ? true : (rand()<0.5);
    const name = CROSS_NAMES[c % CROSS_NAMES.length];
    edges.push({
      id:'e'+(edgeCounter++), n1: r+'_'+c, n2: (r+1)+'_'+c,
      kind, distance: dist, lit, name,
      incidents: makeIncidents(kind)
    });
  }
}

const edgeById = {};
edges.forEach(e=>edgeById[e.id]=e);

const adj = {};
Object.keys(nodes).forEach(id=>adj[id]=[]);
edges.forEach(e=>{
  adj[e.n1].push({to:e.n2, edge:e});
  adj[e.n2].push({to:e.n1, edge:e});
});

/* ---------- demo places (synthetic landmarks on the grid) ---------- */
const LANDMARKS = [
  { id: (ROWS-1)+'_0',      name: 'Metro Station' },
  { id: (ROWS-1)+'_'+(COLS-1), name: 'Bus Terminal' },
  { id: '0_0',              name: 'College Gate' },
  { id: '2_2',              name: 'Night Market' },
  { id: '1_1',              name: 'City Clinic' },
  { id: '0_'+(COLS-1),      name: 'Home' }
];
const DEFAULT_START = (ROWS-1)+'_0';   // Metro Station, bottom-left (as in the original prototype)
const DEFAULT_DEST  = '0_'+(COLS-1);   // Home, top-right          (as in the original prototype)

global.LanternData = {
  nodes, edges, edgeById, adj,
  LANDMARKS, DEFAULT_START, DEFAULT_DEST
};

})(window);
