/* Heat Lab - the bench and everything on it.
 *
 * The world owns items, heater/cooler stations, thermometers and the clock.
 * It knows nothing about pixels or the DOM: the renderer reads it, the UI
 * pokes it. World coordinates are a fixed 1000 x 620 space; x is the centre
 * of an item and y is its BOTTOM edge, which makes stacking easy to reason
 * about.
 */
(function () {
  var HL = (window.HL = window.HL || {});
  var Th = HL.Thermo;

  var W = 1000, H = 620;
  var BENCH_Y = 500;        // top of the bench surface
  var STATION_H = 64;
  var PLATE_TOP = 4;        // the plate's top face, where things actually rest
  HL.PLATE_TOP = PLATE_TOP;

  /* Tuned so a classroom experiment finishes in seconds, not minutes, while
   * keeping every ratio between materials honest. */
  var TUNING = {
    maxPower: 9,            // EU/s at full heat or full cool
    plateCap: 0.3,          // heat capacity of a hotplate (thin, so an
                            // OFF heater does not melt ice with stored heat)
    plateCond: 3.0,
    plateMaxTemp: 350,
    plateMinTemp: -40,
    stationContact: 0.6,    // plate to whatever sits on it
    stackContact: 0.10,     // solid resting on solid
    insideContact: 0.25,    // contents to container
    airK: 0.012,            // room air coupling per unit of exposed area
    room: HL.ROOM_TEMP
  };

  var nextId = 1;
  function uid(p) { return (p || 'i') + (nextId++); }

  /* ------------------------------------------------------------------ item */

  function makeItem(template, opts) {
    opts = opts || {};
    var sub = template.sub ? HL.SUBSTANCES[template.sub] : null;
    if (sub && sub.isMystery) sub = HL.pickMystery();
    var mass = opts.mass !== undefined ? opts.mass : template.mass;
    var temp = opts.temp !== undefined ? opts.temp : template.temp;
    var item = {
      id: uid('item'),
      tid: template.id,
      kind: 'substance',
      label: template.label,
      form: template.form,
      sub: sub,
      mass: mass,
      fixedTemp: template.fixedTemp !== undefined ? template.fixedTemp : null,
      energy: sub ? Th.energyForTemp(sub, Math.max(mass, Th.MIN_MASS), temp) : 0,
      cond: template.cond !== undefined ? template.cond : (sub ? sub.cond : 1),
      contactFactor: template.contactFactor || 1,
      needsContainer: !!template.needsContainer,
      w: template.w || 70, h: template.h || 60,
      x: opts.x || 0, y: opts.y || BENCH_Y,
      station: null, restingOn: null, containerId: null,
      contents: null, wrap: null,
      burnt: false, openToAir: true,
      startTemp: temp,
      // visual state, filled in by the renderer
      slump: 0, wobble: Math.random() * 6.28, frost: 0, sizzle: 0, puff: 0
    };
    Th.refresh(item);
    return item;
  }

  function makeContainer(spec, opts) {
    opts = opts || {};
    var sub = { id: 'vessel', label: spec.label, cSolid: spec.c, cLiquid: spec.c, cGas: null,
                melt: null, boil: null, latentMelt: null, latentBoil: null,
                cond: spec.cond, scorch: null, colors: { solid: spec.colors.body, solidEdge: spec.colors.edge } };
    var item = {
      id: uid('cont'),
      tid: spec.id,
      kind: 'container',
      label: spec.label,
      form: 'container',
      spec: spec,
      sub: sub,
      mass: spec.mass,
      fixedTemp: null,
      energy: Th.energyForTemp(sub, spec.mass, opts.temp !== undefined ? opts.temp : TUNING.room),
      cond: spec.cond,
      contactFactor: 1,
      capacity: spec.capacity,
      w: spec.w, h: spec.h,
      x: opts.x || 0, y: opts.y || BENCH_Y,
      station: null, restingOn: null, containerId: null,
      contents: [], wrap: null,
      burnt: false, openToAir: true,
      slump: 0, wobble: 0, frost: 0, sizzle: 0, puff: 0
    };
    Th.refresh(item);
    return item;
  }

  /* --------------------------------------------------------------- station */

  function makeStation(index, x, w) {
    var plateSub = { id: 'plate', label: 'Hotplate', cSolid: TUNING.plateCap, cLiquid: TUNING.plateCap,
                     cGas: null, melt: null, boil: null, latentMelt: null, latentBoil: null,
                     cond: TUNING.plateCond, scorch: null, colors: {} };
    var plate = {
      id: uid('plate'), kind: 'plate', sub: plateSub, mass: 1,
      energy: Th.energyForTemp(plateSub, 1, TUNING.room), cond: TUNING.plateCond,
      contactFactor: 1, openToAir: true, w: 150, h: 18, fixedTemp: null
    };
    Th.refresh(plate);
    return {
      index: index, x: x, y: BENCH_Y, w: w || 170, h: STATION_H,
      power: 0,              // -1 (full cool) .. 0 (off) .. +1 (full heat)
      locked: false,
      plate: plate
    };
  }

  /* ----------------------------------------------------------------- world */

  function World(stationCount) {
    this.W = W; this.H = H; this.benchY = BENCH_Y;
    this.items = [];
    this.thermometers = [];
    this.stations = [];
    this.time = 0;
    this.paused = false;
    this.speed = 1;
    this.events = [];
    this.steamPuffs = [];
    this.contactCount = 0;
    this.transferCount = 0;
    this.ledger = { in: 0, out: 0, room: 0, steam: 0, seeded: 0, removed: 0 };
    this.transfers = [];      // this frame's flows, for the energy view
    this.setStationCount(stationCount || 3);

    var colors = ['#0072B2', '#D55E00', '#009E73', '#CC79A7'];
    for (var i = 0; i < 4; i++) {
      this.thermometers.push({
        id: 'th' + (i + 1), color: colors[i], index: i,
        x: 60 + i * 46, y: BENCH_Y - 10, attachedTo: null,
        samples: [], onShelf: true
      });
    }
  }

  World.prototype.setStationCount = function (n) {
    n = Math.max(2, Math.min(4, n));
    var i;
    // Plates count towards the energy ledger, so retiring them has to be
    // booked just like clearing an item off the bench.
    for (i = 0; i < this.stations.length; i++) this.ledger.removed += this.stations[i].plate.energy;
    this.stations = [];
    var span = this.W - 140;
    var sw = Math.max(140, Math.min(190, span / n - 24));
    for (i = 0; i < n; i++) {
      var st = makeStation(i, 70 + span * ((i + 0.5) / n), sw);
      st.plate.w = sw - 20;
      // The slider belongs to its station, so its width travels with it and
      // the renderer never has to guess.
      st.sliderW = Math.max(118, Math.min(168, sw - 14));
      this.ledger.seeded += st.plate.energy;
      this.stations.push(st);
    }
  };

  /* Reshape the bench for the screen it is on: a tall iPad gets a narrower
   * bench with two stations (so everything is bigger to touch), a wide
   * whiteboard gets a broad bench with four. */
  World.prototype.setLayout = function (width, stationCount) {
    if (this.W === width && this.stations.length === stationCount) return false;
    this.W = width;
    this.setStationCount(stationCount);
    // Anything now hanging off the end comes back onto the bench.
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.containerId) continue;
      it.x = Math.max(it.w / 2 + 8, Math.min(this.W - it.w / 2 - 8, it.x));
      if (it.station !== null && this.stations[it.station]) {
        it.x = this.stations[it.station].x;
      } else if (it.station !== null) {
        it.station = null;
        it.y = BENCH_Y;
      }
    }
    return true;
  };

  World.prototype.byId = function (id) {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i];
    return null;
  };

  World.prototype.emit = function (type, item, extra) {
    var ev = { type: type, item: item, t: this.time };
    if (extra) for (var k in extra) ev[k] = extra[k];
    this.events.push(ev);
  };

  /* ------------------------------------------------------------- placement */

  World.prototype.stationAt = function (x, y) {
    for (var i = 0; i < this.stations.length; i++) {
      var s = this.stations[i];
      if (x > s.x - s.w / 2 && x < s.x + s.w / 2 && y > s.y - s.h - 70 && y < s.y + 12) return s;
    }
    return null;
  };

  World.prototype.itemAt = function (x, y, skipId) {
    // Topmost first, so the thing drawn on top is the thing you grab.
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (it.id === skipId) continue;
      if (it.containerId) continue;                 // grab the container, not its contents
      if (x > it.x - it.w / 2 && x < it.x + it.w / 2 && y > it.y - it.h && y < it.y + 6) return it;
    }
    return null;
  };

  World.prototype.topOf = function (item) {
    return this.visualTop(item);
  };

  /* Where the top of this thing actually LOOKS like it is. A half melted ice
   * cream is half as tall, so a block resting on it sinks as it melts - which
   * is both what happens and a nice thing to watch. */
  World.prototype.visualTop = function (item) {
    if (item.kind === 'container') return item.y - item.h;
    return item.y - item.h * (1 - 0.8 * (item.meltFrac || 0));
  };

  /* Keep stacks sitting on each other as the things underneath change shape. */
  World.prototype.restack = function () {
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        if (!it.restingOn || it.dragging) continue;
        var below = this.byId(it.restingOn);
        if (!below) { it.restingOn = null; it.y = BENCH_Y; continue; }
        var want = this.visualTop(below);
        if (Math.abs(it.y - want) > 0.01) { it.y = want; moved = true; }
      }
      if (!moved) break;
    }
  };

  /* Only liquid fills a container up. A spoon or an ice cube takes up a slot,
   * not volume, so two spoons can share one pot - which the "which spoon gets
   * hot first" challenge needs. */
  World.prototype.liquidMass = function (container) {
    var m = 0;
    for (var i = 0; i < container.contents.length; i++) {
      var c = this.byId(container.contents[i]);
      if (c && (c.state === 'liquid' || c.state === 'boiling' || c.state === 'gas')) m += c.mass;
    }
    return m;
  };

  World.prototype.MAX_CONTENTS = 4;

  /* Would this item fit in this container? Liquids are limited by volume,
   * everything else by how many things will sit in there at once. */
  World.prototype.fits = function (item, container) {
    if (container.contents.length >= this.MAX_CONTENTS) return false;
    var isLiquid = item.state === 'liquid' || item.state === 'boiling' || item.state === 'gas';
    if (!isLiquid) return true;
    return item.mass <= container.capacity - this.liquidMass(container) + 0.001;
  };

  /* Put an item somewhere sensible for the point it was dropped at.
   * Returns { ok, reason }. */
  /* Everything needed to put an item back exactly where it was. */
  World.prototype.snapshot = function (item) {
    return { x: item.x, y: item.y, station: item.station,
             restingOn: item.restingOn, containerId: item.containerId };
  };

  World.prototype.restore = function (item, snap) {
    this.detach(item);
    item.x = snap.x; item.y = snap.y;
    item.station = snap.station;
    item.restingOn = snap.restingOn;
    if (snap.containerId) {
      var c = this.byId(snap.containerId);
      if (c && c.contents) this.putInside(item, c);
    }
  };

  World.prototype.place = function (item, x, y) {
    var target = this.itemAt(x, y, item.id);
    var was = this.snapshot(item);

    // Check what we are about to do BEFORE taking the item out of its current
    // home, so a refused drop can be undone cleanly.
    if (target && target.kind === 'container' && item.kind !== 'container' && !this.fits(item, target)) {
      return { ok: false, reason: 'msg.full', cancel: true };
    }
    if (item.needsContainer && !(target && target.kind === 'container')) {
      return { ok: false, reason: 'msg.needcontainer', cancel: true };
    }

    this.detach(item);
    item.x = Math.max(item.w / 2 + 8, Math.min(this.W - item.w / 2 - 8, x));

    // 1. Into a container?
    if (target && target.kind === 'container' && item.kind !== 'container') {
      this.putInside(item, target);
      return { ok: true };
    }

    // 2. Pour one container into another? You tip it and set it back down,
    //    so the source returns to where it was rather than landing on top.
    if (target && target.kind === 'container' && item.kind === 'container') {
      var moved = this.pour(item, target);
      if (moved) { this.restore(item, was); return { ok: true, poured: true }; }
    }

    // 3. A wrap dropped onto something? (wraps are handled by the UI, not here)

    // 4. Resting on top of another item?
    if (target && target.kind !== 'container') {
      item.restingOn = target.id;
      item.y = this.topOf(target);
      item.x = Math.max(target.x - target.w / 2 + item.w / 2,
                        Math.min(target.x + target.w / 2 - item.w / 2, item.x));
      return { ok: true, stacked: target };
    }

    // 5. Onto a station, or bare bench.
    var st = this.stationAt(x, y);
    if (st) {
      // Aiming at a station that is already taken almost always means "put
      // this on top of that" - which is the whole touch-and-stack
      // experiment. So do that rather than shoving things sideways.
      var sitting = null;
      for (var q = 0; q < this.items.length; q++) {
        if (this.items[q] !== item && this.items[q].station === st.index) { sitting = this.items[q]; break; }
      }
      if (sitting && item.kind !== 'container') {
        if (sitting.kind === 'container') {
          if (this.fits(item, sitting)) { this.putInside(item, sitting); return { ok: true }; }
          return { ok: false, reason: 'msg.full', cancel: true };
        }
        item.restingOn = sitting.id;
        item.x = sitting.x;
        item.y = this.topOf(sitting);
        return { ok: true, stacked: sitting };
      }
      item.station = st.index;
      item.x = st.x;
      item.y = st.y - st.h + PLATE_TOP;
    } else {
      item.y = BENCH_Y;
    }
    // Nudge sideways out of anything we would otherwise be standing inside.
    for (var i = 0; i < this.items.length; i++) {
      var o = this.items[i];
      if (o === item || o.containerId) continue;
      if (Math.abs(o.y - item.y) > 4) continue;
      var overlap = (o.w + item.w) / 2 - Math.abs(o.x - item.x);
      if (overlap > 0) item.x += (item.x >= o.x ? 1 : -1) * (overlap + 6);
    }
    item.x = Math.max(item.w / 2 + 8, Math.min(this.W - item.w / 2 - 8, item.x));
    return { ok: true };
  };

  World.prototype.putInside = function (item, container) {
    item.containerId = container.id;
    item.station = null;
    item.restingOn = null;
    container.contents.push(item.id);
    item.openToAir = true;   // an open container still lets steam out
  };

  World.prototype.detach = function (item) {
    if (item.containerId) {
      var c = this.byId(item.containerId);
      if (c && c.contents) {
        var k = c.contents.indexOf(item.id);
        if (k >= 0) c.contents.splice(k, 1);
      }
      item.containerId = null;
    }
    item.station = null;
    item.restingOn = null;
    // Anything that was resting on this item comes with it.
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].restingOn === item.id) {
        this.items[i].restingOn = null;
        this.items[i].y = BENCH_Y;
      }
    }
  };

  /* Pour src's liquid contents into dst. Same substance merges: the masses
   * add and so do the energies, so the mixed temperature lands between the
   * two - which is exactly the point of the mixing experiment. */
  World.prototype.pour = function (src, dst) {
    if (src.kind !== 'container' || dst.kind !== 'container') return false;
    var movedAny = false;
    var list = src.contents.slice();
    for (var i = 0; i < list.length; i++) {
      var c = this.byId(list[i]);
      if (!c) continue;
      if (c.state === 'solid' || c.state === 'melting') continue;   // solids stay put
      var room = dst.capacity - this.liquidMass(dst);
      if (room <= 0.001) continue;
      var target = null;
      for (var j = 0; j < dst.contents.length; j++) {
        var d = this.byId(dst.contents[j]);
        if (d && d.sub && c.sub && d.sub.id === c.sub.id) { target = d; break; }
      }
      var take = Math.min(c.mass, room);
      var frac = take / c.mass;
      var movedEnergy = c.energy * frac;
      if (target) {
        target.mass += take;
        target.energy += movedEnergy;
        Th.refresh(target);
      } else {
        var tpl = HL.templateById(c.tid) || { id: c.tid, label: c.label, form: c.form, sub: c.sub ? c.sub.id : null, mass: take, temp: 20 };
        var fresh = makeItem(tpl, { mass: take, temp: c.temp });
        fresh.sub = c.sub;
        fresh.energy = movedEnergy;
        fresh.label = c.label;
        Th.refresh(fresh);
        this.items.push(fresh);
        this.putInside(fresh, dst);
      }
      c.mass -= take;
      c.energy -= movedEnergy;
      if (c.mass <= Th.MIN_MASS) this.removeItem(c, true);
      else Th.refresh(c);
      movedAny = true;
    }
    if (movedAny) this.emit('pour', dst);
    return movedAny;
  };

  /* --------------------------------------------------------- add and remove */

  World.prototype.addTemplate = function (tid, x, y, opts) {
    var tpl = HL.templateById(tid);
    if (!tpl) return null;
    var item = makeItem(tpl, opts || {});
    item.x = x; item.y = y;
    this.items.push(item);
    this.ledger.seeded += item.energy;
    return item;
  };

  World.prototype.addContainer = function (cid, x, y, opts) {
    var spec = HL.containerById(cid);
    if (!spec) return null;
    var item = makeContainer(spec, opts || {});
    item.x = x; item.y = y;
    this.items.push(item);
    this.ledger.seeded += item.energy;
    return item;
  };

  World.prototype.removeItem = function (item, silent) {
    if (!silent) this.ledger.removed += item.energy;
    else this.ledger.removed += item.energy;
    this.detach(item);
    if (item.contents) {
      var list = item.contents.slice();
      for (var i = 0; i < list.length; i++) {
        var c = this.byId(list[i]);
        if (c) this.removeItem(c, true);
      }
    }
    for (var t = 0; t < this.thermometers.length; t++) {
      if (this.thermometers[t].attachedTo === item.id) {
        this.thermometers[t].attachedTo = null;
        this.thermometers[t].onShelf = true;
      }
    }
    var k = this.items.indexOf(item);
    if (k >= 0) this.items.splice(k, 1);
  };

  World.prototype.clearBench = function () {
    while (this.items.length) this.removeItem(this.items[0], true);
    for (var i = 0; i < this.stations.length; i++) {
      var s = this.stations[i];
      s.power = 0; s.locked = false;
      s.plate.energy = Th.energyForTemp(s.plate.sub, 1, TUNING.room);
      Th.refresh(s.plate);
    }
    for (var t = 0; t < this.thermometers.length; t++) {
      var th = this.thermometers[t];
      th.attachedTo = null; th.onShelf = true; th.samples = [];
    }
    this.time = 0;
    this.steamPuffs = [];
    this.ledger = { in: 0, out: 0, room: 0, steam: 0, seeded: 0, removed: 0 };
    for (var p = 0; p < this.stations.length; p++) this.ledger.seeded += this.stations[p].plate.energy;
  };

  /* ------------------------------------------------------------- contacts */

  /* Everything that is touching, with how well heat crosses the join.
   *
   * The results are written into a reusable pool rather than fresh objects.
   * This is called once per frame and read by every substep, and on slow
   * hardware the allocations it used to make were measurable. Use
   * world.contactCount, not out.length, for how many are live. */
  World.prototype.contactSlot = function () {
    var pool = this._cpool || (this._cpool = []);
    var i = this.contactCount++;
    var slot = pool[i];
    if (!slot) { slot = pool[i] = { a: null, b: null, G: 0, kind: '', station: null }; }
    return slot;
  };

  World.prototype.contacts = function () {
    var out = this._cpool || (this._cpool = []);
    this.contactCount = 0;
    var i, it, slot;
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];

      if (it.containerId) {
        var c = this.byId(it.containerId);
        if (c) {
          slot = this.contactSlot();
          slot.a = it; slot.b = c; slot.kind = 'inside'; slot.station = null;
          slot.G = Th.pairConductance(TUNING.insideContact, it.cond * it.contactFactor, c.cond);
          // Contents also swap heat with each other (a spoon in hot water).
          for (var j = 0; j < c.contents.length; j++) {
            var o = this.byId(c.contents[j]);
            if (o && o.id !== it.id && o.id > it.id) {
              slot = this.contactSlot();
              slot.a = it; slot.b = o; slot.kind = 'inside'; slot.station = null;
              slot.G = Th.pairConductance(TUNING.insideContact, it.cond * it.contactFactor, o.cond * o.contactFactor);
            }
          }
        }
      }

      if (it.restingOn) {
        var below = this.byId(it.restingOn);
        if (below) {
          slot = this.contactSlot();
          slot.a = it; slot.b = below; slot.kind = 'stack'; slot.station = null;
          slot.G = Th.pairConductance(TUNING.stackContact, it.cond * it.contactFactor, below.cond * below.contactFactor);
        }
      }

      if (it.station !== null && this.stations[it.station]) {
        var st = this.stations[it.station];
        slot = this.contactSlot();
        slot.a = st.plate; slot.b = it; slot.kind = 'station'; slot.station = st;
        slot.G = Th.pairConductance(TUNING.stationContact, TUNING.plateCond, it.cond);
      }
    }
    return out;
  };

  /* Transfers feed the energy view. Pooled for the same reason as contacts. */
  World.prototype.noteTransfer = function (from, to, q, kind) {
    var pool = this._tpool || (this._tpool = []);
    var i = this.transferCount++;
    var t = pool[i];
    if (!t) t = pool[i] = { from: null, to: null, q: 0, kind: '' };
    t.from = from; t.to = to; t.q = q; t.kind = kind;
    this.transfers = pool;
  };

  /* How exposed to the room is this thing? Bigger surface loses faster;
   * a wrap slows it down; being inside a container shelters it.
   *
   * A container gets one extra term: its air exchange scales with its own
   * conductivity. Each body here is a single well-mixed lump, and for a solid
   * block that is fine - heat crosses it quickly. A container WALL is
   * different: the outside of a foam cup sits near room temperature while the
   * inside stays hot, so treating it as one lump that swaps heat freely with
   * the room would wipe out the very insulation the student is testing.
   * Scaling by conductivity puts that back, and it is why a foam cup keeps
   * ice frozen while a metal pot melts it faster than bare bench does.
   *
   * The factor is capped at 1: a good conductor cannot exchange heat with the
   * room FASTER than the still air against its surface allows, so metal gets
   * no bonus - only insulators get a penalty. Without the cap, metal pots
   * bled heat so fast that they came out worse than a foam cup on a heater,
   * which is not what happens on a real bench. */
  World.prototype.airCoupling = function (item) {
    var area = (item.w * item.h) / 5000;
    var factor = 1;
    if (item.wrap) {
      var wr = HL.wrapById(item.wrap);
      if (wr) factor *= wr.airFactor;
    }
    if (item.kind === 'container') {
      factor *= Math.max(0.15, Math.min(1, item.cond));
    }
    if (item.containerId) {
      var c = this.byId(item.containerId);
      area *= 0.18;                                 // the vessel shields it
      if (c && c.wrap) {
        var w2 = HL.wrapById(c.wrap);
        if (w2) factor *= w2.airFactor;
      }
      if (c) factor *= Math.max(0.15, Math.min(1, c.cond));
    }
    return TUNING.airK * area * factor;
  };

  /* ----------------------------------------------------------------- step */

  var room = { temp: TUNING.room, cap: Infinity, energy: 0 };

  World.prototype.step = function (dt) {
    if (this.paused || dt <= 0) return;
    var sub = Math.min(6, Math.ceil(dt / 0.02));
    var h = dt / sub;
    // What is touching what is geometry, and geometry does not change inside a
    // frame - so work it out once and let every substep reuse it.
    this.contacts();
    for (var s = 0; s < sub; s++) this.substep(h);
    this.time += dt;
    this.recordSamples();
  };

  World.prototype.substep = function (dt) {
    var i, it, st;
    this.transferCount = 0;

    // Refresh temperatures and states before anything moves.
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.fixedTemp !== null && it.sub) {
        it.energy = Th.energyForTemp(it.sub, Math.max(it.mass, Th.MIN_MASS), it.fixedTemp);
      }
      it.prevTemp = it.temp;
      Th.refresh(it);
      if (it.fixedTemp !== null && !it.sub) { it.temp = it.fixedTemp; it.cap = Infinity; }
    }

    // 1. Heaters and coolers push energy into (or pull it out of) their plate.
    for (i = 0; i < this.stations.length; i++) {
      st = this.stations[i];
      Th.refresh(st.plate);
      var p = st.power * TUNING.maxPower;
      if (p !== 0) {
        var dE = p * dt;
        st.plate.energy += dE;
        if (dE > 0) this.ledger.in += dE; else this.ledger.out += -dE;
      }
      Th.refresh(st.plate);
      // Safety cut-out, so an empty plate cannot run away forever.
      if (st.plate.temp > TUNING.plateMaxTemp) {
        var over = (st.plate.temp - TUNING.plateMaxTemp) * st.plate.cap;
        st.plate.energy -= over; this.ledger.out += over; Th.refresh(st.plate);
      } else if (st.plate.temp < TUNING.plateMinTemp) {
        var under = (TUNING.plateMinTemp - st.plate.temp) * st.plate.cap;
        st.plate.energy += under; this.ledger.in += under; Th.refresh(st.plate);
      }
    }

    // 2. Conduction across every join. Hot to cold, always.
    var cs = this._cpool || [];
    for (i = 0; i < this.contactCount; i++) {
      var cj = cs[i];
      var q = Th.conduct(cj.a, cj.b, cj.G, dt);
      if (q > 1e-9) this.noteTransfer(cj.a, cj.b, q / dt, cj.kind);
      else if (q < -1e-9) this.noteTransfer(cj.b, cj.a, -q / dt, cj.kind);
      Th.refresh(cj.a); Th.refresh(cj.b);
    }

    // 3. Everything slowly swaps heat with the room, which sits at 20 degC.
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (!it.sub) continue;
      var G = this.airCoupling(it);
      var qa = Th.conduct(it, room, G, dt);
      room.energy = 0;
      this.ledger.room += qa;
      if (qa > 1e-9) this.noteTransfer(it, 'room', qa / dt, 'air');
      else if (qa < -1e-9) this.noteTransfer('room', it, -qa / dt, 'air');
      Th.refresh(it);
    }
    for (i = 0; i < this.stations.length; i++) {
      st = this.stations[i];
      // A hotplate is lagged underneath and only its top face is open to the
      // room - and that face is covered as soon as something is put on it.
      var occupied = false;
      for (var oi = 0; oi < this.items.length; oi++) {
        if (this.items[oi].station === st.index) { occupied = true; break; }
      }
      // A hotplate is the one thing here that reaches hundreds of degrees,
      // and at those temperatures radiation and convection grow much faster
      // than the temperature difference does. Scaling its air loss with that
      // difference keeps two lessons honest at once: a cold plate barely
      // drains an insulated mug standing on it, while a plate driven red hot
      // under a foam cup wastes most of its heat to the room - which is why
      // the cup really is slower to warm than the metal pot.
      var lift = 1 + Math.abs(st.plate.temp - TUNING.room) / 60;
      var qp = Th.conduct(st.plate, room, TUNING.airK * (occupied ? 0.3 : 0.6) * lift, dt);
      room.energy = 0;
      this.ledger.room += qp;
      Th.refresh(st.plate);
    }

    // 4. Boiling vapour leaves, carrying its energy with it.
    for (i = this.items.length - 1; i >= 0; i--) {
      it = this.items[i];
      if (!it.sub) continue;
      var lost = Th.releaseVapour(it);
      if (lost > 0) {
        this.ledger.steam += lost;
        this.spawnSteam(it);
      }
      Th.refresh(it);
      if (it.sub && it.mass <= Th.MIN_MASS + 1e-6 && it.state === 'boiling') {
        this.emit('boiledaway', it);
        this.removeItem(it, true);
      }
    }

    // 5. Thermostatted props (the hand) hold their temperature. Whatever they
    // gave or took has to be booked, or the energy audit would not add up:
    // a hand warming gallium is energy entering the bench from outside it.
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.fixedTemp === null) continue;
      if (it.sub) {
        var want = Th.energyForTemp(it.sub, Math.max(it.mass, Th.MIN_MASS), it.fixedTemp);
        var diff = want - it.energy;
        if (diff > 0) this.ledger.in += diff; else this.ledger.out += -diff;
        it.energy = want;
      } else if (it.energy !== 0) {
        if (it.energy < 0) this.ledger.in += -it.energy;
        else this.ledger.out += it.energy;
        it.energy = 0;
      }
      Th.refresh(it);
      if (!it.sub) { it.temp = it.fixedTemp; it.cap = Infinity; }
    }

    // 6. Book-keeping that drives the visuals and the sounds.
    for (i = 0; i < this.items.length; i++) this.updateFlags(this.items[i], dt);
  };

  World.prototype.updateFlags = function (it, dt) {
    if (!it.sub) return;
    if (it.prevTemp !== undefined) {
      if (it.temp > it.prevTemp + 1e-6) it.lastDir = 'up';
      else if (it.temp < it.prevTemp - 1e-6) it.lastDir = 'down';
    }
    // Scorching is one-way: once it is burnt, it stays burnt.
    if (it.sub.scorch !== null && it.sub.scorch !== undefined && it.temp >= it.sub.scorch && !it.burnt) {
      it.burnt = true;
      this.emit('scorch', it);
    }
    // Frost creeps over very cold things; sizzle when a melting fat is hot.
    var wantFrost = it.temp < -2 ? Math.min(1, (-2 - it.temp) / 14) : 0;
    it.frost += (wantFrost - it.frost) * Math.min(1, dt * 1.5);
    var wantSizzle = (it.state === 'liquid' && it.temp > 95 && it.sub.boil === null) ? 1 : 0;
    it.sizzle += (wantSizzle - it.sizzle) * Math.min(1, dt * 2);
    var wantPuff = (it.sub.puffAbove !== undefined && it.temp > it.sub.puffAbove)
      ? Math.min(1, (it.temp - it.sub.puffAbove) / 40) : 0;
    it.puff += (wantPuff - it.puff) * Math.min(1, dt * 1.2);
    it.slump = it.meltFrac;

    // One-shot events for sound and feedback.
    var st = it.state;
    if (st !== it.prevState) {
      if (st === 'melting' && it.lastDir === 'up') this.emit('melting', it);
      if (st === 'liquid' && it.prevState === 'melting') this.emit('melted', it);
      if (st === 'boiling' && it.lastDir === 'up') this.emit('boiling', it);
      if (st === 'melting' && it.lastDir === 'down') this.emit('freezing', it);
      if (st === 'solid' && it.prevState === 'melting') this.emit('frozen', it);
      it.prevState = st;
    }
  };

  World.prototype.spawnSteam = function (it) {
    if (this.steamPuffs.length > (this.maxSteam || 60)) return;
    var top = it.containerId ? (this.byId(it.containerId) || it) : it;
    this.steamPuffs.push({
      x: top.x + (Math.random() - 0.5) * top.w * 0.5,
      y: top.y - top.h,
      vy: -22 - Math.random() * 18, vx: (Math.random() - 0.5) * 10,
      life: 0, max: 1.6 + Math.random(), r: 8 + Math.random() * 8
    });
  };

  World.prototype.updateSteam = function (dt) {
    for (var i = this.steamPuffs.length - 1; i >= 0; i--) {
      var p = this.steamPuffs[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.r += 9 * dt;
      if (p.life > p.max) this.steamPuffs.splice(i, 1);
    }
  };

  /* -------------------------------------------------------- thermometers */

  World.prototype.readThermometer = function (th) {
    if (!th.attachedTo) return null;
    var it = this.byId(th.attachedTo);
    if (!it) { th.attachedTo = null; th.onShelf = true; return null; }
    return it;
  };

  World.prototype.recordSamples = function () {
    for (var i = 0; i < this.thermometers.length; i++) {
      var th = this.thermometers[i];
      var it = this.readThermometer(th);
      if (!it) continue;
      var last = th.samples.length ? th.samples[th.samples.length - 1] : null;
      if (!last || this.time - last.t >= 0.2) {
        th.samples.push({ t: this.time, temp: it.temp });
        if (th.samples.length > 4000) th.samples.shift();
      }
    }
  };

  /* ------------------------------------------------------------- energy */

  World.prototype.totalEnergy = function () {
    var e = 0, i;
    for (i = 0; i < this.items.length; i++) if (this.items[i].sub) e += this.items[i].energy;
    // The hotplates are part of the system too - a heater left on with nothing
    // on it is still storing the energy it was given.
    for (i = 0; i < this.stations.length; i++) e += this.stations[i].plate.energy;
    return e;
  };

  /* Energy is conserved: whatever is in the things now should equal what we
   * started with, plus what the heaters added, minus what the coolers took,
   * what drifted into the room and what floated off as steam. The energy
   * view shows these numbers so the claim is checkable, not just asserted. */
  World.prototype.audit = function () {
    var L = this.ledger;
    var expected = L.seeded + L.in - L.out - L.room - L.steam - L.removed;
    var actual = this.totalEnergy();
    return { expected: expected, actual: actual, drift: actual - expected, ledger: L };
  };

  World.prototype.hottest = function () {
    var best = null;
    for (var i = 0; i < this.items.length; i++) {
      if (!this.items[i].sub) continue;
      if (!best || this.items[i].temp > best.temp) best = this.items[i];
    }
    return best;
  };

  HL.World = World;
  HL.TUNING = TUNING;
  HL.WORLD_W = W;
  HL.WORLD_H = H;
  HL.BENCH_Y = BENCH_Y;
})();
