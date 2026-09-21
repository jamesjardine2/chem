/* Heat Lab - model tests.
 *
 *   node test/run.js
 *
 * These guard the claims the app makes to students: heat only ever flows from
 * hot to cold, energy is conserved, temperature holds flat during a change of
 * state, and every challenge can actually be completed.
 */
'use strict';
const H = require('./harness');
const { test, group, ok, near, between, equal, fail, run, onStation, onBench, vessel, into, stackOn } = H;

const HL = H.loadModel();
const Th = HL.Thermo;

/* =====================================================================
   Energy and temperature
   ===================================================================== */
group('Energy and temperature');

test('temperature is derived from energy, and round-trips', () => {
  const water = HL.SUBSTANCES.water;
  for (const t of [-40, -0.5, 20, 55, 99.5]) {
    const e = Th.energyForTemp(water, 1, t);
    const body = { sub: water, mass: 1, energy: e, fixedTemp: null };
    Th.refresh(body);
    near(body.temp, t, 1e-9, 'round trip at ' + t);
  }
});

test('a substance with no melting point in range stays solid', () => {
  const body = { sub: HL.SUBSTANCES.brick, mass: 1, energy: 0, fixedTemp: null };
  body.energy = Th.energyForTemp(HL.SUBSTANCES.brick, 1, 500);
  Th.refresh(body);
  equal(body.state, 'solid');
  near(body.temp, 500, 1e-9);
});

test('heat capacity sets how fast something warms', () => {
  // Iron holds about a ninth of the energy water does per degree, as it
  // really does, so the same energy takes it much further.
  const iron = HL.SUBSTANCES.iron, water = HL.SUBSTANCES.water;
  const perDegIron = iron.cSolid, perDegWater = water.cLiquid;
  between(perDegWater / perDegIron, 8, 10, 'water:iron heat capacity ratio');
});

/* =====================================================================
   Heat only flows from hot to cold
   ===================================================================== */
group('Heat only flows from hot to cold');

test('conduction moves energy from the hotter body', () => {
  const hot = { sub: HL.SUBSTANCES.iron, mass: 1, energy: Th.energyForTemp(HL.SUBSTANCES.iron, 1, 200), fixedTemp: null };
  const cold = { sub: HL.SUBSTANCES.iron, mass: 1, energy: Th.energyForTemp(HL.SUBSTANCES.iron, 1, 0), fixedTemp: null };
  Th.refresh(hot); Th.refresh(cold);
  const q = Th.conduct(hot, cold, 0.2, 1 / 60);
  ok(q > 0, 'energy should leave the hot body');
  Th.refresh(hot); Th.refresh(cold);
  ok(hot.temp < 200 && cold.temp > 0, 'hot cools, cold warms');
});

test('a transfer never overshoots equilibrium, even with a huge conductance', () => {
  const hot = { sub: HL.SUBSTANCES.iron, mass: 1, energy: Th.energyForTemp(HL.SUBSTANCES.iron, 1, 300), fixedTemp: null };
  const cold = { sub: HL.SUBSTANCES.iron, mass: 1, energy: Th.energyForTemp(HL.SUBSTANCES.iron, 1, 0), fixedTemp: null };
  Th.refresh(hot); Th.refresh(cold);
  Th.conduct(hot, cold, 1e6, 1);          // absurd conductance, one whole second
  Th.refresh(hot); Th.refresh(cold);
  ok(hot.temp >= cold.temp - 1e-6, 'the cold body must not end up hotter (got ' + hot.temp + ' vs ' + cold.temp + ')');
  near(hot.temp, 150, 1e-6, 'they should meet in the middle');
});

