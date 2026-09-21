/* Heat Lab - the bench renderer.
 *
 * Draws the lab bench, the heater/cooler stations, every item, the
 * thermometers, the steam, and the two overlays (energy chunks and the heat
 * camera). It reads the world and never writes to it, apart from the purely
 * visual fields it owns (condensation, chunk positions).
 */
(function () {
  var HL = (window.HL = window.HL || {});

  // The bench width is per-world (it adapts to the screen), so it is always
  // passed in rather than read from a constant here.
  var H = HL.WORLD_H, BENCH_Y = HL.BENCH_Y;
  var SLIDER = { y: 548, h: 18, w: 168, knob: 19 };
  HL.SLIDER = SLIDER;

  /* ------------------------------------------------------- energy chunks */

  /* Small labelled parcels of energy that travel along a real transfer. They
   * are a picture of something the model actually computed, not decoration:
   * the spawn rate is proportional to the measured flow. */
  var chunks = [];
  var accum = {};

  function pointOf(world, ref, item) {
    if (ref === 'room') {
      return { x: item ? item.x + 40 : world.W / 2, y: item ? item.y - item.h - 60 : 80 };
    }
    if (ref.kind === 'plate') {
      for (var i = 0; i < world.stations.length; i++) {
        if (world.stations[i].plate === ref) {
          return { x: world.stations[i].x, y: world.stations[i].y - world.stations[i].h + 8 };
        }
      }
      return { x: world.W / 2, y: BENCH_Y };
    }
    var host = ref.containerId ? (world.byId(ref.containerId) || ref) : ref;
    return { x: host.x, y: host.y - host.h * 0.5 };
  }

  function spawnChunks(world, dt, view) {
    if (!view.energyView) { chunks.length = 0; return; }
    var max = view.quality === 'low' ? 24 : (view.reducedMotion ? 30 : 70);
    for (var i = 0; i < (world.transferCount || 0); i++) {
      var tr = world.transfers[i];
      if (tr.q < 0.05) continue;
      var other = tr.from === 'room' ? tr.to : tr.from;
      var key = (tr.from === 'room' ? 'room' : tr.from.id) + '>' + (tr.to === 'room' ? 'room' : tr.to.id);
      // One chunk per this many energy units, so a big flow looks busy.
      var per = 1.6;
      accum[key] = (accum[key] || 0) + tr.q * dt;
      while (accum[key] >= per && chunks.length < max) {
        accum[key] -= per;
        var a = pointOf(world, tr.from, other);
        var b = pointOf(world, tr.to, other);
        chunks.push({
          x: a.x + (Math.random() - 0.5) * 16, y: a.y + (Math.random() - 0.5) * 16,
          tx: b.x + (Math.random() - 0.5) * 16, ty: b.y + (Math.random() - 0.5) * 16,
          p: 0, speed: 1 / (0.75 + Math.random() * 0.5),
          toRoom: tr.to === 'room'
        });
      }
      if (accum[key] > per * 4) accum[key] = per * 4;
    }
  }

  function updateChunks(dt) {
    for (var i = chunks.length - 1; i >= 0; i--) {
      var c = chunks[i];
      c.p += dt * c.speed;
      if (c.p >= 1) chunks.splice(i, 1);
    }
  }

  function drawChunks(ctx, view) {
    if (!view.energyView || !chunks.length) return;
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      var e = c.p * c.p * (3 - 2 * c.p);            // ease, so it does not look robotic
      var x = c.x + (c.tx - c.x) * e;
      var y = c.y + (c.ty - c.y) * e - Math.sin(c.p * Math.PI) * 14;
      var fade = c.toRoom ? 1 - c.p * 0.8 : 1;
      ctx.globalAlpha = fade;
      HL.roundRect(ctx, x - 9, y - 8, 18, 16, 5);
      ctx.fillStyle = '#f5a524';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(120,60,0,0.55)';
      ctx.stroke();
      ctx.fillStyle = '#3a2000';
      ctx.fillText('E', x, y + 0.5);
    }
    ctx.restore();
  }

  HL.resetChunks = function () { chunks.length = 0; accum = {}; };

  /* -------------------------------------------------------------- bench */

  function drawBackground(ctx, view, W) {
    var g = ctx.createLinearGradient(0, -(view.topExtra || 0), 0, H);
    if (view.heatCamera) {
      g.addColorStop(0, '#0c1424'); g.addColorStop(1, '#131b2c');
    } else {
      g.addColorStop(0, '#eef3f6'); g.addColorStop(1, '#dbe4ea');
    }
    // Painted well outside the world box: whichever way the bench is
    // letterboxed, the wall runs to the edge of the screen.
    ctx.fillStyle = g;
    ctx.fillRect(-2000, -2000, W + 4000, H + 4000);

    if (!view.heatCamera) {
      // A soft horizon behind the bench. Enough to read as a room, without
      // any of the cartoon clutter this needs to stay clear of.
      var hz = ctx.createLinearGradient(0, BENCH_Y - 210, 0, BENCH_Y);
      hz.addColorStop(0, 'rgba(255,255,255,0)');
      hz.addColorStop(1, 'rgba(255,255,255,0.45)');
      ctx.fillStyle = hz;
      ctx.fillRect(-2000, BENCH_Y - 210, W + 4000, 210);
    }
  }

  function drawBench(ctx, view, W) {
    var topCol = view.heatCamera ? '#1d2740' : '#b9a184';
    var faceCol = view.heatCamera ? '#151d31' : '#8d7458';
    // Bench top.
    ctx.fillStyle = topCol;
    HL.roundRect(ctx, 14, BENCH_Y, W - 28, 22, 5);
    ctx.fill();
    ctx.fillStyle = faceCol;
    ctx.fillRect(14, BENCH_Y + 18, W - 28, 10);
    if (!view.heatCamera) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(14, BENCH_Y, W - 28, 4);
    }
  }

  function drawStation(ctx, world, st, view, t) {
    var x = st.x, y = st.y, w = st.w, h = st.h;
    var plateT = st.plate.temp;
    var heat = Math.max(0, st.power), cool = Math.max(0, -st.power);

    // The glow under a heater, or the frost bloom under a cooler.
    if (view.quality === 'low') {
      // Skipped on slow hardware - the plate colour and its number still say
      // exactly how hot it is.
    } else if (heat > 0.02 && !view.reducedMotion) {
      var flick = 1 + Math.sin(t * 9 + st.index) * 0.04;
      var g = ctx.createRadialGradient(x, y - h + 6, 4, x, y - h + 6, (70 + heat * 60) * flick);
      g.addColorStop(0, 'rgba(255,150,40,' + (0.55 * heat).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 150, y - h - 130, 300, 190);
    } else if (cool > 0.02) {
      var g2 = ctx.createRadialGradient(x, y - h + 6, 4, x, y - h + 6, 70 + cool * 50);
      g2.addColorStop(0, 'rgba(120,200,255,' + (0.45 * cool).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(x - 140, y - h - 120, 280, 180);
    }

    // Body of the station.
    var bodyCol = view.heatCamera ? '#232f4c' : '#6f7b86';
    HL.roundRect(ctx, x - w / 2, y - h, w, h, 8);
    ctx.fillStyle = bodyCol;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = view.heatCamera ? 'rgba(10,20,35,0.6)' : '#4d5862';
    ctx.stroke();

    // The hotplate itself, coloured by its real temperature.
    var plateCol = view.heatCamera ? HL.heatColor(plateT)
      : (heat > 0.02 ? HL.mix('#6b737c', '#ff6a1e', Math.min(1, heat * 0.9 + Math.max(0, (plateT - 60) / 260)))
        : cool > 0.02 ? HL.mix('#6b737c', '#bfe6ff', Math.min(1, cool)) : '#6b737c');
    HL.roundRect(ctx, x - w / 2 + 8, y - h + 4, w - 16, 16, 5);
    ctx.fillStyle = plateCol;
    ctx.fill();
    if (cool > 0.3 && !view.heatCamera) {
      // Frost creeping across a cooling plate.
      ctx.save();
      ctx.globalAlpha = Math.min(0.8, (cool - 0.3) * 1.6);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      for (var i = 0; i < 9; i++) {
        var fx = x - w / 2 + 14 + i * ((w - 28) / 8);
        ctx.beginPath();
        ctx.moveTo(fx, y - h + 6); ctx.lineTo(fx + 4, y - h + 18);
        ctx.moveTo(fx, y - h + 12); ctx.lineTo(fx - 4, y - h + 17);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Plate temperature, always a number as well as a colour.
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = view.heatCamera ? '#dfe8f5' : '#eef3f6';
    ctx.fillText(Math.round(plateT) + '°C', x, y - h + 38);

    drawSlider(ctx, st, view);
  }

  function drawSlider(ctx, st, view) {
    var x = st.x, y = SLIDER.y, w = st.sliderW || SLIDER.w;
    var left = x - w / 2;

    // Control panel, so the slider reads as part of the equipment rather
    // than floating under the bench.
    HL.roundRect(ctx, x - w / 2 - 32, y - 26, w + 64, 62, 12);
    ctx.fillStyle = view.heatCamera ? 'rgba(40,55,86,0.9)' : '#59646f';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = view.heatCamera ? 'rgba(10,20,35,0.6)' : '#414b55';
    ctx.stroke();
    // Track: blue for cooling, neutral in the middle, orange for heating.
    var g = ctx.createLinearGradient(left, 0, left + w, 0);
    g.addColorStop(0, '#2e7fc4');
    g.addColorStop(0.42, '#9fb0bd');
    g.addColorStop(0.5, '#8d98a3');
    g.addColorStop(0.58, '#d9a05a');
    g.addColorStop(1, '#e2571c');
    HL.roundRect(ctx, left, y, w, SLIDER.h, SLIDER.h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(20,32,44,0.55)';
    ctx.stroke();

    // Centre notch marks "off".
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - 1.5, y - 6, 3, SLIDER.h + 12);

    // Knob - deliberately large, it is a touch target on a whiteboard.
    var kx = x + st.power * (w / 2 - SLIDER.knob * 0.7);
    ctx.beginPath();
    ctx.arc(kx, y + SLIDER.h / 2, SLIDER.knob, 0, Math.PI * 2);
    ctx.fillStyle = st.locked ? '#b9c2ca' : '#fbfdff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = st.power > 0.02 ? '#d1500f' : st.power < -0.02 ? '#1f6ea8' : '#49535d';
    ctx.stroke();
    // Grip lines, so the knob looks grabbable.
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(80,95,110,0.6)';
    for (var gi = -1; gi <= 1; gi++) {
      ctx.beginPath();
      ctx.moveTo(kx + gi * 5, y + SLIDER.h / 2 - 6);
      ctx.lineTo(kx + gi * 5, y + SLIDER.h / 2 + 6);
      ctx.stroke();
    }

    // Icons at each end: snowflake and flame, no reading required.
    ctx.save();
    var sy = y + SLIDER.h / 2;
    ctx.strokeStyle = '#8fd0f5';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    var sx = left - 18;
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(a) * 10, sy - Math.sin(a) * 10);
      ctx.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10);
      ctx.stroke();
    }
    var fx = left + w + 18;
    ctx.fillStyle = '#ffa25c';
    ctx.beginPath();
    ctx.moveTo(fx, sy - 13);
    ctx.quadraticCurveTo(fx + 10, sy - 2, fx + 4, sy + 10);
    ctx.quadraticCurveTo(fx, sy + 3, fx - 4, sy + 10);
    ctx.quadraticCurveTo(fx - 10, sy - 2, fx, sy - 13);
    ctx.fill();
    ctx.restore();
  }

  /* -------------------------------------------------------------- steam */

  function drawSteam(ctx, world, view) {
    if (!world.steamPuffs.length) return;
    ctx.save();
    for (var i = 0; i < world.steamPuffs.length; i++) {
      var p = world.steamPuffs[i];
      var life = p.life / p.max;
      ctx.globalAlpha = (1 - life) * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = view.heatCamera ? '#b8452a' : '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------- thermometers */

  var RACK_X = 26, RACK_Y = 120;

  function thermoPos(world, th) {
    if (th.dragging) return { x: th.x, y: th.y };
    var it = world.readThermometer(th);
    if (it) {
      var host = it.containerId ? (world.byId(it.containerId) || it) : it;
      return { x: host.x + host.w * 0.5 + 4, y: host.y - host.h - 6 };
    }
    return { x: th.x, y: th.y };
  }
  HL.thermoPos = thermoPos;

  var labelRects = [];

  /* Find a clear spot for this read-out by stepping it upwards past any
   * already drawn. Four thermometers on neighbouring items is a normal thing
   * to do, and the numbers are the whole point - they must not hide. */
  function clearLabelY(x, y, w, h) {
    for (var attempt = 0; attempt < 6; attempt++) {
      var clash = false;
      for (var i = 0; i < labelRects.length; i++) {
        var r = labelRects[i];
        if (x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) { clash = true; break; }
      }
      if (!clash) break;
      y -= h + 6;
    }
    labelRects.push({ x: x, y: y, w: w, h: h });
    return y;
  }

  function drawThermometer(ctx, world, th, view) {
    var p = thermoPos(world, th);
    var it = world.readThermometer(th);
    var temp = it ? it.temp : null;
    var x = p.x, y = p.y;

    // Stem and bulb.
    ctx.save();
    HL.roundRect(ctx, x - 7, y - 58, 14, 58, 7);
    ctx.fillStyle = view.heatCamera ? 'rgba(230,240,255,0.85)' : '#f7fbfd';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = th.color;
    ctx.stroke();
    // Mercury column: -20 at the bottom, 120 at the top.
    if (temp !== null) {
      var frac = Math.max(0, Math.min(1, (temp + 20) / 140));
      var colH = 44 * frac;
      HL.roundRect(ctx, x - 3.5, y - 10 - colH, 7, colH + 6, 3.5);
      ctx.fillStyle = th.color;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y - 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = th.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.stroke();

    // The read-out. Colour is paired with the number, always.
    if (temp !== null) {
      var label = temp.toFixed(temp > -10 && temp < 100 ? 1 : 0) + '°C';
      ctx.font = '700 17px system-ui, sans-serif';
      var tw = ctx.measureText(label).width;
      var lx = x + 11;
      var ly = clearLabelY(lx, y - 72, tw + 16, 26);
      HL.roundRect(ctx, lx, ly, tw + 16, 26, 7);
      ctx.fillStyle = 'rgba(12,22,34,0.88)';
      ctx.fill();
      ctx.strokeStyle = th.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 8, ly + 13);
      // Which thermometer is this? Number it, for the graph legend.
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(String(th.index + 1), x, y - 2);
    } else {
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(th.index + 1), x, y - 2);
    }
    ctx.restore();
  }

  /* Park the unused thermometers in a rack at the side of the bench. */
  function layoutRack(world) {
    var slot = 0;
    for (var i = 0; i < world.thermometers.length; i++) {
      var th = world.thermometers[i];
      if (th.attachedTo || th.dragging) continue;
      th.x = RACK_X + 4;
      th.y = RACK_Y + slot * 76;
      slot++;
    }
  }

  function drawRack(ctx, world, view) {
    var used = 0;
    for (var i = 0; i < world.thermometers.length; i++) if (!world.thermometers[i].attachedTo) used++;
    if (!used) return;
    HL.roundRect(ctx, RACK_X - 16, RACK_Y - 66, 44, used * 76 + 4, 10);
    ctx.fillStyle = view.heatCamera ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = view.heatCamera ? 'rgba(180,200,225,0.25)' : 'rgba(120,145,160,0.45)';
    ctx.stroke();
  }

  /* -------------------------------------------------------------- legend */

  function drawHeatLegend(ctx, W) {
    var x = W - 168, y = 24, w = 144, h = 16;
    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    var stops = HL.HEAT_STOPS;
    for (var i = 0; i < stops.length; i++) {
      var p = (stops[i][0] + 40) / 440;
      if (p >= 0 && p <= 1) g.addColorStop(p, stops[i][1]);
    }
    HL.roundRect(ctx, x - 10, y - 18, w + 20, h + 40, 8);
    ctx.fillStyle = 'rgba(8,14,26,0.72)';
    ctx.fill();
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#e8eef8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var ticks = [-40, 0, 100, 200, 400];
    for (i = 0; i < ticks.length; i++) {
      var tx = x + ((ticks[i] + 40) / 440) * w;
      ctx.fillText(ticks[i] + '°', Math.max(x + 10, Math.min(x + w - 10, tx)), y + h + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillText(HL.L('tool.camera'), x - 6, y - 15);
  }

  function drawEnergyPanel(ctx, world) {
    var a = world.audit();
    function signed(v, sign) {
      var n = Math.round(v);
      return n === 0 ? '0' : sign + n;
    }
    var lines = [
      [HL.L('energy.in'), signed(a.ledger.in, '+')],
      [HL.L('energy.out'), signed(a.ledger.out, '-')],
      [HL.L('energy.room'), signed(Math.abs(a.ledger.room), a.ledger.room >= 0 ? '-' : '+')],
      [HL.L('energy.total'), String(Math.round(a.actual))]
    ];
    var x = 86, y = 22, w = 212, h = 22 + lines.length * 19;
    HL.roundRect(ctx, x, y, w, h, 9);
    ctx.fillStyle = 'rgba(8,14,26,0.72)';
    ctx.fill();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < lines.length; i++) {
      var ly = y + 19 + i * 19;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c8d6ea';
      ctx.fillText(lines[i][0], x + 12, ly);
      ctx.textAlign = 'right';
      ctx.fillStyle = i === 3 ? '#f5a524' : '#ffffff';
      ctx.fillText(lines[i][1], x + w - 12, ly);
    }
  }

  /* ------------------------------------------------------- condensation */

  /* Steam meeting a cold surface leaves droplets. This is a visual cue only -
   * the energy involved is tiny next to the flows the model tracks. */
  function updateCondensation(world, dt) {
    var boiling = [];
    for (var i = 0; i < world.items.length; i++) {
      if (world.items[i].state === 'boiling') boiling.push(world.items[i]);
    }
    for (i = 0; i < world.items.length; i++) {
      var it = world.items[i];
      var want = 0;
      if (it.temp < 14 && boiling.length) {
        for (var j = 0; j < boiling.length; j++) {
          if (Math.abs(boiling[j].x - it.x) < 260) { want = Math.min(1, (14 - it.temp) / 14); break; }
        }
      }
      it.condensation = (it.condensation || 0) + (want - (it.condensation || 0)) * Math.min(1, dt * 0.8);
    }
  }

  /* --------------------------------------------------------------- draw */

  HL.Bench = {
    /* Items are drawn bottom-up so a stack looks like a stack. */
    order: function (world) {
      var list = world.items.slice();
      list.sort(function (a, b) {
        if (a.containerId && !b.containerId) return -1;
        if (b.containerId && !a.containerId) return 1;
        return (a.y - a.h / 2) - (b.y - b.h / 2);
      });
      return list;
    },

    draw: function (ctx, world, view, t, dt) {
      labelRects.length = 0;
      spawnChunks(world, dt, view);
      updateChunks(dt);
      updateCondensation(world, dt);
      layoutRack(world);

      drawBackground(ctx, view, world.W);

      var i;
      for (i = 0; i < world.stations.length; i++) {
        var st = world.stations[i];
        // Station body sits behind the bench top edge.
        drawStation(ctx, world, st, view, t);
      }
      drawBench(ctx, view, world.W);

      var list = this.order(world);
      for (i = 0; i < list.length; i++) {
        var it = list[i];
        if (it.containerId) continue;              // drawn by its container
        if (it.dragging) continue;                 // drawn last, on top
        HL.drawItem(ctx, world, it, view, t);
      }

      drawSteam(ctx, world, view);
      drawChunks(ctx, view);

      drawRack(ctx, world, view);
      for (i = 0; i < world.thermometers.length; i++) {
        if (world.thermometers[i].dragging) continue;
        drawThermometer(ctx, world, world.thermometers[i], view);
      }

      // Whatever is being dragged goes on top of everything.
      for (i = 0; i < list.length; i++) {
        if (list[i].dragging) {
          ctx.save();
          ctx.globalAlpha = 0.92;
          HL.drawItem(ctx, world, list[i], view, t);
          ctx.restore();
        }
      }
      for (i = 0; i < world.thermometers.length; i++) {
        if (world.thermometers[i].dragging) drawThermometer(ctx, world, world.thermometers[i], view);
      }

      if (view.heatCamera) drawHeatLegend(ctx, world.W);
      if (view.energyView) drawEnergyPanel(ctx, world);
      if (view.lens && view.lens.on) HL.drawLens(ctx, world, view, t);

      if (!world.items.length) {
        ctx.font = '600 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = view.heatCamera ? 'rgba(200,215,235,0.6)' : 'rgba(80,100,120,0.55)';
        ctx.fillText(HL.L('msg.draghere'), world.W / 2, BENCH_Y - 150);
      }
    },

    sliderHit: function (world, x, y) {
      for (var i = 0; i < world.stations.length; i++) {
        var st = world.stations[i];
        if (st.locked) continue;
        var sw = st.sliderW || SLIDER.w;
        if (x > st.x - sw / 2 - 34 && x < st.x + sw / 2 + 34 &&
            y > SLIDER.y - 28 && y < SLIDER.y + SLIDER.h + 28) return st;
      }
      return null;
    },

    sliderValue: function (st, x) {
      var v = (x - st.x) / ((st.sliderW || SLIDER.w) / 2 - SLIDER.knob * 0.7);
      v = Math.max(-1, Math.min(1, v));
      if (Math.abs(v) < 0.1) v = 0;               // a generous detent at "off"
      return v;
    },

    thermoHit: function (world, x, y) {
      for (var i = world.thermometers.length - 1; i >= 0; i--) {
        var th = world.thermometers[i];
        var p = thermoPos(world, th);
        if (x > p.x - 18 && x < p.x + 18 && y > p.y - 64 && y < p.y + 14) return th;
      }
      return null;
    }
  };
})();
