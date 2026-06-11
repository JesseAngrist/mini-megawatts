"use strict";
/* ========================= simulation ========================= */
function demandOf(n,hour){ return n.scale*profileAt(DTYPES[n.dtype].prof,hour); }
function windAvail(p,t){ // smooth pseudo-noise in [0.1, 0.95]
  const s=p.windSeed;
  return clamp(0.5 + 0.28*Math.sin(t*0.21+s) + 0.22*Math.sin(t*0.057+s*2.7), 0.1, 0.95);
}

function tick(dtReal){
  const sp = CFG.speeds[S.speed];
  const dtS = dtReal*sp;                  // game-seconds
  const dtH = dtS*24/CFG.dayLen;          // game-hours
  S.t += dtH;
  const hour = S.t%24, day = Math.floor(S.t/24);
  S.week = Math.floor(day/7);
  const E = era();

  // daily load factor bookkeeping
  if (day!==S.lastDay){
    const capTot = S.nodes.filter(n=>n.kind==="plant").reduce((s,p)=>s+p.cap,0);
    if (capTot>0){ const lf=S.dayMWh/(24*capTot); if(lf>S.bestLF) S.bestLF=lf; }
    S.dayMWh=0; S.lastDay=day;
  }
  // sunday
  if (S.week!==S.lastWeek){
    S.lastWeek=S.week; S.wire+=CFG.weeklyWire;
    toast("Sunday · +"+CFG.weeklyWire+" km of copper");
    if (S.week===CFG.plannerWeek && !S.planner){
      S.planner=true; toast("Transmission planner hired — pause to survey the week ahead");
    }
    if (S.week===era().week && era().week>0) toast("The "+era().name+" era · regulators lean in");
    offerCards(); chime();
  }
  // spawn demand from the pre-rolled ledger
  ensureQueue();
  while (S.spawnQueue.length && S.spawnQueue[0].t<=S.t){
    materialize(S.spawnQueue.shift());
    if (S.mode!=="play") return;
  }
  // line recovery
  for (const e of S.edges){
    if(!e.online && S.t>=e.downUntil){ e.online=true; e.heat=0.4; }
  }

  /* per-island dispatch + flow */
  const ids=S.nodes.map(n=>n.id);
  const comps=components(ids,S.edges);
  const allFlows=new Map();
  for (const comp of comps){
    const plants=S.nodes.filter(n=>n.kind==="plant"&&comp.has(n.id));
    const loads =S.nodes.filter(n=>n.kind==="demand"&&comp.has(n.id));
    const D=loads.reduce((s,n)=>s+demandOf(n,hour),0);
    if (!plants.length){ for(const n of loads) n.served=0; continue; }

    // proximity-weighted targets (locals serve locals → line loading is honest)
    // dispatchers forecast: stoke toward the larger of demand now and demand in 90 min
    const dmaps=plants.map(p=>shortestDist(p.id,[...comp],S.edges));
    const target=new Array(plants.length).fill(0);
    for (const g of loads){
      const d=Math.max(demandOf(g,hour), demandOf(g,(hour+1.5)%24));
      const w=plants.map((p,i)=>1/Math.pow((dmaps[i].get(g.id)??1e6)+60,2));
      const W=w.reduce((a,b)=>a+b,0);
      plants.forEach((p,i)=>target[i]+=d*w[i]/W);
    }
    // capacity-aware redistribution
    const capEff=plants.map(p=>PTYPES[p.ptype].variable? p.cap*windAvail(p,S.t) : p.cap);
    for(let pass=0;pass<3;pass++){
      let over=0, head=0;
      plants.forEach((p,i)=>{ if(target[i]>capEff[i]){ over+=target[i]-capEff[i]; target[i]=capEff[i]; }
                              else head+=capEff[i]-target[i]; });
      if(over<0.01||head<0.01) break;
      plants.forEach((p,i)=>{ if(target[i]<capEff[i]) target[i]+=over*(capEff[i]-target[i])/head; });
    }
    // ramp
    plants.forEach((p,i)=>{
      const T=PTYPES[p.ptype];
      p.target=target[i];
      p.out=clamp(p.out+clamp(target[i]-p.out,-T.rampDn*dtH,T.rampUp*dtH),0,capEff[i]);
      const h=Math.floor(hour)%24;
      if(p.lastHr!==h){ p.lastHr=h; p.ring[h]=0; }
      p.ring[h]=Math.max(p.ring[h], p.out/p.cap);
    });

    const G=plants.reduce((s,p)=>s+p.out,0);
    const servedTot=Math.min(D,G);
    const sFrac=D>0?1-servedTot/D:0;
    const genScale=G>0?servedTot/G:0;

    S.mwh+=servedTot*dtH; S.dayMWh+=servedTot*dtH;
    S.wire+=servedTot*dtH*CFG.royaltyRate*(1+S.royalty);   // base royalty + cards

    // injections (sum to zero) → flow
    const inj=new Map();
    plants.forEach(p=>inj.set(p.id,p.out*genScale));
    loads.forEach(n=>{ n.served=1-sFrac; inj.set(n.id,-demandOf(n,hour)*(1-sFrac)); });
    const fl=solveFlow([...comp],inj,S.edges);
    fl.forEach((v,k)=>allFlows.set(k,v));
  }

  /* heat, trips, patience */
  for (const e of S.edges){
    e.flow=allFlows.get(e.id)||0;
    if(!e.online){ e.flow=0; continue; }
    const r=Math.abs(e.flow)/e.cap;
    if (r>1) e.heat+=(r-1)*E.heat*dtS;
    else e.heat=Math.max(0,e.heat-CFG.heatDecay*dtS);
    if (e.heat>=1){ e.online=false; e.downUntil=S.t+CFG.tripTime*24/CFG.dayLen; e.heat=0; crackle(); toast("A line tripped — flow finds another way"); }
    e.dash-=e.flow*dtReal*1.1;
  }
  for (const n of S.nodes){
    if(n.kind!=="demand") continue;
    const age=(S.t-n.born)*CFG.dayLen/24;
    const shortfall=1-n.served;
    if (age>CFG.spawnGrace && shortfall>0.05) n.patience+=shortfall*dtS/E.patience;
    else n.patience=Math.max(0,n.patience-dtS/CFG.patienceRecover);
    if (n.patience>=1){ gameOver(n); return; }
  }
}

