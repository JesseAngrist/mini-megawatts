"use strict";
/* ========================= input ========================= */
let drag=null, selEdge=null, mouse={x:0,y:0};

function nodeAtScreen(sx,sy){
  const sc=S.camera.s;
  let best=null,bd=1e9;
  for(const n of S.nodes){
    const [x,y]=w2s(n.x,n.y);
    const r=(n.kind==="plant"?27:n.kind==="bus"?12:16)*Math.max(sc,0.8);
    const d=dist(sx,sy,x,y);
    if(d<r&&d<bd){best=n;bd=d;}
  }
  return best;
}
function edgeAtScreen(sx,sy,tol){
  const [wx,wy]=s2w(sx,sy);
  let best=null,bd=1e9;
  for(const e of S.edges){
    const d=distToPath(wx,wy,e.path)*S.camera.s;
    if(d<tol&&d<bd){best=e;bd=d;}
  }
  return best;
}
function trayAt(sx,sy){
  const ty=H-64;
  for(let i=0;i<S.tray.length;i++){
    const tx=W-64-i*66;
    if(Math.abs(sx-tx)<26&&Math.abs(sy-ty)<26) return i;
  }
  return -1;
}

cv.addEventListener("pointerdown",e=>{
  audioOn();
  mouse={x:e.clientX,y:e.clientY};
  if(S.mode==="title"){ S.mode="play"; return; }
  if(S.mode==="over") return;
  if(S.mode==="sunday"){
    for(const c of S.cards||[]){ const[x,y,w,h]=c._box||[0,0,0,0];
      if(mouse.x>x&&mouse.x<x+w&&mouse.y>y&&mouse.y<y+h){ applyCard(c); return; } }
    return;
  }
  // delete handle on selected edge
  if(selEdge){
    const [mx,my]=w2s(...pointOnPath(selEdge.path,0.5));
    if(dist(mouse.x,mouse.y,mx,my)<12){ removeEdge(selEdge); selEdge=null; return; }
  }
  const ti=trayAt(mouse.x,mouse.y);
  if(ti>=0){ drag={kind:"item", item:S.tray[ti], ti}; return; }
  const n=nodeAtScreen(mouse.x,mouse.y);
  if(n){ drag={kind:"link", from:n.id}; selEdge=null; return; }
  selEdge=edgeAtScreen(mouse.x,mouse.y,9)||null;
});
cv.addEventListener("pointermove",e=>{
  mouse={x:e.clientX,y:e.clientY};
  hoverNode=(S.mode==="play"&&!drag)?nodeAtScreen(mouse.x,mouse.y):null;
});
cv.addEventListener("pointerup",e=>{
  mouse={x:e.clientX,y:e.clientY};
  if(!drag) return;
  if(drag.kind==="link"){
    const A=byId(drag.from), Bn=nodeAtScreen(mouse.x,mouse.y);
    if(A&&Bn&&Bn.id!==A.id&&!edgeExists(A.id,Bn.id)){
      const cost=wireCost(octoPath(A.x,A.y,Bn.x,Bn.y));
      if(cost<=S.wire){ addEdge(A.id,Bn.id,cost); S.hintEdgeDone=true; blip(620+S.edges.length*14,.07); }
      else { toast("Not enough copper"); thud(); }
    }
  } else {
    const it=drag.item, [wx,wy]=s2w(mouse.x,mouse.y);
    if(it.kind==="reinf"){
      const ed=edgeAtScreen(mouse.x,mouse.y,14);
      if(ed&&!ed.reinforced){ ed.reinforced=true; ed.cap*=2; S.tray.splice(drag.ti,1); blip(760,.09); }
    } else if(placeOK(it,wx,wy)){
      if(it.kind==="bus") addBus(wx,wy); else addPlant(it.ptype,wx,wy);
      S.tray.splice(drag.ti,1); blip(420,.1);
    }
  }
  drag=null;
});
function removeEdge(e){
  S.wire+=wireCost(e.path)*CFG.wireRefund;
  S.edges=S.edges.filter(x=>x!==e);
  blip(240,.07);
}
window.addEventListener("keydown",e=>{
  if(e.key===" "){ e.preventDefault();          // cycle pause → 1× → 3× → pause
    if(S.paused){ S.paused=false; S.speed=0; }
    else if(S.speed===0) S.speed=1;
    else { S.speed=0; S.paused=true; }
  }
  if(e.key==="m"||e.key==="M") S.muted=!S.muted;
  if((e.key==="r"||e.key==="R")&&S.mode==="over"){ newGame(); S.mode="play"; }
  if(e.key==="Delete"&&selEdge){ removeEdge(selEdge); selEdge=null; }
  if(e.key==="Escape") selEdge=null;
});
