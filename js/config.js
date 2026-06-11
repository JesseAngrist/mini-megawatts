"use strict";
/* ============================================================
   MINI MEGAWATTS — a love letter
   coal, copper, and customers whose evenings differ.
   ============================================================ */

/* ----------------------- CFG (tune me) ---------------------- */
const CFG = {
  dayLen: 24,            // real seconds per game day at 1x  (=> 1 game-hour per second)
  speeds: [1, 3],
  startWire: 850,        // km of copper at start
  weeklyWire: 320,       // free spool every sunday (the "locomotive")
  spoolWire: 650,        // wire card value
  wireRefund: 0.7,
  edgeCap: 55,           // MW thermal limit per line
  waterMult: 3,          // wire cost multiplier over water
  tripTime: 16,          // game-seconds a line stays down after tripping
  heatDecay: 0.30,       // per game-second
  spawnStart: 46,        // game-seconds between demand spawns, week 0
  spawnShrink: 0.88,     // per week
  spawnMin: 13,
  spawnGrace: 26,        // game-seconds before a new node starts losing patience
  patienceRecover: 16,   // game-seconds to fully calm down when served
  demandGrowth: 0.04,    // +4% demand scale per week on new spawns
  royaltyRate: 0.01,     // km copper per MWh served, per royalty level (base 1 + cards)
  plannerWeek: 1,        // transmission planner arrives this sunday
  eras: [                // regulatory scrutiny tightens
    { week: 0, patience: 55, heat: 0.55, name: "Frontier" },
    { week: 3, patience: 40, heat: 0.85, name: "Franchise" },
    { week: 6, patience: 28, heat: 1.25, name: "Commission" },
  ],
};

/* ------------------- plant & demand catalogs ----------------- */
const PTYPES = {
  coal:  { cap: 100, rampUp: 20, rampDn: 28, color: "#2E2A28", minWeek: 0,
           label: "Coal Works", desc: "100 MW · Slow to stoke" },
  hydro: { cap: 65,  rampUp: 130, rampDn: 130, color: "#3D7EB0", minWeek: 5, water: true,
           label: "Hydro Dam", desc: "65 MW · Instant · Needs a river" },
  wind:  { cap: 45,  rampUp: 200, rampDn: 200, color: "#4F9E7F", minWeek: 8, variable: true,
           label: "Wind Field", desc: "45 MW · Blows when it blows" },
};
const DTYPES = {
  home:    { shape: "circle",   peak: [22, 32],
    prof: [.18,.15,.13,.12,.12,.16,.28,.42,.40,.34,.32,.32,.33,.34,.36,.42,.55,.72,.90,1,.92,.74,.50,.28] },
  factory: { shape: "square",   peak: [18, 28],
    prof: [.10,.10,.10,.10,.14,.25,.45,.65,.85,.95,1,.98,.92,.95,.98,.95,.85,.65,.40,.22,.14,.10,.10,.10] },
  transit: { shape: "triangle", peak: [24, 34],
    prof: [.06,.05,.05,.05,.08,.25,.60,.95,.80,.45,.36,.36,.38,.38,.42,.55,.80,1,.78,.48,.30,.20,.12,.07] },
  lights:  { shape: "diamond",  peak: [11, 17],
    prof: [1,1,1,.95,.90,.62,.20,0,0,0,0,0,0,0,0,0,0,.12,.45,.85,1,1,1,1] },
};
function spawnWeights(week) {
  const w = { home: .55, factory: .45 };
  if (week >= 1) w.transit = .22;
  if (week >= 2) w.lights = .14;
  return w;
}

/* -------------------------- the map -------------------------- */
/* stylized jersey, octolinear like everything else. world units ~ km. */
const MAP = {
  w: 1600, h: 1000,
  center: { x: 1070, y: 330 },           // newark-ish
  ocean: [ [1600,210],[1330,480],[1270,480],[1150,600],[1150,650],[1000,800],
           [940,800],[760,980],[740,1000],[1600,1000] ],
  rivers: [
    { pts: [[1140,0],[1140,250],[1360,470]], w: 26, name: "hudson" },
    { pts: [[600,0],[600,140],[470,270],[470,420],[380,510],[380,680],[470,770],[470,830],[610,970],[640,1000]], w: 32, name: "delaware" },
  ],
};
const TOWNS = ["Newark","Hoboken","Paterson","Camden","Trenton","Passaic","Elizabeth","Bayonne",
  "Montclair","Princeton","Hackensack","Weehawken","Perth Amboy","Asbury Park","Atlantic City",
  "Vineland","Morristown","New Brunswick","Rahway","Kearny","Secaucus","Plainfield","Summit",
  "Madison","Red Bank","Toms River","Cherry Hill","Clifton","Union City","Fort Lee","Ridgewood",
  "Teaneck","Nutley","Bloomfield","Irvington","Linden","Woodbridge","Edison","Metuchen","Millburn",
  "Cranford","Westfield","Dover","Boonton","Lodi","Garfield","Carteret","Sayreville","Freehold"];
