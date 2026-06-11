"use strict";
/* ====================== rendering ====================== */
const cv=document.getElementById("cv"), ctx=cv.getContext("2d");
let DPR=1, W=0, H=0;
function resize(){ DPR=window.devicePixelRatio||1;
  W=window.innerWidth; H=window.innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; cv.style.width=W+"px"; cv.style.height=H+"px"; }
window.addEventListener("resize",resize); resize();

const FONT="'Helvetica Neue', Helvetica, system-ui, sans-serif";
const COL={ paper:"#F7F4EE", night:"#E9E7F0", water:"#CDE3EA", ink:"#2E2A28",
  line:"#3A3633", amber:"#F2A33C", red:"#E2574C", soft:"#B9B3AA",
  home:"#E2574C", factory:"#4A77C9", transit:"#E8A23D", lights:"#7B61B8", glowy:"#FFD98A" };
const DCOL={home:COL.home,factory:COL.factory,transit:COL.transit,lights:COL.lights};

function w2s(x,y){ const c=S.camera; return [(x-c.x)*c.s+W/2,(y-c.y)*c.s+H/2]; }
function s2w(x,y){ const c=S.camera; return [(x-W/2)/c.s+c.x,(y-H/2)/c.s+c.y]; }

function nightFactor(){ const h=S.t%24;
  if(h<5||h>20) return 1; if(h<7) return 1-(h-5)/2; if(h>18) return (h-18)/2; return 0; }

function updateCamera(){
  if(S.mode==="title") return;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const n of S.nodes){ x0=Math.min(x0,n.x);y0=Math.min(y0,n.y);x1=Math.max(x1,n.x);y1=Math.max(y1,n.y); }
  const m=130, bw=x1-x0+2*m, bh=y1-y0+2*m;
  const ts=clamp(Math.min(W/bw,H/bh),0.42,2.0);
  const tx=(x0+x1)/2, ty=(y0+y1)/2, c=S.camera;
  c.s=lerp(c.s,ts,0.02); c.x=lerp(c.x,tx,0.03); c.y=lerp(c.y,ty,0.03);
}

function mixHex(a,b,t){
  const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16);
  const r=lerp(pa>>16,pb>>16,t)|0, g=lerp((pa>>8)&255,(pb>>8)&255,t)|0, bl=lerp(pa&255,pb&255,t)|0;
  return `rgb(${r},${g},${bl})`;
}

function draw(){
  const nf=S.mode==="title"?0:nightFactor();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=mixHex(COL.paper,COL.night,nf*0.8);
  ctx.fillRect(0,0,W,H);
  drawWater();
  if(S.mode==="title"){ drawTitle(); return; }
  drawEdges(nf); drawPlannerGhosts(); drawNodes(nf); drawGhost(); drawHUD(nf);
  if(S.mode==="sunday") drawCards();
  if(S.mode==="over") drawOver();
}

