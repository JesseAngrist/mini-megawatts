"use strict";
/* ====================== pure math / logic ====================== */
/* everything here is side-effect free. under node, this file is a module
   (the exports at the bottom); inWater/waterFrac/wireCost lean on MAP/CFG
   from config.js, which only exist in the browser — don't export those. */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function dist(ax,ay,bx,by){ return Math.hypot(bx-ax,by-ay); }

function profileAt(prof, hour) {            // smooth (cosine) hourly interp
  const h0 = Math.floor(hour)%24, h1 = (h0+1)%24, f = hour - Math.floor(hour);
  const t = (1 - Math.cos(f*Math.PI))/2;
  return lerp(prof[h0], prof[h1], t);
}

function octoPath(ax,ay,bx,by) {             // 45° dogleg, diagonal first
  const dx = bx-ax, dy = by-ay, adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < 2 || ady < 2 || Math.abs(adx-ady) < 2) return [[ax,ay],[bx,by]];
  const d = Math.min(adx,ady);
  return [[ax,ay],[ax+Math.sign(dx)*d, ay+Math.sign(dy)*d],[bx,by]];
}
function pathLen(p){ let L=0; for(let i=1;i<p.length;i++) L+=dist(...p[i-1],...p[i]); return L; }
function pointOnPath(p, t) {                 // t in [0,1] by arclength
  const total = pathLen(p); let target = t*total;
  for (let i=1;i<p.length;i++){
    const L = dist(...p[i-1],...p[i]);
    if (target<=L || i===p.length-1){ const f=L>0?target/L:0;
      return [lerp(p[i-1][0],p[i][0],f), lerp(p[i-1][1],p[i][1],f)]; }
    target -= L;
  }
  return p[p.length-1];
}
function distToPath(px,py,path){
  let best=1e9;
  for(let i=1;i<path.length;i++){
    const [ax,ay]=path[i-1],[bx,by]=path[i];
    const l2=(bx-ax)**2+(by-ay)**2;
    let t=l2>0?(((px-ax)*(bx-ax)+(py-ay)*(by-ay))/l2):0; t=clamp(t,0,1);
    best=Math.min(best, dist(px,py,ax+t*(bx-ax),ay+t*(by-ay)));
  }
  return best;
}
function pointInPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function inWater(x,y){
  if (pointInPoly(x,y,MAP.ocean)) return true;
  for (const r of MAP.rivers) if (distToPath(x,y,r.pts) < r.w/2) return true;
  return false;
}
function waterFrac(path){
  const N=24; let n=0;
  for(let i=0;i<N;i++){ const [x,y]=pointOnPath(path,(i+0.5)/N); if(inWater(x,y)) n++; }
  return n/N;
}
function wireCost(path){ return pathLen(path)*(1+(CFG.waterMult-1)*waterFrac(path)); }

/* gaussian elimination w/ partial pivot. A: n×n array-of-arrays, b: n. mutates copies. */
function gauss(A,b){
  const n=b.length, M=A.map(r=>r.slice()), v=b.slice();
  for(let c=0;c<n;c++){
    let p=c; for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
    if(Math.abs(M[p][c])<1e-12) return null;
    [M[c],M[p]]=[M[p],M[c]]; [v[c],v[p]]=[v[p],v[c]];
    for(let r=c+1;r<n;r++){ const f=M[r][c]/M[c][c];
      for(let k=c;k<n;k++) M[r][k]-=f*M[c][k]; v[r]-=f*v[c]; }
  }
  const x=new Array(n).fill(0);
  for(let r=n-1;r>=0;r--){ let s=v[r];
    for(let k=r+1;k<n;k++) s-=M[r][k]*x[k]; x[r]=s/M[r][r]; }
  return x;
}

/* DC power flow on one island.
   ids: node ids (injections sum ≈ 0), inj: Map id->MW,
   edges: [{id,a,b,len,online}] subset touching island.
   returns Map edgeId -> flow (positive a→b).
   flow splits across parallel paths inversely ∝ path length. that's the whole game. */
function solveFlow(ids, inj, edges){
  const flows = new Map();
  if (ids.length < 2) return flows;
  const idx = new Map(ids.map((id,i)=>[id,i]));
  const n = ids.length;
  const B = Array.from({length:n},()=>new Array(n).fill(0));
  const live = edges.filter(e=>e.online && idx.has(e.a) && idx.has(e.b));
  for (const e of live){
    const b = 100/Math.max(e.len,1), i=idx.get(e.a), j=idx.get(e.b);
    B[i][i]+=b; B[j][j]+=b; B[i][j]-=b; B[j][i]-=b;
  }
  // reduce: drop node 0 as slack
  const A = Array.from({length:n-1},(_,r)=>B[r+1].slice(1));
  const rhs = ids.slice(1).map(id=>inj.get(id)||0);
  const th = gauss(A,rhs);
  if (!th) return flows;
  const theta = [0,...th];
  for (const e of live){
    const b=100/Math.max(e.len,1);
    flows.set(e.id, b*(theta[idx.get(e.a)] - theta[idx.get(e.b)]));
  }
  return flows;
}

/* connected components over online edges. returns array of Set(nodeId). */
function components(nodeIds, edges){
  const parent = new Map(nodeIds.map(id=>[id,id]));
  const find = x => { while(parent.get(x)!==x){ parent.set(x,parent.get(parent.get(x))); x=parent.get(x);} return x; };
  for (const e of edges) if (e.online && parent.has(e.a) && parent.has(e.b)){
    const ra=find(e.a), rb=find(e.b); if(ra!==rb) parent.set(ra,rb);
  }
  const comps=new Map();
  for(const id of nodeIds){ const r=find(id);
    if(!comps.has(r)) comps.set(r,new Set()); comps.get(r).add(id); }
  return [...comps.values()];
}

/* dijkstra over online edges from a source; returns Map id->distance */
function shortestDist(src, nodeIds, edges){
  const adj=new Map(nodeIds.map(id=>[id,[]]));
  for(const e of edges) if(e.online && adj.has(e.a) && adj.has(e.b)){
    adj.get(e.a).push([e.b,e.len]); adj.get(e.b).push([e.a,e.len]); }
  const d=new Map([[src,0]]); const Q=[[0,src]];
  while(Q.length){
    Q.sort((a,b)=>a[0]-b[0]); const [du,u]=Q.shift();
    if(du>(d.get(u)??1e18)) continue;
    for(const [v,w] of adj.get(u)||[]){
      const nd=du+w; if(nd < (d.get(v)??1e18)){ d.set(v,nd); Q.push([nd,v]); }
    }
  }
  return d;
}

if (typeof module!=="undefined") module.exports={gauss,solveFlow,components,octoPath,pathLen,profileAt,shortestDist};