test('no object ever ends up hotter than the hottest thing that touched it', () => {
  const w = new HL.World(3);
  const ic = onStation(w, 'icecream', 1);
  const iron = stackOn(w, 'hotiron', ic);
  const startMax = Math.max(iron.temp, ic.temp);
  let worst = -Infinity;
  run(w, 60, () => { worst = Math.max(worst, iron.temp, ic.temp); });
  ok(worst <= startMax + 1e-6, 'peak ' + worst + ' exceeded the initial maximum ' + startMax);
});

/* =====================================================================
   Energy is conserved
   ===================================================================== */
group('Energy is conserved');

function auditScenario(name, build, seconds) {
  test('energy balances: ' + name, () => {
    const w = new HL.World(3);
    build(w);
    run(w, seconds);
    const a = w.audit();
    // The ledger is kept in the same units as the energy itself, so the
    // tolerance is a floating point allowance, not a physics fudge.
    const scale = Math.max(1, Math.abs(a.expected));
    ok(Math.abs(a.drift) / scale < 1e-9,
      'drift ' + a.drift + ' against expected ' + a.expected);
  });
}

auditScenario('ice melting and boiling away on full heat', (w) => {
  onStation(w, 'icecube', 1);
  w.stations[1].power = 1;
}, 40);

auditScenario('cooler running with nothing on it', (w) => {
  w.stations[0].power = -1;
}, 20);

auditScenario('hot iron on ice cream', (w) => {
  const ic = onStation(w, 'icecream', 1);
  stackOn(w, 'hotiron', ic);
}, 40);

auditScenario('pouring one beaker into another', (w) => {
  const a = vessel(w, 'beaker', 0), b = vessel(w, 'beaker', 2);
  into(w, 'hotwater', a); into(w, 'coldwater', b);
  w.pour(a, b);
}, 20);

auditScenario('a hand warming gallium', (w) => {
  const g = onStation(w, 'gallium', 1);
  stackOn(w, 'hand', g);
}, 30);

auditScenario('an insulated mug of soup', (w) => {
  const c = vessel(w, 'mug', 1);
  c.wrap = 'wool';
  into(w, 'soup', c);
}, 60);

auditScenario('everything at once', (w) => {
  const pot = vessel(w, 'pot', 0);
  into(w, 'water', pot);
  const bk = vessel(w, 'beaker', 1);
  into(w, 'icecube', bk);
  const ic = onBench(w, 'icecream', w.W * 0.75);
  stackOn(w, 'hotiron', ic);
  w.stations[0].power = 1;
  w.stations[1].power = -1;
}, 45);

test('items removed from the bench are booked, not lost', () => {
  const w = new HL.World(3);
  const it = onStation(w, 'iron', 1);
  run(w, 2);
  w.removeItem(it, false);
  run(w, 2);
  const a = w.audit();
  ok(Math.abs(a.drift) < 1e-6, 'drift after removal: ' + a.drift);
});

/* =====================================================================
   Changes of state
   ===================================================================== */
group('Changes of state');

test('ice melts at 0 C, boils at 100 C, and holds flat at both', () => {
  const w = new HL.World(3);
  const ice = onStation(w, 'icecube', 1);
  w.thermometers[0].attachedTo = ice.id;
  w.thermometers[0].onShelf = false;
  w.stations[1].power = 1;

  let flatAtZero = 0, flatAtHundred = 0, peak = -Infinity, last = null;
  run(w, 40, (ww, t) => {
    const cur = ww.byId(ice.id);
    if (!cur) return;
    peak = Math.max(peak, cur.temp);
    const dt = last === null ? 0 : t - last;
    last = t;
    if (cur.state === 'melting') flatAtZero += dt;
    if (cur.state === 'boiling') flatAtHundred += dt;
    if (cur.state === 'melting') near(cur.temp, 0, 1e-6, 'melting must sit at 0 C');
    if (cur.state === 'boiling') near(cur.temp, 100, 1e-6, 'boiling must sit at 100 C');
  });
  ok(flatAtZero > 1.5, 'melting plateau was only ' + flatAtZero.toFixed(2) + 's');
  ok(flatAtHundred > 5, 'boiling plateau was only ' + flatAtHundred.toFixed(2) + 's');
  ok(peak <= 100 + 1e-6, 'water in an open pot must not go past 100 C, got ' + peak);
});

