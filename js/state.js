"use strict";
/* ========================= game state ========================= */
let S; // game state
function newGame(){
  const townDeck = TOWNS.slice(); shuffle(townDeck);
  S = {
    mode: "title", t: 0, speed: 0, paused: false, muted: false,
    nodes: [], edges: [], nid: 1, eid: 1,
    wire: CFG.startWire, mwh: 0, bestLF: 0, dayMWh: 0, lastDay: 0,
    spawnQueue: [], week: 0, lastWeek: 0, towns: townDeck,
    planner: false, royalty: 0,
    tray: [{kind:"bus"}], cards: null, toasts: [], hintEdgeDone: false,
    flicker: new Map(), camera: { x: MAP.center.x, y: MAP.center.y, s: 1.9 },
    gameOverTown: null,
  };
  addPlant("coal", MAP.center.x-60, MAP.center.y+10);
  const f=rollStartSpot(MAP.center.x+95, MAP.center.y-55);
  addDemand("factory", f.x, f.y);
  const h=rollStartSpot(MAP.center.x+70, MAP.center.y+90);
  addDemand("home", h.x, h.y);
}
/* a fresh map deserves a fresh shape: scatter the opening customers around the
   works, with the same spacing rules spawns obey. fallback = the old fixed spot. */
function rollStartSpot(fx,fy){
  for(let tries=0;tries<200;tries++){
    const a=Math.random()*Math.PI*2, d=100+Math.random()*70;
    const x=MAP.center.x+Math.cos(a)*d, y=MAP.center.y+Math.sin(a)*d;
    if(x<40||y<40||x>MAP.w-40||y>MAP.h-40) continue;
    if(!clearOfWater(x,y,22)) continue;
    if(S.nodes.some(n=>dist(n.x,n.y,x,y)<88)) continue;
    return {x,y};
  }
  return {x:fx,y:fy};
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } }
function era(){ let e=CFG.eras[0]; for(const x of CFG.eras) if(S.week>=x.week) e=x; return e; }

function addPlant(ptype,x,y){
  const P=PTYPES[ptype];
  S.nodes.push({ id:S.nid++, kind:"plant", ptype, x, y, cap:P.cap, out:0, target:0,
    ring:new Array(24).fill(0), lastHr:-1, windSeed: Math.random()*1000,
    name: (S.towns.pop()||"Essex")+" "+(ptype==="coal"?"Works":ptype==="hydro"?"Dam":"Field") });
  return S.nodes[S.nodes.length-1];
}
function addDemand(dtype,x,y){
  const D=DTYPES[dtype];
  const scale=(lerp(D.peak[0],D.peak[1],Math.random()))*(1+S.week*CFG.demandGrowth);
  S.nodes.push({ id:S.nid++, kind:"demand", dtype, x, y, scale, patience:0,
    born:S.t, served:1, name:S.towns.pop()||"Somewhere", pop:0 });
  return S.nodes[S.nodes.length-1];
}
function addBus(x,y){ S.nodes.push({id:S.nid++, kind:"bus", x, y, name:"Junction"}); }
function addEdge(a,b,cost){
  const A=byId(a),Bn=byId(b);
  const path=octoPath(A.x,A.y,Bn.x,Bn.y);
  S.edges.push({ id:S.eid++, a, b, len:pathLen(path), path, cap:CFG.edgeCap,
    heat:0, online:true, downUntil:0, flow:0, reinforced:false, dash:0 });
  S.wire-=cost;
}
function byId(id){ return S.nodes.find(n=>n.id===id); }

function gameOver(n){
  S.mode="over"; S.gameOverTown=n.name; sadHorn();
}

/* ---------- toasts ---------- */
function toast(msg){ S.toasts.push({msg,t:0}); }
