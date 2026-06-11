"use strict";
/* ---------- audio (tiny) ---------- */
let AC=null;
function audioOn(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } }
function tone(f,d,type,g){
  if(!AC||S.muted) return;
  const o=AC.createOscillator(),v=AC.createGain();
  o.type=type||"sine"; o.frequency.value=f;
  v.gain.setValueAtTime(g||0.08,AC.currentTime);
  v.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+d);
  o.connect(v); v.connect(AC.destination); o.start(); o.stop(AC.currentTime+d);
}
function blip(f,d){ tone(f,d,"sine",0.07); }
function tickSound(){ tone(880,.05,"sine",0.04); }
function crackle(){ tone(110,.18,"square",0.06); }
function thud(){ tone(140,.12,"sine",0.08); }
function chime(){ tone(523,.12,"sine",0.06); setTimeout(()=>tone(784,.18,"sine",0.06),110); }
function sadHorn(){ tone(330,.3,"sine",0.08); setTimeout(()=>tone(262,.5,"sine",0.08),250); }