/* spawn machinery: the future is pre-rolled so the planner can show it */
function spawnInterval(week){ return Math.max(CFG.spawnMin, CFG.spawnStart*Math.pow(CFG.spawnShrink,week))*24/CFG.dayLen; }
function weekOf(t){ return Math.floor(t/(24*7)); }
function pickDtype(week){
  const w=spawnWeights(week), keys=Object.keys(w), tot=keys.reduce((s,k)=>s+w[k],0);
  let r=Math.random()*tot;
  for(const k of keys){ r-=w[k]; if(r<=0) return k; }
  return keys[0];
}
function clearOfWater(x,y,buf){
  for(const [ox,oy] of [[0,0],[buf,0],[-buf,0],[0,buf],[0,-buf]])
    if(inWater(x+ox,y+oy)) return false;
  return true;
}
function rollSpot(week){
  const R=170+week*45+(Math.random()<0.12?160:0);
  for(let tries=0;tries<260;tries++){
    let x,y;
    if (Math.random()<0.7 && S.nodes.length){          // grow at the edge of town
      const n=S.nodes[(Math.random()*S.nodes.length)|0];
      const a=Math.random()*Math.PI*2, d=110+Math.random()*130;
      x=n.x+Math.cos(a)*d; y=n.y+Math.sin(a)*d;
    } else {                                           // leap to the frontier
      const a=Math.random()*Math.PI*2, d=60+Math.random()*R;
      x=MAP.center.x+Math.cos(a)*d*1.15; y=MAP.center.y+Math.sin(a)*d;
    }
    if (x<40||y<40||x>MAP.w-40||y>MAP.h-40) continue;
    if (!clearOfWater(x,y,22)) continue;
    if (S.nodes.some(n=>dist(n.x,n.y,x,y)<88)) continue;
    if (S.spawnQueue.some(q=>dist(q.x,q.y,x,y)<88)) continue;
    if (S.edges.some(e=>distToPath(x,y,e.path)<38)) continue;
    return {x,y};
  }
  return null;
}
function ensureQueue(){
  let tail=S.spawnQueue.length?S.spawnQueue[S.spawnQueue.length-1].t:S.t+14*24/CFG.dayLen;
  while(tail < S.t+170){
    tail += spawnInterval(weekOf(tail));
    const spot=rollSpot(weekOf(tail));
    if(spot) S.spawnQueue.push({t:tail, dtype:pickDtype(weekOf(tail)), x:spot.x, y:spot.y});
  }
}
function materialize(q){
  let {x,y}=q;
  if (S.nodes.some(n=>dist(n.x,n.y,x,y)<60)){           // world moved on; re-roll
    const spot=rollSpot(S.week); if(!spot) return; x=spot.x; y=spot.y;
  }
  const n=addDemand(q.dtype,x,y); n.pop=0; tickSound();
}

/* ---------- sunday cards ---------- */
function cardPool(){
  const hasEdge=S.edges.length>0;
  const pool=[
    { w:3, id:"coal",  t:"Coal Works", d:PTYPES.coal.desc, ok:true },
    { w:3, id:"wire",  t:"Copper Spool", d:"+"+CFG.spoolWire+" km of wire", ok:true },
    { w:2, id:"bus",   t:"Junction", d:"A bus — bend the flow", ok:true },
    { w:2, id:"reinf", t:"Thick Line", d:"Double one line's capacity", ok:hasEdge },
    { w:2, id:"royal", t:"Copper Royalty", d:"+1 extra km of wire per 100 MWh served", ok:true },
    { w:2, id:"hydro", t:"Hydro Dam", d:PTYPES.hydro.desc, ok:S.week>=PTYPES.hydro.minWeek },
    { w:2, id:"wind",  t:"Wind Field", d:PTYPES.wind.desc, ok:S.week>=PTYPES.wind.minWeek },
  ].filter(c=>c.ok);
  const pick=()=>{ const tot=pool.reduce((s,c)=>s+c.w,0); let r=Math.random()*tot;
    for(const c of pool){ r-=c.w; if(r<=0) return c; } return pool[0]; };
  const a=pick(); let b=pick(), guard=0;
  while(b.id===a.id && guard++<20) b=pick();
  return [a,b];
}
function offerCards(){ S.cards=cardPool(); S.mode="sunday"; }
function applyCard(c){
  if(c.id==="wire") S.wire+=CFG.spoolWire;
  else if(c.id==="royal"){ S.royalty++; toast("The meters now pay extra copper"); }
  else if(c.id==="reinf") S.tray.push({kind:"reinf"});
  else if(c.id==="bus") S.tray.push({kind:"bus"});
  else S.tray.push({kind:"plant", ptype:c.id});
  S.cards=null; S.mode="play"; blip(520,.08);
}
