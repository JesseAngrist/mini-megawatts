# AGENTS.md — Mini Megawatts

A canvas game (`index.html` + `css/` + `js/`): a love letter to Mini Metro about
running an early electric grid in 1880s New Jersey. Survival, not profit. Vanilla
JS, classic `<script>` tags, no build step, no dependencies. Keep it that way.

## The owner's non-negotiables (Jesse)

- **No money mechanic.** Resources are physical: copper (km of wire), plants, buses,
  tray items. The closest allowed thing is the copper royalty (everyone earns a base
  1 km per 100 MWh served; the "copper royalty" card adds +1 km per 100 MWh each) —
  revenue that can only buy distance. Do not introduce currency, prices, or profit
  scoring.
- **No clock UI / time micromanagement.** Time is read ambiently: the sun dial,
  node pulse at peak hours, the day/night background tint. Demand profiles are shown
  as 24h bar charts (tooltip) and shape semantics, never as schedules to manage.
- **Renewables are mid-game.** Hydro week ≥5, wind week ≥8. They are fuel-savers /
  fast-rampers, not the early game.
- **Mini Metro aesthetic discipline.** Off-white paper, bold flat shapes, Helvetica,
  octolinear (0/45/90°) geometry for EVERYTHING — wires and water alike. The network
  must never look like a "lame web"; 45° doglegs with rounded corners are the look.
- **Simplicity over complexity. Completion over features.** If a mechanic needs a
  paragraph to explain, it's wrong. Prefer editing existing files over creating new ones.

## Core design decisions (and why)

### Power flow: real DC flow, one sentence of rules
"Electricity takes every path at once; shorter paths take more." Implemented as DC
power flow with susceptance = 100/length (uniform impedance per km). This is the
fun middle ground Jesse asked for — it produces loop flow and Braess-style surprises
(a new line can overload a line elsewhere) without any OPF machinery. Buses are the
player's creative tool because path *length is impedance*: routing is electrical.

Verified invariants (keep tests passing):
- Triangle (equal lengths), 90 MW A→B: direct line carries 60, two-hop path 30 (2:1).
- Adding a half-length shortcut A–B pulls flow off both old routes.

### Dispatch: automatic, proximity-weighted, forecasted
Players place and wire; they never operate plants (you don't drive the trains in
Mini Metro). Per island:
1. Each load's demand is split across plants ∝ 1/(electrical distance + 60)².
2. **Targets use a 90-minute lookahead**: `max(demand(now), demand(now+1.5h))`.
   This is load forecasting, and it is load-bearing — see "the inverted incentive"
   below. It also yields free spinning reserve.
3. Capacity-aware redistribution (3 passes), then ramp-limited pursuit of target.
4. Shortfall is spread uniformly across the island's loads; injections are scaled
   so they sum to zero before the flow solve.

### The Insull mechanic (the point of the game)
Capacity scarcity + demand diversity, no money needed. Headless balance results
that MUST stay roughly true after any tuning change (one coal plant, cap 100,
ramp 20, lookahead 1.5h):

| portfolio                 | worst shortfall | load factor |
|---------------------------|-----------------|-------------|
| 3 homes                   | 0%              | ~35%        |
| 5 homes (greedy)          | ~29%            | ~54%        |
| 3 homes + 2 factories     | 0%              | ~59%        |
| 2h + 2f + streetlights    | 0%              | ~54%        |

Diversity lets the same iron serve ~70% more energy. The plant's 24-bar dial makes
this legible: gaps in the dial = free customers; each demand shape pulses at its own
peak so the player matches gaps to pulses by eye.

**The inverted incentive (cautionary tale):** the first factory profile had a cliff
morning ramp (0.08→0.95 in ~3h) that coal couldn't climb, making *mixing worse than
homogeneous load* — the exact opposite of the intended lesson. Fixed by softening
profile cliffs AND adding the dispatch lookahead. If you touch profiles, ramp rates,
or lookahead, re-run the balance harness (below) and confirm diversity still wins.

### Demand semiotics
circle=home (evening peak) · square=factory (daytime block) · triangle=transit
(twin rush peaks) · diamond=streetlights (nocturnal — the ring-completing gift).
New types: add to `DTYPES` with a 24-value profile; soften any rise steeper than
~0.2/hour×peak or coal will fail it.

### Failure & pressure
- Patience: an unserved node fills a red arc; ANY node reaching full = game over
  (Mini Metro faithful). Era progression tightens patience (55→40→28s) and heat gain.
- Lines accumulate heat when |flow|>cap, trip for ~16s, auto-reclose. Trips re-solve
  flow → cascades are emergent and intended.
- Night poetry: served nodes glow warm at night; brownouts flicker the glow. Don't
  remove this; it's the emotional readout of the whole sim.