function drawWater(){
  ctx.fillStyle=COL.water;
  ctx.beginPath();
  MAP.ocean.forEach((p,i)=>{ const [x,y]=w2s(...p); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle=COL.water; ctx.lineCap="round"; ctx.lineJoin="round";
  for(const r of MAP.rivers){
    ctx.lineWidth=r.w*S.camera.s;
    ctx.beginPath();
    r.pts.forEach((p,i)=>{ const [x,y]=w2s(...p); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
    ctx.stroke();
  }
}

function strokePath(path,width){
  ctx.lineWidth=width; ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.beginPath();
  const pts=path.map(p=>w2s(...p));
  ctx.moveTo(...pts[0]);
  if(pts.length===2) ctx.lineTo(...pts[1]);
  else { ctx.arcTo(pts[1][0],pts[1][1],pts[2][0],pts[2][1],14*S.camera.s); ctx.lineTo(...pts[2]); }
  ctx.stroke();
}

function drawEdges(nf){
  const sc=S.camera.s;
  for(const e of S.edges){
    const r=Math.abs(e.flow)/e.cap;
    if(!e.online){
      ctx.strokeStyle="rgba(120,114,108,0.45)";
      ctx.setLineDash([4*sc,7*sc]); strokePath(e.path,3.5*sc); ctx.setLineDash([]);
      continue;
    }
    let col=COL.line;
    if(r>0.65) col=mixHex(COL.line,COL.amber,clamp((r-0.65)/0.35,0,1));
    if(r>1) col=mixHex(COL.amber,COL.red,clamp((r-1)/0.35,0,1));
    if(e===selEdge) col=COL.factory;
    ctx.strokeStyle=col;
    strokePath(e.path,(e.reinforced?8:5)*sc);
    // flow dashes
    if(Math.abs(e.flow)>0.8){
      ctx.strokeStyle="rgba(247,244,238,0.95)";
      ctx.setLineDash([3.2*sc,11*sc]);
      ctx.lineDashOffset=e.dash*sc;
      strokePath(e.path,(e.reinforced?3.4:2.2)*sc);
      ctx.setLineDash([]); ctx.lineDashOffset=0;
    }
    if(e===selEdge){ // delete handle
      const [mx,my]=w2s(...pointOnPath(e.path,0.5));
      ctx.fillStyle=COL.red; ctx.beginPath(); ctx.arc(mx,my,9,0,7); ctx.fill();
      ctx.strokeStyle="#fff"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(mx-3.5,my-3.5); ctx.lineTo(mx+3.5,my+3.5);
      ctx.moveTo(mx+3.5,my-3.5); ctx.lineTo(mx-3.5,my+3.5); ctx.stroke();
    }
  }
}

function shapePath(x,y,r,shape){
  ctx.beginPath();
  if(shape==="circle") ctx.arc(x,y,r,0,7);
  else if(shape==="square") ctx.rect(x-r*0.9,y-r*0.9,r*1.8,r*1.8);
  else if(shape==="triangle"){ ctx.moveTo(x,y-r*1.15); ctx.lineTo(x+r*1.05,y+r*0.85); ctx.lineTo(x-r*1.05,y+r*0.85); ctx.closePath(); }
  else { ctx.moveTo(x,y-r*1.2); ctx.lineTo(x+r*1.2,y); ctx.lineTo(x,y+r*1.2); ctx.lineTo(x-r*1.2,y); ctx.closePath(); }
}

function drawPlannerGhosts(){
  if(!S.planner || !S.paused || S.mode!=="play") return;
  const sc=S.camera.s;
  for(const q of S.spawnQueue){
    const eta=q.t-S.t;
    if(eta>7*24) break;
    const [x,y]=w2s(q.x,q.y);
    ctx.globalAlpha=0.55-0.3*(eta/(7*24));
    ctx.strokeStyle=DCOL[q.dtype]; ctx.lineWidth=2.2*sc;
    ctx.setLineDash([4*sc,4*sc]);
    shapePath(x,y,9*sc,DTYPES[q.dtype].shape); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=COL.soft; ctx.font=`600 ${10*sc}px ${FONT}`; ctx.textAlign="center";
    ctx.fillText(Math.max(1,Math.ceil(eta/24))+"d", x, y+20*sc);
    ctx.globalAlpha=1;
  }
}

function drawNodes(nf){
  const sc=S.camera.s, hour=S.t%24;
  for(const n of S.nodes){
    const [x,y]=w2s(n.x,n.y);
    if(n.kind==="bus"){
      ctx.fillStyle=COL.ink; ctx.beginPath(); ctx.arc(x,y,4.6*sc,0,7); ctx.fill();
      ctx.fillStyle=COL.paper; ctx.beginPath(); ctx.arc(x,y,2*sc,0,7); ctx.fill();
      continue;
    }
    if(n.kind==="plant"){ drawPlant(n,x,y,sc); continue; }
    // demand
    const d=demandOf(n,hour), peakNow=d/n.scale;
    const r=11*sc;
    if(n.pop<1) n.pop=Math.min(1,n.pop+0.04);
    const pr=r*(0.3+0.7*easeOut(n.pop));
    // night windows: warm glow when served
    if(nf>0.15 && n.served>0.6){
      const flick=(n.served<0.95 && Math.random()<0.2)?0.3:1;
      ctx.shadowColor=COL.glowy; ctx.shadowBlur=16*sc*nf*flick*(0.4+0.6*peakNow);
    }
    ctx.fillStyle=mixHex(COL.paper,COL.night,nf*0.8);
    ctx.strokeStyle=DCOL[n.dtype]; ctx.lineWidth=3.4*sc;
    shapePath(x,y,pr,DTYPES[n.dtype].shape); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0;
    // peak-hour pulse: shape breathes with its own appetite
    ctx.globalAlpha=0.18+0.5*peakNow;
    ctx.fillStyle=DCOL[n.dtype];
    shapePath(x,y,pr*0.45,DTYPES[n.dtype].shape); ctx.fill();
    ctx.globalAlpha=1;
    // patience arc
    if(n.patience>0.02){
      ctx.strokeStyle=COL.red; ctx.lineWidth=3*sc;
      ctx.beginPath(); ctx.arc(x,y,r+6*sc,-Math.PI/2,-Math.PI/2+n.patience*Math.PI*2); ctx.stroke();
      if(n.patience>0.6 && (S.t*4|0)%2===0){
        ctx.globalAlpha=0.35; ctx.strokeStyle=COL.red;
        ctx.beginPath(); ctx.arc(x,y,r+10*sc,0,7); ctx.stroke(); ctx.globalAlpha=1;
      }
    }
    // not-yet-wired hint
    if(!S.edges.some(e=>e.a===n.id||e.b===n.id)){
      ctx.globalAlpha=0.5+0.3*Math.sin(performance.now()/300);
      ctx.strokeStyle=COL.soft; ctx.setLineDash([3*sc,4*sc]); ctx.lineWidth=1.6*sc;
      ctx.beginPath(); ctx.arc(x,y,r+11*sc,0,7); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha=1;
    }
  }
}
function easeOut(t){ return 1-Math.pow(1-t,3); }

function drawPlant(p,x,y,sc){
  const T=PTYPES[p.ptype];
  const R=15*sc, base=24*sc, barMax=10*sc;
  // the signature, sharpened: 24 radial bars, length = that hour's utilization.
  ctx.strokeStyle="#E7E2D8"; ctx.lineWidth=1.2*sc;
  ctx.beginPath(); ctx.arc(x,y,base,0,7); ctx.stroke();
  ctx.lineCap="butt";
  for(let h=0;h<24;h++){
    const a=-Math.PI/2+(h+0.5)/24*Math.PI*2;
    const u=p.ring[h];
    const r0=base+1.5*sc;
    const r1=r0+(u>0.02? Math.max(u*barMax,1.6*sc) : 0.7*sc);
    ctx.strokeStyle=u>0.02?mixHex("#CFC9BE",T.color,Math.pow(u,0.7)):"#E0DACF";
    ctx.lineWidth=2.3*sc;
    ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*r0,y+Math.sin(a)*r0);
    ctx.lineTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1); ctx.stroke();
  }
  ctx.lineCap="round";
  // current-hour marker: ink dot riding inside the circle
  const hNow=-Math.PI/2+((S.t%24)/24)*Math.PI*2;
  ctx.fillStyle=COL.ink;
  ctx.beginPath(); ctx.arc(x+Math.cos(hNow)*(base-4.5*sc),y+Math.sin(hNow)*(base-4.5*sc),1.9*sc,0,7); ctx.fill();
  // body — coal gets nudged down so body+stacks center vertically in the ring
  const yb=y+(p.ptype==="coal"?R*0.41:0);
  ctx.fillStyle=T.color;
  if(p.ptype==="wind"){
    ctx.strokeStyle=T.color; ctx.lineWidth=3*sc;
    const spin=S.t*windAvail(p,S.t)*4;
    for(let i=0;i<3;i++){ const a=spin+i*Math.PI*2/3;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(a)*R*0.9,y+Math.sin(a)*R*0.9); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x,y,3.4*sc,0,7); ctx.fill();
  } else {
    ctx.beginPath();
    const rr=4*sc; roundRect(x-R*0.85,yb-R*0.7,R*1.7,R*1.4,rr); ctx.fill();
    if(p.ptype==="coal"){
      // twin stacks, battersea-style
      ctx.fillRect(x-R*0.58,yb-R*1.42,R*0.26,R*0.78);
      ctx.fillRect(x+R*0.32,yb-R*1.42,R*0.26,R*0.78);
      ctx.fillRect(x-R*0.66,yb-R*1.52,R*0.42,R*0.16);
      ctx.fillRect(x+R*0.24,yb-R*1.52,R*0.42,R*0.16);
      // arched windows, lit from within
      ctx.fillStyle=COL.paper;
      for(let i=-1;i<=1;i++){ ctx.beginPath();
        ctx.arc(x+i*R*0.46,yb+R*0.16,R*0.14,Math.PI,0);
        ctx.rect(x+i*R*0.46-R*0.14,yb+R*0.16,R*0.28,R*0.3); ctx.fill(); }
      ctx.fillStyle=T.color;
      const sm=p.out/p.cap;
      if(sm>0.05){ ctx.globalAlpha=0.22;
        for(let s=-1;s<=1;s+=2) for(let i=0;i<3;i++){
          const ph=(S.t*0.7+i*0.8+(s>0?0.45:0))%2;
          ctx.beginPath();
          ctx.arc(x+s*R*0.45+ph*3.5*sc*s, yb-R*1.55-ph*9*sc, (1.6+sm*2.8+ph*2.3)*sc,0,7);
          ctx.fill(); }
        ctx.globalAlpha=1; }
    }
    if(p.ptype==="hydro"){ ctx.fillStyle=COL.paper;
      ctx.beginPath(); ctx.arc(x,yb+R*0.1,R*0.32,0,Math.PI); ctx.fill(); }
  }
  // output bar inside ring base
  ctx.fillStyle=COL.ink; ctx.font=`${10*sc}px ${FONT}`; ctx.textAlign="center";
  ctx.fillText(Math.round(p.out)+"", x, y+base+barMax+9*sc);
}
function roundRect(x,y,w,h,r){
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

/* ---------- HUD ---------- */
function drawHUD(nf){
  ctx.textAlign="left"; ctx.fillStyle=COL.ink;
  ctx.font=`600 15px ${FONT}`;
  ctx.fillText("⚡ "+Math.round(S.mwh).toLocaleString()+" MWh", 18, 30);
  ctx.font=`13px ${FONT}`; ctx.fillStyle=S.wire<60?COL.red:COL.ink;
  ctx.fillText(Math.round(S.wire)+" km copper", 18, 52);
  ctx.fillStyle=COL.soft; ctx.fillText("Day "+(Math.floor(S.t/24)+1)+" · "+era().name+" era", 18, 72);
  ctx.font=`600 14px ${FONT}`;
  if(S.paused){ ctx.fillStyle=COL.ink; ctx.fillText("Paused", 18, 94); }
  else { ctx.fillStyle=COL.soft; ctx.fillText(S.speed===0?"▶ 1×":"▶▶ 3×", 18, 94); }

  // sun dial
  const cx=W-46, cy=44, r=18, h=S.t%24;
  ctx.strokeStyle=COL.soft; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.stroke();
  ctx.fillStyle="rgba(60,56,80,0.18)";
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI*0.999,Math.PI*2.001); ctx.closePath(); // top half = night
  ctx.fill();
  const a=-Math.PI/2+h/24*Math.PI*2; // midnight at top
  const sun=h>=6&&h<=18;
  ctx.fillStyle=sun?COL.amber:"#8D86B5";
  ctx.beginPath(); ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,4.2,0,7); ctx.fill();
  // week notches
  const dow=Math.floor(S.t/24)%7;
  for(let i=0;i<7;i++){ ctx.fillStyle=i<=dow?COL.ink:COL.soft;
    ctx.fillRect(cx-21+i*6.5, cy+r+8, 4, 4); }

  // tray
  const ty=H-64;
  S.tray.forEach((it,i)=>{
    const tx=W-64-i*66;
    ctx.fillStyle="#fff"; ctx.strokeStyle=COL.soft; ctx.lineWidth=1.5;
    ctx.beginPath(); roundRect(tx-26,ty-26,52,52,10); ctx.fill(); ctx.stroke();
    drawTrayIcon(it,tx,ty);
  });
  if(S.tray.length){ ctx.fillStyle=COL.soft; ctx.font=`11px ${FONT}`; ctx.textAlign="right";
    ctx.fillText("Drag to place", W-18, ty+44); }

  // hints
  ctx.textAlign="left"; ctx.fillStyle=COL.soft; ctx.font=`12px ${FONT}`;
  const hint = (S.paused&&S.planner) ? "Ghosts are next week's customers — plan your trunks"
    : (S.hintEdgeDone?"Space cycles pause · 1× · 3× — click a line to cut it":"Drag from the works to a customer to string wire");
  ctx.fillText(hint, 18, H-18);

  // toasts
  ctx.textAlign="center";
  S.toasts.forEach((t,i)=>{
    t.t+=1/60; const a=t.t<0.3?t.t/0.3:(t.t>3?clamp(1-(t.t-3),0,1):1);
    if(a<=0) return;
    ctx.globalAlpha=a; ctx.fillStyle=COL.ink; ctx.font=`13px ${FONT}`;
    ctx.fillText(t.msg, W/2, H-26-i*22); ctx.globalAlpha=1;
  });
  S.toasts=S.toasts.filter(t=>t.t<4);

  drawTooltip();
}
function drawTrayIcon(it,x,y){
  ctx.fillStyle=COL.ink; ctx.strokeStyle=COL.ink;
  if(it.kind==="bus"){ ctx.beginPath(); ctx.arc(x,y,6,0,7); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x,y,2.5,0,7); ctx.fill(); }
  else if(it.kind==="reinf"){ ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(x-12,y+8); ctx.lineTo(x+12,y-8); ctx.stroke(); }
  else { const T=PTYPES[it.ptype]; ctx.fillStyle=T.color;
    if(it.ptype==="wind"){ ctx.strokeStyle=T.color; ctx.lineWidth=2.5;
      for(let i=0;i<3;i++){ const a=i*Math.PI*2/3-Math.PI/2;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(a)*11,y+Math.sin(a)*11); ctx.stroke(); } }
    else { ctx.beginPath(); roundRect(x-11,y-8,22,16,3); ctx.fill();
      if(it.ptype==="coal") ctx.fillRect(x+3,y-15,4,8);
      if(it.ptype==="hydro"){ ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x,y+2,4,0,Math.PI); ctx.fill(); } } }
}

