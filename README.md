# Heat Lab

An interactive heat and energy transfer lab for primary science (Years 3 to 6).
Students drag materials onto a lab bench, heat and cool them, clip on
thermometers, and watch heat energy move and change materials from solid to
liquid to gas and back.

Open `index.html` in a browser. That is the whole install: no build step, no
server, no accounts, no network calls at runtime, and nothing is saved or sent
anywhere.

## Learning Intention and Success Criteria

Shown on the start screen.

**Learning Intention:**
To explore how heat energy moves between objects and how heating and cooling
can change materials.

**Success Criteria:**

I can:
- predict what will happen when I heat or cool a material.
- explain which way heat energy moves when a hot object touches a cold one.
- describe how heating and cooling can change a solid into a liquid, or a
  liquid into a gas, and back again.

## What students can do

- **Heat and cool.** Two to four heater/cooler stations, each with a slider
  running from strong cooling through off to strong heating.
- **Drag anything anywhere.** Onto the bench, onto a station, into a
  container, or on top of something else.
- **Measure.** Four draggable thermometers snap onto any item and draw their
  own colour-matched line on the live graph.
- **Touch and stack.** A hot iron block on ice cream, a spoon in hot water,
  butter between two bricks.
- **Insulate.** Wrap a container in wool, foil, bubble wrap or a sock and
  compare how long it stays hot or cold.
- **Mix.** Drag one container onto another to pour; the final temperature
  settles between the two.
- **See inside.** Three overlays: energy chunks moving between objects, a
  live thermal camera, and a draggable particle lens.
- **Predict.** Each challenge asks for a prediction first, then shows the
  prediction beside the result with a friendly note. No scores, no failure.
- **Ten challenges.** Nothing locks; completed ones get a tick for the
  session only.

## Controls

| Action | How |
| --- | --- |
| Add something | Tap a shelf tile, or drag it onto the bench |
| Move something | Drag it |
| Put it away | Drag it off the bench |
| Heat or cool | Drag a station slider left (cold) or right (hot) |
| Read a temperature | Drag a thermometer onto anything |
| Pour and mix | Drag one container onto another |
| Wrap something | Drag a wrap onto a container, or use "No wrap" to remove it |

Keyboard: shelf tiles are buttons, so Tab and Enter add items. On the bench,
arrow keys move the selected item, `Alt`+arrows change the selection, `Enter`
drops it, `Delete` removes it, `[` and `]` drive the nearest station's slider,
`1`-`4` clip that thermometer on, and `P` pauses.

## The physics

Simplified, but it does not cheat.

- Every body stores a quantity of thermal **energy**. Temperature is derived
  from that energy, its mass and its heat capacity. Nothing sets a temperature
  directly except deliberately thermostatted things (the room at 20 °C, the
  hand at 37 °C, a heater's safety cut-out).
- Energy flows **only from hotter to colder** across every join, at a rate set
  by the temperature difference and the conductivity of both materials. Cold
  never flows.
- Objects also exchange heat slowly with the room air.
- During **melting, freezing, boiling or condensing the temperature holds
  flat** and the energy goes into the change of state. This plateau is visible
  on the graph, which is the point.
- **Energy is conserved.** The energy view shows the running totals: added by
  heaters, removed by coolers, lost to the room, and held in the objects. The
  model is checked against those totals in the test suite and the error is
  zero to machine precision.
- Boiling vapour leaves the bench and takes exactly the energy it was holding
  with it, so the temperature pins at the boiling point and the mass shrinks.

### Units

The model works in **lab energy units (EU)** rather than joules, where 1 EU is
the energy needed to raise one mass unit of liquid water by 1 °C. Heat
capacities and conductivities are therefore relative (liquid water = 1.0),
which is what the curriculum asks for and keeps the numbers small enough to
show a class.

Melting and boiling points are real, rounded values. Latent heats keep the
right order and proportion — boiling always costs more than melting — but are
compressed so an experiment finishes inside a lesson: real water needs about
80 EU to melt and 540 to boil, and this uses 80 and 220. The plateau behaviour
students must observe is unchanged.

## Adding content

Everything a teacher would want to change lives in `js/data/`.

- **`substances.js`** — substances (melting point, boiling point, relative heat
  capacity, relative conductivity, scorch point, colours per state), the shelf
  item templates, the containers and the insulation wraps. Add an entry and a
  tile appears with artwork.
- **`challenges.js`** — the challenges: goal, which items are on the shelf,
  station presets, timer, prediction question and a `check()` that watches the
  world.
- **`language.js`** — every piece of on-screen wording, in both Years 3/4 and
  Years 5/6 vocabulary, plus the Learning Intention and Success Criteria.

## Tests

```
node test/run.js
```

61 tests, no dependencies. They run the real model headlessly and check the
things the app promises students:

- heat only ever flows from hot to cold, and a transfer can never overshoot
  equilibrium even with an absurd conductance and a one-second step
- no object ends up hotter than the hottest thing that touched it
- energy balances to floating-point precision across seven scenarios,
  including boiling away, pouring, removing items and reshaping the bench
- temperature holds exactly flat at 0 °C and 100 °C, both plateaus appear on
  the thermometer trace, and a puddle refreezes
- mixing lands between the two starting temperatures and masses add
- metal beats wood, and the four containers order correctly both heating and
  cooling
- every wrap beats no wrap
- all ten challenges can be completed, and five plausible wrong approaches
  correctly do not complete them
- the same experiment gives the same answer at 60 fps and at 15 fps
- the data files are internally consistent (boiling above melting, melting
  before scorching, two portions of liquid fit every container, every string
  exists in both year levels)

## Code layout

The model, the rendering and the UI are separate; the model knows nothing
about pixels and the renderer never writes to the model.

```
index.html              structure, toolbar, panels
css/styles.css          layout and theming
js/data/                substances, containers, wraps, challenges, wording
js/model/thermo.js      energy <-> temperature, changes of state, conduction
js/model/world.js       the bench: items, stations, contacts, the step loop
js/render/art.js        procedural artwork and the heat colour scale
js/render/bench.js      the bench, stations, thermometers, overlays
js/render/particles.js  the particle lens
js/render/graph.js      the live temperature graph
js/audio/audio.js       synthesised sound (no audio files)
js/ui/shelf.js          the shelf tray and its thumbnails
js/ui/interaction.js    pointer and keyboard handling
js/ui/app.js            the clock, the toolbar, the panels, challenge state
```

Plain scripts in dependency order, sharing a single `HL` namespace — not ES
modules, because ES modules are blocked when a page is opened straight from
the filesystem, and opening `index.html` has to work.

## Performance and accessibility

- Runs at 60 fps with a full bench and every overlay on. The renderer watches
  the real frame time and, if the machine cannot keep up, drops the decorative
  heat glow and some steam while keeping the physics, thermometers, graph and
  every change of state. On a high-density screen that is struggling it also
  steps the pixel density down.
- The physics uses fixed substeps, so results are identical whatever the frame
  rate.
- Responsive from iPad portrait to a 4K interactive whiteboard. A tall screen
  gets a narrower two-station bench so everything is bigger to touch; a wide
  one gets four stations.
- Touch targets are at least 44px. Type scales up on large displays.
- The heat scale changes lightness as well as hue, and every temperature is
  always shown as a number too, so nothing depends on colour vision.
- Respects `prefers-reduced-motion`.
- Sound is synthesised, short, quiet, and has a mute button.

## Not in this version

Electricity, light, motion, solar panels or generators; accounts, saving
between sessions, teacher dashboards, multiplayer; AI features inside the app.
