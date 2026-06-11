"use strict";
/* ========================= input ========================= */
let drag=null, selEdge=null, mouse={x:0,y:0};

function nodeAtScreen(sx,sy){
  const sc=S.camera.s;
  let best=null,bd=1e9;
  for(const n of S.nodes){
    const [x,y]=w2s(n.x,n.y);
    const r=(n.kind==="plant"?27:n.kind==="bus"?12:16*loadSizeF(n))*Math.max(sc,0.8);
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
function bendAtScreen(sx,sy,tol){   // unrealized bus = the dogleg corner of a 3-point path
  let best=null,bd=1e9;
  for(const e of S.edges){
    if(!bendTappable(e)) continue;
    const [x,y]=w2s(...e.path[1]);
    const d=dist(sx,sy,x,y);
    if(d<tol&&d<bd){best={e, x:e.path[1][0], y:e.path[1][1]};bd=d;}
  }
  return best;
}
/* resolve the current link drag: endpoints, cost, snap target, validity.
   shared by the ghost renderer and the drop handler so they can't disagree. */
function linkEnds(){
  const A=drag.fromBend?null:byId(drag.from);
  const fx=A?A.x:drag.fromBend.x, fy=A?A.y:drag.fromBend.y;
  const Bn=nodeAtScreen(mouse.x,mouse.y);
  const tb=Bn?null:bendAtScreen(mouse.x,mouse.y,28);
  let tx,ty;
  if(Bn){ tx=Bn.x; ty=Bn.y; }
  else if(tb){ tx=tb.x; ty=tb.y; }
  else { const [wx,wy]=s2w(mouse.x,mouse.y); tx=wx; ty=wy; }
  const path=octoPath(fx,fy,tx,ty), cost=wireCost(path);
  let valid=!!(Bn||tb);
  if(A&&Bn&&(Bn.id===A.id||edgeExists(A.id,Bn.id))) valid=false;
  if(drag.fromBend&&Bn&&(drag.fromBend.e.a===Bn.id||drag.fromBend.e.b===Bn.id)) valid=false;
  if(drag.fromBend&&tb&&tb.e===drag.fromBend.e) valid=false;
  if(A&&tb&&(tb.e.a===A.id||tb.e.b===A.id)) valid=false;
  return {path,cost,Bn,tb,valid};
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
  if(S.mode==="over"||S.mode==="menu") return;
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
  const bb=bendAtScreen(mouse.x,mouse.y,28);
  if(bb){ drag={kind:"link", fromBend:bb}; selEdge=null; return; }
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
    const L=linkEnds();
    if(L.valid){
      if(L.cost<=S.wire){
        // realize bends only now, when the wire actually completes
        const fromId=drag.fromBend?realizeBend(drag.fromBend.e).id:drag.from;
        const toId=L.tb?realizeBend(L.tb.e).id:L.Bn.id;
        addEdge(fromId,toId,L.cost); S.hintEdgeDone=true; blip(620+S.edges.length*14,.07);
      } else { toast("Not enough copper"); thud(); }
    }
  } else {
    const it=drag.item, [wx,wy]=s2w(mouse.x,mouse.y);
    if(it.kind==="reinf"){
      const ed=edgeAtScreen(mouse.x,mouse.y,14);
      if(ed){
        const chain=reinfChain(ed).filter(x=>!x.reinforced);
        if(chain.length){ for(const x of chain){ x.reinforced=true; x.cap*=2; }
          S.tray.splice(drag.ti,1); blip(760,.09); }
      }
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
  // a bus with nothing connected has no reason to exist
  for(const id of [e.a,e.b]){
    const n=byId(id);
    if(n&&n.kind==="bus"&&!S.edges.some(x=>x.a===id||x.b===id))
      S.nodes=S.nodes.filter(m=>m!==n);
  }
  blip(240,.07);
}
window.addEventListener("keydown",e=>{
  if(e.key===" "&&S.mode==="play"){ e.preventDefault(); S.speed=(S.speed+1)%CFG.speeds.length; }
  if(e.key==="m"||e.key==="M") S.muted=!S.muted;
  if((e.key==="r"||e.key==="R")&&S.mode==="over"){ newGame(); S.mode="play"; }
  if(e.key==="Delete"&&selEdge){ removeEdge(selEdge); selEdge=null; }
  if(e.key==="Escape"){            // clears a selection first; otherwise toggles the menu
    if(selEdge) selEdge=null;
    else if(S.mode==="play") S.mode="menu";
    else if(S.mode==="menu") S.mode="play";
  }
});