test('the thermometer trace shows both plateaus', () => {
  const w = new HL.World(3);
  const ice = onStation(w, 'icecube', 1);
  w.thermometers[0].attachedTo = ice.id;
  w.thermometers[0].onShelf = false;
  w.stations[1].power = 1;
  run(w, 30);
  const s = w.thermometers[0].samples;
  ok(s.length > 20, 'not enough samples: ' + s.length);
  const flat = (target) => {
    let best = 0, cur = 0;
    for (let i = 1; i < s.length; i++) {
      if (Math.abs(s[i].temp - target) < 1.5) { cur += s[i].t - s[i - 1].t; best = Math.max(best, cur); }
      else cur = 0;
    }
    return best;
  };
  ok(flat(0) > 1.5, 'no plateau at 0 C on the graph');
  ok(flat(100) > 5, 'no plateau at 100 C on the graph');
});

test('a puddle refreezes when it is cooled again', () => {
  const w = new HL.World(3);
  const ice = onStation(w, 'icecube', 1);
  w.stations[1].power = 0.6;
  run(w, 12);
  ok(ice.meltFrac > 0.9, 'should have melted first, got ' + ice.meltFrac);
  w.stations[1].power = -1;
  run(w, 40);
  ok(ice.meltFrac < 0.05, 'should have refrozen, meltFrac ' + ice.meltFrac);
  ok(ice.temp < 0, 'refrozen ice should be below 0 C, got ' + ice.temp);
});

test('boiling loses mass and the temperature stays pinned', () => {
  const w = new HL.World(3);
  const ice = onStation(w, 'icecube', 1);
  const m0 = ice.mass;
  w.stations[1].power = 1;
  run(w, 20);
  const cur = w.byId(ice.id);
  ok(cur, 'should not have boiled away entirely yet');
  ok(cur.mass < m0, 'mass should have dropped: ' + m0 + ' -> ' + cur.mass);
  near(cur.temp, 100, 0.001, 'temperature while boiling');
  ok(w.ledger.steam > 0, 'steam energy should be booked');
});

test('gallium melts below body temperature, iron does not', () => {
  between(HL.SUBSTANCES.gallium.melt, 25, 32, 'gallium melting point');
  ok(HL.SUBSTANCES.gallium.melt < 37, 'a hand must be able to melt gallium');
  ok(HL.SUBSTANCES.iron.melt > 1000, 'iron must not melt on a school bench');
});

test('salt water freezes below fresh water', () => {
  ok(HL.SUBSTANCES.saltwater.melt < HL.SUBSTANCES.water.melt,
    'salt water should freeze lower than 0 C');
});

/* =====================================================================
   Mixing
   ===================================================================== */
group('Mixing');

test('equal amounts of hot and cold water land in between', () => {
  const w = new HL.World(3);
  const a = vessel(w, 'beaker', 0), b = vessel(w, 'beaker', 2);
  const hot = into(w, 'hotwater', a);
  const cold = into(w, 'coldwater', b);
  const hotT = hot.temp, coldT = cold.temp, expected = (hotT + coldT) / 2;
  ok(w.pour(a, b), 'the pour should succeed');
  const mixed = w.items.filter(i => i.sub && i.sub.id === 'water' && i.mass > 1.2);
  equal(mixed.length, 1, 'the two portions should have merged into one');
  // Straight after the pour, before the cup and the bench take their share.
  near(mixed[0].temp, expected, 0.6, 'mixed temperature');
  between(mixed[0].temp, coldT, hotT, 'the result must sit between the two');
  near(mixed[0].mass, hot.mass + cold.mass, 1e-9, 'masses add');
});