let hoverNode=null;
function drawTooltip(){
  if(!hoverNode || drag) return;
  const n=hoverNode, [x,y]=w2s(n.x,n.y);
  const w=150,h=n.kind==="demand"?86:64;
  let bx=clamp(x+18,8,W-w-8), by=clamp(y-h/2,8,H-h-8);
  ctx.fillStyle="rgba(255,255,255,0.96)"; ctx.strokeStyle=COL.soft; ctx.lineWidth=1;
  ctx.beginPath(); roundRect(bx,by,w,h,8); ctx.fill(); ctx.stroke();
  ctx.fillStyle=COL.ink; ctx.textAlign="left"; ctx.font=`600 13px ${FONT}`;
  ctx.fillText(n.name, bx+10, by+20);
  ctx.font=`11px ${FONT}`; ctx.fillStyle=COL.soft;
  if(n.kind==="demand"){
    ctx.fillText(n.dtype[0].toUpperCase()+n.dtype.slice(1)+" · peak "+Math.round(n.scale)+" MW", bx+10, by+36);
    const prof=DTYPES[n.dtype].prof;
    for(let i=0;i<24;i++){ const bh=prof[i]*26;
      ctx.fillStyle=i===Math.floor(S.t%24)?DCOL[n.dtype]:"#D8D2C8";
      ctx.fillRect(bx+10+i*5.4, by+74-bh, 4, bh); }
  } else if(n.kind==="plant"){
    const T=PTYPES[n.ptype];
    ctx.fillText(T.label+" · "+Math.round(n.out)+" / "+Math.round(T.variable?n.cap*windAvail(n,S.t):n.cap)+" MW", bx+10, by+36);
    ctx.fillText("Ring = its last 24 hours", bx+10, by+52);
  } else ctx.fillText("Wires meet here", bx+10, by+36);
}

