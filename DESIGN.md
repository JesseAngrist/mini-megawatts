# DESIGN.md — Mini Megawatts, Long-Term Plans

First-pass thinking, deliberately shallow. Each section ends with open questions
rather than commitments. Companion to AGENTS.md (which records what *is*); this
records what *might be*.

---

## A) Emergent Gameplay

### A.1 Challenges we want the player to organically encounter

The game's soul is "physics does something you didn't ask for." Candidate encounters,
roughly in the order a player should meet them:

1. **The parallel-path surprise.** Your new line didn't just add capacity — it
   *re-routed* flow everywhere, possibly overloading a line you weren't looking at
   (Braess-style). First taste should arrive the first time a player builds a loop,
   ~week 1–2.
2. **The diversity dividend (the Insull mechanic).** Five homes melt one coal plant;
   three homes plus two factories purr. The player discovers that *who* you connect
   matters more than *how many*. This is the core lesson; everything else orbits it.
3. **The ramp trap.** Coal can't climb a morning cliff. Forecast-driven dispatch
   hides this most of the time — the visible failure is "the factory browned out at
   7am even though the plant had spare capacity at 6am." Mid-game, this motivates
   hydro (the fast-ramper) as a *relief*, not a chore.
4. **The cascade.** One trip re-routes flow, overloads a neighbor, trips it too.
   Cascades should feel like weather: survivable if your network has slack,
   catastrophic if you built a taut web.
5. **Islanding as strategy.** Splitting the network into deliberate islands (or
   *not* interconnecting) is a real choice: interconnection shares reserve but also
   shares failure. Late mid-game tension.

**Shaping the middle game:** these encounters are mostly governed by spawn weights,
era pressure, and the card pool. Levers worth tuning rather than new mechanics:
spawn the first "wrong-shape" cluster (e.g. three homes in a corner) deliberately;
let the planner's ghost preview make the trap *visible but not labeled*; time the
hydro card to arrive roughly when the ramp trap has bitten once.

### A.2 Puzzling-yet-understandable difficulty (vs. obscure and frustrating)

Principle: **every failure must be visually traceable to a cause within one screen
and ten seconds.** The game already does this well — heat is a color ramp, patience
is an arc, brownouts flicker. Rules to keep us honest:

- No hidden state that kills. Anything that can end the game (patience) or break
  the network (heat) is continuously rendered, not revealed at failure time.
- Failures should be *previewable in principle*: a player who pauses and stares
  should be able to predict the next problem. The pre-rolled spawn queue is the
  template — perfect information, behind a pause.
- One-sentence rules only. "Shorter paths take more." "Lines overheat above their
  cap." "Unhappy towns end you." If a new mechanic needs a second sentence, redesign.
- Difficulty should come from *interaction* of simple rules (flow × ramps × shapes),
  never from rule complexity or RNG spikes. The pre-rolled queue means bad luck is
  knowable in advance; keep it that way.
- Losses should teach. The game-over screen already names the town and the load
  factor; it could go one step further (see A.3, "post-mortem").

### A.3 In-game tools for understanding flow (without UI bloat)

Candidates, ordered by value-per-pixel; all read-only, all live in existing
surfaces (pause, hover, drag):

1. **Ghost-flow preview while stringing wire.** While dragging a new line, tint
   existing lines by *predicted* loading change (slightly warmer / cooler). This is
   the single highest-value tool: it teaches loop flow at the exact moment of
   decision, with zero new chrome. Computationally cheap (one extra solve per frame
   while dragging, network is small).
2. **Cut preview.** Same idea when hovering a line's delete handle: show where its
   flow would go. Teaches redundancy.
3. **Demand-coincidence hint on plant hover.** The plant dial already shows its
   24-hour history; on hover, faintly overlay the *summed demand profile* of its
   customers. Gaps in the dial = room for the right new customer shape.
4. **Post-mortem freeze-frame.** On game over, before the stats, show the final
   network with the fatal sequence ghosted (which line tripped first, where flow
   went). One frame, no scrubbing.
5. **Pause-time flow numbers.** While paused, optionally label each line with MW /
   cap. Pause is already the planning room; numbers belong there and only there.

Anti-tools (rejected on sight): graphs over time, an inspector panel, a tutorial,
any mode switcher. The sun dial discipline applies: information lives in the
objects themselves.

---

## B) Dispatch and Power Flow

### B.1 What we use now, and why

**Power flow: DC (linearized) power flow**, uniform impedance per km (susceptance
= 100/length), one slack node per island, dense Gaussian elimination, re-solved
every substep.

- *Computationally:* a single linear solve, O(n³) on a dense matrix, trivial at
  game scale (fine to ~120 nodes per AGENTS.md; PTDF caching or sparse solves are
  the escape hatch, not a model change). Deterministic, no convergence failures,
  no tuning.