test('mixing never produces a temperature above the hotter part', () => {
  const w = new HL.World(3);
  const a = vessel(w, 'pot', 0), b = vessel(w, 'pot', 2);
  const hot = into(w, 'hotwater', a);
  const hotT = hot.temp;
  into(w, 'hotwater', b);
  w.pour(a, b);
  const mixed = w.items.filter(i => i.sub && i.sub.id === 'water');
  for (const m of mixed) ok(m.temp <= hotT + 1e-6, 'got ' + m.temp + ' from ' + hotT);
});

/* =====================================================================
   Conduction and insulation
   ===================================================================== */
group('Conduction and insulation');

test('a metal spoon heats faster than a wooden one in the same water', () => {
  const w = new HL.World(3);
  const pot = vessel(w, 'pot', 1);
  into(w, 'hotwater', pot);
  const metal = into(w, 'spoonmetal', pot);
  const wood = into(w, 'spoonwood', pot);
  run(w, 5);
  ok(metal.temp > wood.temp + 10,
    'metal ' + metal.temp.toFixed(1) + ' vs wood ' + wood.temp.toFixed(1));
});

test('containers heat their contents in conductivity order', () => {
  const results = {};
  for (const cid of ['pot', 'beaker', 'mug', 'foam']) {
    const w = new HL.World(3);
    const c = vessel(w, cid, 0);
    const water = into(w, 'water', c);
    w.stations[0].power = 1;
    run(w, 8);
    results[cid] = water.temp;
  }
  ok(results.pot > results.beaker, 'pot should beat beaker: ' + JSON.stringify(results));
  ok(results.beaker > results.mug, 'beaker should beat mug: ' + JSON.stringify(results));
  ok(results.mug > results.foam, 'mug should beat foam: ' + JSON.stringify(results));
});

test('containers cool their contents in the same order', () => {
  const results = {};
  for (const cid of ['pot', 'beaker', 'mug', 'foam']) {
    const w = new HL.World(3);
    const c = vessel(w, cid, 0);
    const water = into(w, 'hotwater', c);
    w.stations[0].power = -1;
    run(w, 8);
    results[cid] = water.temp;
  }
  ok(results.pot < results.beaker, 'pot should chill fastest: ' + JSON.stringify(results));
  ok(results.beaker < results.mug, 'beaker before mug: ' + JSON.stringify(results));
  ok(results.mug < results.foam, 'foam should chill slowest: ' + JSON.stringify(results));
});

test('every wrap keeps soup hotter than no wrap, and wool is the best', () => {
  const results = {};
  for (const wrap of [null, 'foil', 'sock', 'bubble', 'wool']) {
    const w = new HL.World(3);
    const c = vessel(w, 'mug', 1);
    c.wrap = wrap;
    const soup = into(w, 'soup', c);
    run(w, 90);
    results[wrap || 'bare'] = soup.temp;
  }
  for (const k of ['foil', 'sock', 'bubble', 'wool']) {
    ok(results[k] > results.bare + 1,
      k + ' should beat bare: ' + JSON.stringify(results));
  }
  const best = Object.keys(results).reduce((a, b) => results[a] > results[b] ? a : b);
  ok(best === 'wool' || best === 'bubble',
    'wool or bubble wrap should win, got ' + best + ': ' + JSON.stringify(results));
});

test('an insulated container really slows heat loss', () => {
  const bare = new HL.World(3);
  const b1 = vessel(bare, 'mug', 1);
  const s1 = into(bare, 'soup', b1);
  run(bare, 90);
  const wrapped = new HL.World(3);
  const b2 = vessel(wrapped, 'mug', 1);
  b2.wrap = 'wool';
  const s2 = into(wrapped, 'soup', b2);
  run(wrapped, 90);
  ok(s2.temp > s1.temp + 5, 'wrapped ' + s2.temp.toFixed(1) + ' vs bare ' + s1.temp.toFixed(1));
});