/* ---------- ghost line while dragging ---------- */
function drawGhost(){
  if(!drag) return;
  const sc=S.camera.s;
  if(drag.kind==="link"){
    const A=byId(drag.from); const [wx,wy]=s2w(mouse.x,mouse.y);
    const snap=nodeAtScreen(mouse.x,mouse.y);
    const tx=snap&&snap.id!==A.id?snap.x:wx, ty=snap&&snap.id!==A.id?snap.y:wy;
    const path=octoPath(A.x,A.y,tx,ty), cost=wireCost(path);
    const ok=cost<=S.wire && snap && snap.id!==A.id && !edgeExists(A.id,snap.id);
    ctx.strokeStyle=ok?COL.line:(cost>S.wire?COL.red:COL.soft);
    ctx.globalAlpha=0.75; ctx.setLineDash([6*sc,6*sc]);
    strokePath(path,4*sc); ctx.setLineDash([]); ctx.globalAlpha=1;
    const [mx,my]=w2s(...pointOnPath(path,0.55));
    ctx.fillStyle=cost>S.wire?COL.red:COL.ink; ctx.font=`600 12px ${FONT}`; ctx.textAlign="center";
    ctx.fillText(Math.round(cost)+" km", mx, my-10);
  } else { // placing an item
    const [wx,wy]=s2w(mouse.x,mouse.y);
    const ok=placeOK(drag.item,wx,wy);
    ctx.globalAlpha=ok?0.9:0.35;
    drawTrayIcon(drag.item,mouse.x,mouse.y);
    ctx.globalAlpha=1;
    if(drag.item.kind==="plant"&&PTYPES[drag.item.ptype].water&&!ok){
      ctx.fillStyle=COL.soft; ctx.font=`11px ${FONT}`; ctx.textAlign="center";
      ctx.fillText("Needs the river", mouse.x, mouse.y+26);
    }
  }
}
function edgeExists(a,b){ return S.edges.some(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)); }
function placeOK(it,x,y){
  if(x<20||y<20||x>MAP.w-20||y>MAP.h-20) return false;
  if(it.kind==="reinf") return !!edgeAtScreen(mouse.x,mouse.y,14);
  if(S.nodes.some(n=>dist(n.x,n.y,x,y)<46)) return false;
  if(it.kind==="plant"&&PTYPES[it.ptype].water){
    return !inWater(x,y) && MAP.rivers.some(r=>distToPath(x,y,r.pts)<r.w/2+34);
  }
  return !inWater(x,y);
}

