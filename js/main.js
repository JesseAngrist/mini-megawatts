"use strict";
/* ---------- main loop ---------- */
let last=performance.now();
function frame(now){
  const dt=Math.min((now-last)/1000,0.05); last=now;
  if(S.mode==="play"){
    let rem=dt; const step=0.025;          // fixed-ish sim substeps
    while(rem>0&&S.mode==="play"){ tick(Math.min(step,rem)); rem-=step; }
  }
  updateCamera(); draw();
  requestAnimationFrame(frame);
}
newGame();
requestAnimationFrame(frame);