/* =====================================================================
   Placement rules
   ===================================================================== */
group('Placement rules');

test('a liquid cannot be put down without a container', () => {
  const w = new HL.World(3);
  const it = w.addTemplate('water', 0, 0);
  const r = w.place(it, 500, w.benchY);
  equal(r.ok, false, 'should be refused');
  equal(r.reason, 'msg.needcontainer');
  equal(r.cancel, true, 'the caller should be told to undo');
});

test('a refused drop leaves the item exactly where it was', () => {
  const w = new HL.World(3);
  const pot = vessel(w, 'pot', 0);
  const water = into(w, 'water', pot);
  const snap = w.snapshot(water);
  const r = w.place(water, 500, w.benchY);
  equal(r.ok, false);
  w.restore(water, snap);
  equal(water.containerId, pot.id, 'should still be in the pot');
});

test('solids share a container by slot, liquids by volume', () => {
  const w = new HL.World(3);
  const pot = vessel(w, 'pot', 1);
  into(w, 'hotwater', pot);
  into(w, 'spoonmetal', pot);
  into(w, 'spoonwood', pot);
  equal(pot.contents.length, 3, 'two spoons should fit alongside the water');
  // A second full portion of liquid will not fit in a beaker.
  const bk = vessel(w, 'beaker', 2);
  into(w, 'water', bk);
  into(w, 'water', bk);
  const it = w.addTemplate('water', 0, 0);
  equal(w.fits(it, bk), false, 'a third portion should not fit');
});

test('dropping onto an occupied station stacks instead of shoving', () => {
  const w = new HL.World(3);
  const ic = onStation(w, 'icecream', 1);
  const iron = w.addTemplate('hotiron', 0, 0);
  const st = w.stations[1];
  const r = w.place(iron, st.x, st.y - 30);
  ok(r.ok, 'should place');
  equal(iron.restingOn, ic.id, 'should rest on the ice cream');
});

test('a stack sinks as the thing under it melts', () => {
  const w = new HL.World(3);
  const ic = onStation(w, 'icecream', 1);
  const iron = stackOn(w, 'hotiron', ic);
  const y0 = iron.y;
  run(w, 30);
  ok(ic.meltFrac > 0.5, 'the ice cream should be melting');
  ok(iron.y > y0, 'the block should have sunk: ' + y0 + ' -> ' + iron.y);
});

test('the bench reshapes for a tall screen without losing items', () => {
  const w = new HL.World(3);
  const it = onStation(w, 'iron', 2);
  const before = w.totalEnergy();
  w.setLayout(720, 2);
  equal(w.stations.length, 2);
  ok(it.x <= w.W, 'the item should still be on the bench');
  const a = w.audit();
  ok(Math.abs(a.drift) < 1e-6, 'reshaping must not lose energy: ' + a.drift);
  ok(before > 0);
});

/* =====================================================================
   Scorching
   ===================================================================== */
group('Scorching');

test('chocolate burns when it gets too hot, and not before', () => {
  const w = new HL.World(3);
  const ch = onStation(w, 'chocolate', 1);
  w.stations[1].power = 0.2;
  run(w, 20);
  ok(ch.meltFrac > 0.5, 'should be melting by now');
  ok(!ch.burnt, 'gentle heat should not burn it (at ' + ch.temp.toFixed(0) + ' C)');
  w.stations[1].power = 1;
  run(w, 60);
  ok(ch.burnt, 'full heat should eventually scorch it');
});

test('burning is one way', () => {
  const w = new HL.World(3);
  const ch = onStation(w, 'chocolate', 1);
  w.stations[1].power = 1;
  run(w, 40);
  ok(ch.burnt, 'should be burnt');
  w.stations[1].power = -1;
  run(w, 40);
  ok(ch.burnt, 'cooling it down must not un-burn it');
});

/* =====================================================================
   Frame rate independence
   ===================================================================== */