### Spawning is pre-rolled (the planner depends on it)
`S.spawnQueue` holds ~7 days of future spawns (time, type, position). The
"transmission planner" (auto-granted week 1) renders queued spawns as dashed ghosts
with day countdowns — **only while paused**, deliberately making pause the planning
room. Spot roller constraints: ≥88 from nodes/queued spawns, ≥38 from any line path,
≥22 dry margin from water (5-point check), 70% of spawns bud near existing nodes.

### Sunday ritual
Auto-grant +320 km copper, then pick 1 of 2 cards: coal / wire spool (650) / bus /
reinforce (2× one line) / copper royalty (+1 km per 100 MWh on top of the base
royalty, stackable) / hydro (wk5, must touch a river) / wind (wk8, smooth-noise
availability). New resources = one
entry in `PTYPES` + one card; dispatch and rendering are data-driven.

## Technical map

Classic scripts loaded in order by `index.html`; they share one global scope (no
modules, no build). Load order matters only for load-time code: `render.js` grabs
the canvas, `input.js` attaches listeners to it, `main.js` starts the loop last.
1. `js/config.js` — `CFG` (all tuning knobs, commented — touch numbers here first),
   `PTYPES`, `DTYPES`, `spawnWeights`, `MAP`, `TOWNS`.
2. `js/logic.js` — pure math (**exported via `module.exports` for node testing**):
   `gauss`, `solveFlow`, `components`, `octoPath`, `pathLen`, `profileAt`,
   `shortestDist`. Keep new pure math here, exported. Also holds the geometry
   helpers (`inWater`, `wireCost`, …) that lean on `MAP`/`CFG` — browser-only,
   not exported.
3. `js/state.js` — `S`, `newGame`, node/edge constructors, `toast`, `gameOver`.
4. `js/sim.js` — `tick()`, dispatch, spawn machinery, sunday cards.
5. `js/render.js` — canvas, `COL`, camera, all `draw*`.
6. `js/input.js` — pointer/keyboard handlers, hit-testing, `removeEdge`.
7. `js/audio.js` — the tiny oscillator kit.
8. `js/main.js` — frame loop, kicks off `newGame()`.
9. `css/style.css` — the three rules that used to be the `<style>` block.

### Units gotcha (read twice)
`S.t` is in **game-hours**. With `CFG.dayLen = 24` (real seconds per day), 1 real
second = 1 game-hour, so "game-seconds" (`dtS`) and game-hours (`dtH`) are
numerically equal and it's easy to write a bug that only appears if `dayLen`
changes. All conversions go through `*24/CFG.dayLen`; preserve that factor.
Patience/heat/trip times are tuned in real-seconds-at-1x; ramps in MW per game-hour.

### Testing workflow (do this before shipping any change)
```bash
for f in js/*.js; do node --check "$f"; done   # syntax
node -e "…require('./js/logic.js')…"           # invariants (loads standalone)
```
Re-verify: (a) triangle flow 60/30, (b) the Insull table above via a 48h portfolio
sim using `profileAt` (judge day 2 so ramp transients settle), (c) if map edited:
every ocean/river segment satisfies |dx|==|dy| or dx==0 or dy==0, and the spawn
center is on land. The rendered game can't be tested headlessly — after visual
changes, tell Jesse exactly what to look at.

### Rendering conventions
- World↔screen via `w2s`/`s2w`; camera auto-fits node bbox (no manual pan/zoom).
- All colors from `COL`/`DCOL`; day/night via `mixHex(paper, night, nightFactor)`.
- Flow = animated white dashes over the line; line color lerps ink→amber→red with
  load ratio. Plant dial: 24 radial **butt-capped** bars (max length 10·scale) on a
  base circle r=24·scale; "now" is an ink dot orbiting inside the circle.
- Octolinear water: stroked polylines (rivers) + filled polygon (ocean), vertices
  hand-authored at legal angles. Hudson must terminate inside the ocean polygon.

### Known soft spots / future hooks
- Performance: per-tick Dijkstra + dense Gaussian solve is fine to ~120 nodes;
  beyond that, throttle dispatch to every Nth substep or cache `shortestDist`
  between topology changes.
- Wire balance: if copper binds again, raise `weeklyWire` before `startWire`
  (early scarcity teaches trunk-and-tap building).
- Planned-but-unbuilt: more maps (`MAP` is one object — add and select), solar +
  storage (storage needs a state-of-charge field and a charge/discharge rule in
  dispatch; keep it one knob), scoring screen polish.
- The brownout allocation is uniform per island; "farthest nodes brown out first"
  was considered and rejected for v1 complexity. Revisit only with a one-line rule.

## Voice
UI copy is normally capitalized, wry, brief ("The lights went out in Hoboken.").
Toasts teach without tutorials. If a feature needs explaining, redesign it until
it doesn't.

## Controls
Space cycles pause → 1× → 3× (state shown top-left). M mutes. R restarts after
game over. Delete/Escape act on a selected line. There is no separate fast key.