/* ---------- overlays ---------- */
function drawTitle(){
  ctx.textAlign="center"; ctx.fillStyle=COL.ink;
  ctx.font=`700 54px ${FONT}`; ctx.fillText("MINI MEGAWATTS", W/2, H/2-60);
  ctx.font=`16px ${FONT}`; ctx.fillStyle=COL.soft;
  ctx.fillText("A grid, with love · New Jersey, 1882", W/2, H/2-26);
  ctx.font=`600 14px ${FONT}`; ctx.fillStyle=COL.amber;
  ctx.fillText("Electricity takes every path at once — shorter paths take more", W/2, H/2+18);
  ctx.fillStyle=COL.ink; ctx.font=`14px ${FONT}`;
  if((performance.now()/600|0)%2===0) ctx.fillText("Click to energize", W/2, H/2+64);
}
function drawCards(){
  ctx.fillStyle="rgba(247,244,238,0.82)"; ctx.fillRect(0,0,W,H);
  ctx.textAlign="center"; ctx.fillStyle=COL.ink;
  ctx.font=`700 24px ${FONT}`; ctx.fillText("Sunday", W/2, H/2-110);
  ctx.font=`13px ${FONT}`; ctx.fillStyle=COL.soft; ctx.fillText("Pick one", W/2, H/2-86);
  S.cards.forEach((c,i)=>{
    const cw=210,ch=140, x=W/2+(i===0?-cw-16:16), y=H/2-ch/2;
    const hov=mouse.x>x&&mouse.x<x+cw&&mouse.y>y&&mouse.y<y+ch;
    ctx.fillStyle="#fff"; ctx.strokeStyle=hov?COL.ink:COL.soft; ctx.lineWidth=hov?2.5:1.5;
    ctx.beginPath(); roundRect(x,y,cw,ch,14); ctx.fill(); ctx.stroke();
    if(c.id==="wire"){ ctx.strokeStyle=COL.amber; ctx.lineWidth=4;
      ctx.beginPath(); ctx.arc(x+cw/2,y+46,14,0.5,5.5); ctx.stroke(); }
    else if(c.id==="royal"){ ctx.strokeStyle=COL.amber; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(x+cw/2,y+46,13,0,7); ctx.stroke();
      ctx.fillStyle=COL.amber; ctx.font=`700 15px ${FONT}`; ctx.fillText("⚡",x+cw/2,y+51); }
    else { const icon={kind:(c.id==="bus"?"bus":(c.id==="reinf"?"reinf":"plant")), ptype:c.id};
      drawTrayIcon(icon,x+cw/2,y+46); }
    ctx.fillStyle=COL.ink; ctx.font=`600 15px ${FONT}`; ctx.fillText(c.t,x+cw/2,y+88);
    ctx.fillStyle=COL.soft; ctx.font=`12px ${FONT}`; ctx.fillText(c.d,x+cw/2,y+108);
    c._box=[x,y,cw,ch];
  });
}
function drawOver(){
  ctx.fillStyle="rgba(46,42,40,0.88)"; ctx.fillRect(0,0,W,H);
  ctx.textAlign="center"; ctx.fillStyle=COL.paper;
  ctx.font=`700 30px ${FONT}`; ctx.fillText("The lights went out in "+S.gameOverTown+".", W/2, H/2-50);
  ctx.font=`15px ${FONT}`; ctx.fillStyle="#CFC9BF";
  ctx.fillText("Survived "+(Math.floor(S.t/24)+1)+" days · delivered "+Math.round(S.mwh).toLocaleString()+" MWh", W/2, H/2-8);
  ctx.fillText("Best load factor "+Math.round(S.bestLF*100)+"% — Insull would "+(S.bestLF>0.55?"approve":"wince"), W/2, H/2+18);
  ctx.fillStyle=COL.amber; ctx.font=`600 14px ${FONT}`;
  ctx.fillText("Press R to re-energize", W/2, H/2+64);
}