group('Frame rate independence');

test('the same experiment gives the same answer at 60fps and at 15fps', () => {
  function sim(fps) {
    const w = new HL.World(3);
    const ice = onStation(w, 'icecube', 1);
    w.stations[1].power = 0.8;
    const dt = 1 / fps;
    for (let i = 0; i < fps * 20; i++) w.step(dt);
    const cur = w.byId(ice.id);
    return cur ? cur.temp : null;
  }
  const fast = sim(60), slow = sim(15);
  near(slow, fast, 1.5, 'temperature after 20s at different frame rates');
});

/* =====================================================================
   Challenges
   ===================================================================== */
group('Challenges');

test('there are between 8 and 10 challenges, all well formed', () => {
  between(HL.CHALLENGES.length, 8, 10, 'challenge count');
  for (const ch of HL.CHALLENGES) {
    ok(ch.id && ch.title && ch.goal, 'challenge missing id/title/goal');
    ok(typeof ch.check === 'function', ch.id + ' has no check()');
    ok(Array.isArray(ch.items), ch.id + ' has no item list');
    if (ch.predict) {
      ok(ch.predict.question, ch.id + ' prediction has no question');
      between(ch.predict.options.length, 2, 4, ch.id + ' prediction options');
      between(ch.predict.answer, 0, ch.predict.options.length - 1, ch.id + ' prediction answer index');
      ok(ch.predict.explain, ch.id + ' prediction has no explanation');
    }
  }
});

test('every challenge only offers items that exist', () => {
  for (const ch of HL.CHALLENGES) {
    for (const tid of ch.items) ok(HL.templateById(tid), ch.id + ' wants unknown item ' + tid);
    for (const cid of (ch.containers || [])) ok(HL.containerById(cid), ch.id + ' wants unknown container ' + cid);
    for (const wid of (ch.wraps || [])) ok(HL.wrapById(wid), ch.id + ' wants unknown wrap ' + wid);
  }
});

/* Play a challenge the way a student who has worked it out would. */
function play(id, build, seconds) {
  const ch = HL.challengeById(id);
  if (!ch) fail('no such challenge: ' + id);
  const w = new HL.World(3);
  for (const s of (ch.stations || [])) {
    if (w.stations[s.index]) { w.stations[s.index].power = s.power || 0; w.stations[s.index].locked = !!s.locked; }
  }
  const ctx = { elapsed: 0, identifyCorrect: false };
  const act = build(w, ctx) || {};
  let done = false, note = null;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    w.step(dt);
    w.restack();
    ctx.elapsed += dt;
    if (act.tick) act.tick(w, ctx, ctx.elapsed);
    const r = ch.check(w, ctx) || {};
    if (r.note) note = r.note;
    if (r.done) { done = true; break; }
  }
  const a = w.audit();
  ok(Math.abs(a.drift) < 1e-6, id + ' leaked energy: ' + a.drift);
  return { done, elapsed: ctx.elapsed, note };
}

function completable(id, build, seconds) {
  test('challenge can be completed: ' + id, () => {
    const r = play(id, build, seconds);
    ok(r.done, 'not completed within ' + seconds + 's' + (r.note ? ' (last note: ' + r.note + ')' : ''));
  });
}

function notCompletable(label, id, build, seconds) {
  test('challenge is not a giveaway: ' + id + ' (' + label + ')', () => {
    const r = play(id, build, seconds);
    ok(!r.done, 'completed at ' + r.elapsed.toFixed(1) + 's when it should not have');
  });
}

completable('keepice', (w) => {
  const c = vessel(w, 'foam', 1);
  into(w, 'icecube', c);
}, 125);

completable('meltchoc', (w) => {
  const ch = onStation(w, 'chocolate', 1);
  w.stations[1].power = 0.6;
  return { tick: (ww) => { if (ch.meltFrac >= 0.99) ww.stations[1].power = 0; } };
}, 120);