- *Gameplay:* it is the cheapest model that produces **loop flow** — the one
  phenomenon that makes wires interesting. Path length is impedance, so *routing
  is electrical*: buses and doglegs are creative tools, not decoration. And it
  compresses to one sentence: "electricity takes every path at once; shorter paths
  take more."

**Dispatch: automatic, proximity-weighted, forecasted.** Demand splits across
plants ∝ 1/(electrical distance + 60)²; targets use a 90-minute lookahead;
capacity-aware redistribution; ramp-limited pursuit. Players never operate plants
(Mini Metro: you don't drive the trains). The lookahead is load-bearing — without
it, slow coal makes demand diversity a *liability* (the inverted incentive,
AGENTS.md).

### B.2 Alternatives

| Model | Computational | Gameplay | Thematic |
|---|---|---|---|
| **Transport / max-flow** ("wires are pipes") | Trivial | Kills loop flow; player routes flow directly, network becomes plumbing | Wrong physics, wrong era lesson |
| **DC flow (current)** | Linear solve, fast, robust | Loop flow, Braess surprises, one-sentence rule | "Relaxed AC" — honest enough |
| **AC power flow** (Newton-Raphson) | Iterative, can fail to converge, needs voltage/reactive modeling | Voltage collapse & reactive power are invisible-to-the-eye failure modes — obscure, not puzzling | Most honest, least legible |
| **DC-OPF / economic dispatch** | Needs an LP solver | Introduces costs/prices → violates the no-money rule; also takes dispatch *away* from physics intuition | Anachronistic for 1882 anyway |
| **Frequency/inertia dynamics** | ODE integration, stiff | Sub-second timescale fights the ambient-time philosophy | Real, but the wrong zoom level |

First-pass position: **DC flow is the keeper.** The interesting future work is not
a better solver but *selective leaks from the AC world as one-knob mechanics* —
e.g., very long lines could carry less than nominal cap (a whisper of voltage
drop / stability limits), expressed as a single per-line derating, no new physics
exposed. Each leak must pass the one-sentence test.

Dispatch alternatives worth a thought: player-set plant priorities (rejected: it's
driving the trains); per-plant "stoke early" toggle (maybe — it's one bit, and it
externalizes the lookahead the dispatcher already does); storage as a dispatch
participant (planned; needs exactly one rule, e.g. "charges when there's slack,
discharges on shortfall").

### B.3 How much must the player understand?

Target: **intuition all the way down, with the model never lying to intuition.**

- A new player should succeed with pure geometry sense: short direct lines, don't
  overload, spread things out.
- An improving player notices patterns ("loops help… usually"), and the tools in
  A.3 let them test hunches without equations.
- An expert effectively *knows* DC flow without the name — they pre-hear where
  flow will go. Mastery is internalized physics, like Mini Metro mastery is
  internalized queueing theory. No one should ever need numbers to win; numbers
  (pause-time labels) exist to confirm intuition, not substitute for it.

The contract: the game never punishes a correct intuition because of model
internals. If players keep being surprised by something the visuals can't explain,
that's a rendering bug, not a player-education problem.

---

## C) Historical Content

### C.1 How did real early grids actually balance supply and demand?

Short answer: by hand, by gauge, and by keeping systems tiny.

- **Isolated plants, small radii.** Edison's Pearl Street (1882) was DC serving
  roughly a square mile. "Balancing" meant one plant following its own neighborhood.
  No interconnection, no loop flow — every system was an island. (Our per-island
  dispatch is more historical than it looks.)
- **Human dispatchers.** Operators in the plant watched voltage (later frequency)
  gauges and hand-throttled steam engines. Load forecasting was literal: you knew
  dusk was coming, you stoked boilers ahead of it. Our 90-minute lookahead is a
  faithful cartoon of this.
- **Batteries were real and early.** DC systems used lead-acid storage batteries to
  carry light night loads (letting engines shut down) and to shave evening peaks.
  This is a gift: the planned storage mechanic has period-correct ancestry in the
  1880s–90s, not a renewables-era anachronism.
- **The load-factor hunt.** Lighting load was brutally peaky (an evening spike, then
  nothing). Utilities aggressively recruited *daytime* load — streetcars, motors,
  ice plants — to flatten the curve. Insull built an empire on demand diversity and
  two-part tariffs. This is already the heart of the game; history validates the
  core loop.
- **Standardization came late.** Frequencies (25 vs 60 Hz), voltages, and AC vs DC
  coexisted for decades; interconnection of utilities is largely a 1910s–30s story.

### C.2 What's fun to adopt vs. frustrating

Fun (passes the one-sentence test):
- **Storage batteries** — period-correct, one state-of-charge knob, mid-game card.
- **The daytime-load hunt** — already in (demand shapes); could be sharpened by
  occasional "recruitable" industrial spawns (a factory ghost that only materializes
  if you reach it — you *court* load, as Insull did).
- **Era pressure as regulation** — already in (franchise → commission); historically
  the arc from open frontier to regulated monopoly.
- **Plant obsolescence as upgrade, not decay** (see C.4): new plants are simply much
  better, making old iron *relatively* small — growth-as-pressure, no fiddly decay.

Frustrating (fails the test, or micromanagement):
- Voltage drop bookkeeping, AC/DC conversion losses, rotary converters as objects.
- Frequency-keeping minigames; anything sub-minute.
- Fuel logistics (coal trains). Tempting thematically, but it's a second economy.
- Billing, tariffs, franchise negotiations as interactive systems — money by the
  back door.

### C.3 Which historical dynamics matter most

Ranked, with feasibility inside the "mini" loop:

1. **Diversity → load factor → survival** (Insull). Already the game. Keep it the
   dominant axis forever.
2. **Forecast-and-stoke operation.** Already embedded in dispatch; the player feels
   it through ramp behavior. No UI needed.
3. **Growth outrunning equipment.** Demand doubled every few years; plant lifetimes
   were economically short. Maps onto era/demand-growth knobs we have.
4. **Isolation → interconnection.** The decision to tie islands together (shared
   reserve vs. shared failure) is both historical and emergent in current mechanics.
   Possibly worth a gentle nudge (a card? a map feature?) but not a new system.
5. **The AC transition** (transformers → distance). The biggest story we *don't*
   tell. A possible late-game era or separate map ("1895: Niagara") where line
   length costs change character. Big design risk; park it.

The "mini" constraint: each of these must surface through existing objects (nodes,
lines, cards, eras) — never through new screens.

### C.4 The sunk-cost question (illustrative deep-dive)

How sunk was 1880s grid infrastructure, really?

- **Copper was never sunk.** Scrap copper held substantial value; overhead lines
  were routinely re-strung, upsized, and salvaged. Underground mains (Edison's
  tube system) were far stickier — digging up streets was the expensive part, the
  metal still recoverable.
- **Generation was sunk but short-lived anyway.** The striking historical fact is
  not demolition but *obsolescence*: growth and technical progress were so fast
  that plants were superseded within a decade (Insull famously scrapped relatively
  new engines to install bigger turbines). Networks were *built over*, layered,
  upgraded in place — rarely torn down to bare ground and rarely relocated.

Gameplay reading: the current design is accidentally quite faithful —
- the 70% wire refund ≈ scrap value of copper minus the cost of the streets;
- plants being permanent ≈ sunk generation;
- relentless demand growth ≈ why nobody in 1890 was "rebuilding from scratch" —
  there was no breathing room to.

Can the game survive *fully free* rewiring? Probably yes mechanically (spawn
pressure means wire-shuffling has an attention cost even at 100% refund), but it
would dissolve the *commitment* feeling that makes trunk planning matter, and
history doesn't ask for it. First-pass position: keep refund as the single knob
(0.7 now); if we ever want a "harsher realism" mode, lower refund and make plants
*cards-back-on-death* rather than movable. Do not add per-object depreciation.

---

## D) Expansion Surface & Open Questions

### D.1 Near-term (aligned with AGENTS.md hooks)
- **More maps.** `MAP` is one object; add and select. Each map = one geographic
  thesis (a river delta that forces water crossings; a long coastline that forces
  trunk-and-tap).
- **Solar + storage.** Storage first (period-correct, see C.1); solar belongs to a
  hypothetical later-era map, not 1882 New Jersey.
- **Scoring screen polish.** Post-mortem freeze-frame (A.3) folds in here.

### D.2 Medium-term candidates (each needs a one-sentence rule before build)
- Ghost-flow preview while dragging (A.3 #1) — likely the next feature, full stop.
- Recruitable industrial load (C.2) — courting demand as a verb.
- "Stoke early" plant toggle (B.2) — one bit of player agency in dispatch; decide
  whether it violates "you don't drive the trains."
- Daily/seeded runs — the pre-rolled spawn queue makes seeded competition nearly free.

### D.3 Open questions
1. Is the brownout allocation staying uniform per island, or do we ever find the
   one-line rule for "farthest browns out first"? (Rejected once; revisit only
   with a one-liner.)
2. Does interconnection need a nudge, or do players discover island strategy
   unaided? Watch playtests before adding anything.
3. Where does the AC transition live — late era, separate map, or nowhere?
4. What's the failure-rate budget per session? (How often *should* a decent player
   see a cascade? Tune eras to that number, not vice versa.)
5. Does the win condition stay "survive as long as possible," or does a map ever
   "complete" (Mini Metro's daily challenge vs. endless)?
