/* Heat Lab - the particle lens.
 *
 * A draggable magnifier. Whatever it is over, it shows that material's
 * particles: packed into a lattice and vibrating in a solid, sliding past
 * each other in a liquid, spread out and zooming in a gas. Speed rises with
 * temperature, using absolute temperature so the link is honest - particles
 * slow down as you approach absolute zero and never quite stop.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  var N = 44;
  var parts = [];
  var current = { id: null, mode: 'solid', blend: 0 };

  /* The room air, so the lens always has something honest to show. */
  var AIR = {
    id: '__air', temp: HL.ROOM_TEMP, state: 'gas', meltFrac: 1, boilFrac: 1,
    burnt: false, mass: 1, isAir: true,
    sub: { id: 'air', colors: { solid: '#e4edf2', liquid: '#e4edf2', solidEdge: '#8fa4b4' } }
  };

  function init(r) {
    parts.length = 0;
    var cols = 7, rows = 7, k = 0;
    for (var gy = 0; gy < rows && k < N; gy++) {
      for (var gx = 0; gx < cols && k < N; gx++, k++) {
        var hx = (gx - (cols - 1) / 2) * (r * 0.26);
        var hy = (gy - (rows - 1) / 2) * (r * 0.26);
        parts.push({
          hx: hx, hy: hy,
          x: hx, y: hy,
          vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
          ph: Math.random() * 6.28
        });
      }
    }
  }

  /* Particle speed scales with the square root of absolute temperature, the
   * same way real molecular speeds do. */
  function speedFor(temp) {
    var k = Math.max(20, temp + 273);
    return Math.sqrt(k / 293);
  }

  function update(item, dt, r, reducedMotion) {
    if (!parts.length) init(r);
    var temp = item ? item.temp : HL.ROOM_TEMP;
    var sp = speedFor(temp) * (reducedMotion ? 0.45 : 1);
    var mode = item ? (item.state === 'gas' ? 'gas'
      : (item.state === 'liquid' || item.state === 'boiling') ? 'liquid'
      : item.state === 'melting' ? (item.meltFrac > 0.5 ? 'liquid' : 'solid') : 'solid') : 'solid';
    current.mode = mode;

    var lim = r * 0.82;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (mode === 'solid') {
        // Fixed positions, vibrating in place. This is the key idea for kids:
        // solid particles still move, they just cannot swap places.
        var amp = r * 0.035 * sp;
        p.ph += dt * (2 + sp * 5);
        p.x += ((p.hx + Math.cos(p.ph * 3.1) * amp) - p.x) * Math.min(1, dt * 14);
        p.y += ((p.hy + Math.sin(p.ph * 2.7) * amp) - p.y) * Math.min(1, dt * 14);
      } else if (mode === 'liquid') {
        // Touching, but free to slide past one another.
        p.vx += (Math.random() - 0.5) * 60 * sp * dt * 6;
        p.vy += (Math.random() - 0.5) * 60 * sp * dt * 6;
        var s = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        var target = 26 * sp;
        if (s > 0.01) { p.vx *= target / s; p.vy *= target / s; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        var d = Math.sqrt(p.x * p.x + p.y * p.y);
        if (d > lim * 0.8) { p.x *= (lim * 0.8) / d; p.y *= (lim * 0.8) / d; p.vx = -p.vx * 0.6; p.vy = -p.vy * 0.6; }
      } else {
        // Spread right out and moving fast, bouncing off the lens walls.
        p.x += p.vx * dt * sp * 3.2;
        p.y += p.vy * dt * sp * 3.2;
        var d2 = Math.sqrt(p.x * p.x + p.y * p.y);
        if (d2 > lim) {
          var nx = p.x / d2, ny = p.y / d2;
          var dot = p.vx * nx + p.vy * ny;
          p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny;
          p.x = nx * lim * 0.99; p.y = ny * lim * 0.99;
        }
      }
    }
  }

  HL.drawLens = function (ctx, world, view, t) {
    var lens = view.lens;
    var r = lens.r;
    // What is under the middle of the lens?
    // Probe the middle first, then a ring inside the glass. On a touchscreen
    // nobody lands exactly on a small ice cube, and showing the room air when
    // the lens is clearly over the pot would just look broken.
    var item = world.itemAt(lens.x, lens.y, null);
    if (!item) {
      for (var pr = 0; pr < 8 && !item; pr++) {
        var pa = (pr / 8) * Math.PI * 2;
        item = world.itemAt(lens.x + Math.cos(pa) * r * 0.62,
                            lens.y + Math.sin(pa) * r * 0.62, null);
      }
    }
    if (item && item.kind === 'container' && item.contents.length) {
      // Show what is IN the pot, not the pot itself - that is what students
      // are pointing the lens at.
      var best = null;
      for (var i = 0; i < item.contents.length; i++) {
        var c = world.byId(item.contents[i]);
        if (c && (!best || c.mass > best.mass)) best = c;
      }
      if (best) item = best;
    }
    // Over bare bench the lens shows the ROOM AIR. An empty magnifier just
    // looks broken, and air is a gas worth seeing: widely spaced and fast.
    var isAir = false;
    if (!item) {
      isAir = true;
      item = AIR;
    }
    if (item.id !== current.id) { current.id = item.id; }
    update(item, Math.min(0.05, view.dt || 0.016), r, view.reducedMotion);

    ctx.save();
    // Lens interior.
    ctx.beginPath();
    ctx.arc(lens.x, lens.y, r, 0, Math.PI * 2);
    ctx.clip();
    var bg = view.heatCamera ? HL.heatColor(item.temp)
      : (item.sub && item.sub.colors
        ? (current.mode === 'solid' ? item.sub.colors.solid : (item.sub.colors.liquid || item.sub.colors.solid))
        : '#cfd6dc');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(lens.x - r, lens.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;

    {
      // Particles.
      var pr = current.mode === 'gas' ? r * 0.055 : r * 0.075;
      var core = item.burnt ? '#3a2416' : (item.sub && item.sub.colors ? item.sub.colors.solidEdge || '#5c6268' : '#5c6268');
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        if (current.mode === 'gas' && k % 3 !== 0) continue;   // a gas is mostly empty space
        if (view.quality === 'low' && k % 2 !== 0) continue;
        ctx.beginPath();
        ctx.arc(lens.x + p.x, lens.y + p.y, pr, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(lens.x + p.x - pr * 0.3, lens.y + p.y - pr * 0.3, pr * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      }
    }
    ctx.restore();

    // Lens rim and handle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(lens.x, lens.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#37414d';
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lens.x + r * 0.72, lens.y + r * 0.72);
    ctx.lineTo(lens.x + r * 1.35, lens.y + r * 1.35);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#37414d';
    ctx.stroke();
    ctx.restore();

    // Caption: name the state in the right words for the year level.
    var caption = item.isAir ? HL.L('lens.air')
      : (current.mode === 'gas' ? HL.L('lens.gas') : current.mode === 'liquid' ? HL.L('lens.liquid') : HL.L('lens.solid'));
    if (caption) {
      ctx.save();
      ctx.font = '600 13px system-ui, sans-serif';
      var tw = ctx.measureText(caption).width;
      var cy = lens.y - r - 30;
      HL.roundRect(ctx, lens.x - tw / 2 - 12, cy, tw + 24, 26, 8);
      ctx.fillStyle = 'rgba(12,22,34,0.86)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, lens.x, cy + 13);
      if (item) {
        var tl = Math.round(item.temp) + '°C';
        ctx.font = '700 14px system-ui, sans-serif';
        var tw2 = ctx.measureText(tl).width;
        HL.roundRect(ctx, lens.x - tw2 / 2 - 10, cy + 30, tw2 + 20, 24, 7);
        ctx.fillStyle = 'rgba(12,22,34,0.86)';
        ctx.fill();
        ctx.fillStyle = '#ffd98a';
        ctx.fillText(tl, lens.x, cy + 42);
      }
      ctx.restore();
    }
  };

  HL.lensHit = function (view, x, y) {
    if (!view.lens || !view.lens.on) return false;
    var dx = x - view.lens.x, dy = y - view.lens.y;
    return dx * dx + dy * dy < (view.lens.r + 14) * (view.lens.r + 14);
  };

  HL.resetLens = function () { parts.length = 0; current.id = null; };
})();