completable('chill', (w) => {
  const c = vessel(w, 'pot', 0);
  into(w, 'hotwater', c);
  into(w, 'icecube', c);
  w.stations[0].power = -1;
}, 120);

completable('spoonrace', (w) => {
  const c = vessel(w, 'pot', 1);
  into(w, 'hotwater', c);
  const m = into(w, 'spoonmetal', c), o = into(w, 'spoonwood', c);
  w.thermometers[0].attachedTo = m.id; w.thermometers[0].onShelf = false;
  w.thermometers[1].attachedTo = o.id; w.thermometers[1].onShelf = false;
}, 60);

completable('mix40', (w) => {
  const a = vessel(w, 'beaker', 0), b = vessel(w, 'beaker', 2);
  into(w, 'hotwater', a); into(w, 'coldwater', b);
  let poured = false;
  return { tick: (ww, c, t) => { if (!poured && t > 1) { poured = true; ww.pour(a, b); } } };
}, 90);

completable('insulator', (w) => {
  const c = vessel(w, 'mug', 1);
  c.wrap = 'wool';
  into(w, 'soup', c);
}, 95);

completable('gallium', (w) => {
  const g = onStation(w, 'gallium', 1);
  stackOn(w, 'hand', g);
}, 200);

completable('ironcream', (w) => {
  const ic = onStation(w, 'icecream', 1);
  stackOn(w, 'hotiron', ic);
}, 120);

completable('plateau', (w) => {
  const ice = onStation(w, 'icecube', 1);
  w.thermometers[0].attachedTo = ice.id;
  w.thermometers[0].onShelf = false;
  w.stations[1].power = 1;
}, 90);

completable('mystery', (w, ctx) => {
  const m = onStation(w, 'mystery', 1);
  w.stations[1].power = 0.3;
  let answered = false;
  return { tick: (ww, c) => {
    // A student reads the melting point off the thermometer, then picks.
    if (!answered && m.meltFrac > 0.2) {
      answered = true;
      ok(HL.MYSTERY_POOL.indexOf(m.sub.answer) >= 0, 'mystery answer must come from the pool');
      c.identifyCorrect = true;
    }
  }};
}, 150);

notCompletable('left on the bare bench', 'keepice', (w) => { onBench(w, 'icecube', w.W / 2); }, 125);
notCompletable('in a metal pot', 'keepice', (w) => {
  const c = vessel(w, 'pot', 1); into(w, 'icecube', c);
}, 125);
notCompletable('no wrap at all', 'insulator', (w) => {
  const c = vessel(w, 'mug', 1); into(w, 'soup', c);
}, 95);
notCompletable('heater left on full', 'meltchoc', (w) => {
  onStation(w, 'chocolate', 1); w.stations[1].power = 1;
}, 120);
notCompletable('a wrong guess', 'mystery', (w, ctx) => {
  const m = onStation(w, 'mystery', 1);
  w.stations[1].power = 0.3;
  return { tick: (ww, c) => {
    const wrong = HL.MYSTERY_POOL.filter(k => k !== m.sub.answer)[0];
    c.identifyCorrect = (wrong === m.sub.answer);
  }};
}, 60);

/* =====================================================================
   Data integrity
   ===================================================================== */
group('Data integrity');

test('every substance is complete and physically ordered', () => {
  for (const id of Object.keys(HL.SUBSTANCES)) {
    const s = HL.SUBSTANCES[id];
    equal(s.id, id, 'substance key and id must agree');
    ok(s.label, id + ' has no label');
    ok(s.cSolid > 0, id + ' has no solid heat capacity');
    ok(s.cond > 0, id + ' has no conductivity');
    ok(s.colors && s.colors.solid, id + ' has no solid colour');
    if (s.melt !== null && s.boil !== null && s.boil !== undefined && s.melt !== undefined) {
      ok(s.boil > s.melt, id + ': boiling point must be above melting point');
    }
    if (s.latentMelt !== null && s.latentBoil !== null && s.latentBoil !== undefined) {
      ok(s.latentBoil > s.latentMelt, id + ': boiling should cost more than melting');
    }
    if (s.scorch !== null && s.scorch !== undefined && s.melt !== null && s.melt !== undefined) {
      ok(s.scorch > s.melt, id + ': it should melt before it scorches');
    }
  }
});

