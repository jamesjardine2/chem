/* Heat Lab - a tiny test harness.
 *
 * No dependencies: `node test/run.js` from the repo root. The model files are
 * plain browser scripts that attach themselves to a global HL, so the harness
 * gives them a stand-in `window` and evaluates them in order.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadModel() {
  global.window = {};
  const files = [
    'js/data/substances.js',
    'js/data/language.js',
    'js/data/challenges.js',
    'js/model/thermo.js',
    'js/model/world.js',
    // Loaded for the heat colour scale and the item-naming rule. It only
    // touches a canvas inside its drawing functions, so it is safe here.
    'js/render/art.js'
  ];
  for (const f of files) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  }
  return global.window.HL;
}

let passed = 0;
const failures = [];
let current = '(no test)';

function test(name, fn) {
  current = name;
  try {
    fn();
    passed++;
    process.stdout.write('  ok   ' + name + '\n');
  } catch (err) {
    failures.push({ name, message: err.message });
    process.stdout.write('  FAIL ' + name + '\n         ' + err.message + '\n');
  }
}

function group(name) {
  process.stdout.write('\n' + name + '\n');
}

function fail(msg) { throw new Error(msg); }

function ok(cond, msg) {
  if (!cond) fail(msg || 'expected truthy');
}

function near(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= tol)) {
    fail((msg ? msg + ': ' : '') + 'expected ' + expected + ' +/- ' + tol + ', got ' + actual);
  }
}

function between(actual, lo, hi, msg) {
  if (!(actual >= lo && actual <= hi)) {
    fail((msg ? msg + ': ' : '') + 'expected ' + lo + '..' + hi + ', got ' + actual);
  }
}

function equal(actual, expected, msg) {
  if (actual !== expected) {
    fail((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function report() {
  process.stdout.write('\n' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) {
    process.stdout.write('\nFailures:\n');
    for (const f of failures) process.stdout.write('  - ' + f.name + ': ' + f.message + '\n');
    process.exit(1);
  }
}

/* ---- helpers for driving a world ------------------------------------- */

function run(world, seconds, onTick) {
  const dt = 1 / 60;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    world.step(dt);
    world.restack();
    if (onTick) onTick(world, world.time);
  }
  return world;
}

function onStation(world, tid, index, opts) {
  const it = world.addTemplate(tid, 0, 0, opts);
  const st = world.stations[index];
  const r = world.place(it, st.x, st.y - 30);
  if (!r.ok) fail('could not place ' + tid + ': ' + r.reason);
  return it;
}

function vessel(world, cid, index) {
  const c = world.addContainer(cid, 0, 0);
  const st = world.stations[index];
  const r = world.place(c, st.x, st.y - 30);
  if (!r.ok) fail('could not place ' + cid + ': ' + r.reason);
  return c;
}

function onBench(world, tid, x) {
  const it = world.addTemplate(tid, 0, 0);
  const r = world.place(it, x, world.benchY);
  if (!r.ok) fail('could not place ' + tid + ' on bench: ' + r.reason);
  return it;
}

function into(world, tid, container, opts) {
  const it = world.addTemplate(tid, 0, 0, opts);
  const r = world.place(it, container.x, container.y - container.h + 10);
  if (!r.ok) fail('could not put ' + tid + ' into ' + container.tid + ': ' + r.reason);
  return it;
}

function stackOn(world, tid, below) {
  const it = world.addTemplate(tid, 0, 0);
  const r = world.place(it, below.x, world.visualTop(below) + 4);
  if (!r.ok) fail('could not stack ' + tid + ': ' + r.reason);
  return it;
}

module.exports = {
  loadModel, test, group, ok, near, between, equal, fail, report,
  run, onStation, onBench, vessel, into, stackOn
};