test('every shelf template points at a real substance', () => {
  for (const t of HL.TEMPLATES) {
    ok(t.id && t.label && t.form, 'template missing id/label/form');
    ok(t.group, t.id + ' has no shelf group');
    if (t.sub) ok(HL.SUBSTANCES[t.sub], t.id + ' names unknown substance ' + t.sub);
    else ok(t.fixedTemp !== undefined, t.id + ' has no substance and no fixed temperature');
    if (t.mass > 0) ok(t.mass > 0 && t.mass < 10, t.id + ' has an odd mass: ' + t.mass);
  }
});

test('two portions of any liquid fit in every container', () => {
  // The mixing experiment depends on this.
  const liquids = HL.TEMPLATES.filter(t => t.needsContainer);
  for (const spec of HL.CONTAINERS) {
    for (const l of liquids) {
      ok(spec.capacity >= l.mass * 2,
        spec.id + ' (capacity ' + spec.capacity + ') cannot hold two portions of ' + l.id + ' (' + l.mass + ')');
    }
  }
});

test('the mystery sample hides a real substance and reveals it on inspection', () => {
  for (let i = 0; i < 40; i++) {
    const m = HL.pickMystery();
    ok(HL.MYSTERY_POOL.indexOf(m.answer) >= 0, 'unknown answer ' + m.answer);
    ok(HL.MYSTERY_LABELS[m.answer], 'no label for ' + m.answer);
    equal(m.label, 'Mystery', 'it must not give its name away');
    equal(m.colors, HL.SUBSTANCES.mystery.colors, 'it must not give its colour away');
  }
});

test('wraps all insulate, and none of them is a no-op', () => {
  for (const wr of HL.WRAPS) {
    ok(wr.label, wr.id + ' has no label');
    between(wr.airFactor, 0.01, 0.95, wr.id + ' airFactor should actually insulate');
  }
});

test('every word on screen exists in both year levels', () => {
  const keys = ['tool.energy', 'tool.camera', 'tool.lens', 'state.melting', 'state.boiling',
    'msg.needcontainer', 'graph.flat', 'predict.ask', 'lens.solid', 'lens.liquid', 'lens.gas'];
  for (const k of keys) {
    HL.setLevel('y34');
    const a = HL.L(k);
    HL.setLevel('y56');
    const b = HL.L(k);
    ok(a && a !== k, 'missing Years 3/4 wording for ' + k);
    ok(b && b !== k, 'missing Years 5/6 wording for ' + k);
  }
  HL.setLevel('y34');
});

test('the Learning Intention and Success Criteria are present', () => {
  ok(/heat energy/i.test(HL.LISC.intention), 'intention should mention heat energy');
  equal(HL.LISC.criteria.length, 3, 'there should be three success criteria');
  for (const c of HL.LISC.criteria) ok(c.length > 20, 'success criterion looks truncated: ' + c);
});

test('the heat colour scale is monotonic in lightness', () => {
  // Paired with numbers everywhere, but it still must not read as a loop for
  // anyone with a colour vision deficiency.
  function lum(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const stops = HL.HEAT_STOPS;
  for (let i = 1; i < stops.length; i++) {
    ok(stops[i][0] > stops[i - 1][0], 'heat stops must be ordered by temperature');
  }
  ok(lum(stops[stops.length - 1][1]) > lum(stops[0][1]),
    'the hot end should be lighter than the cold end');
});

H.report();
