/* Heat Lab - artwork.
 *
 * Everything is drawn procedurally so there are no image files to load and
 * the whole thing stays crisp from an iPad up to a 4K whiteboard. Each item
 * "form" gets a draw function; adding a substance usually means reusing one
 * of these rather than writing new art.
 *
 * Melting is handled the same way for every solid: the solid part shrinks and
 * a puddle spreads underneath it. That one rule covers ice, chocolate, butter,
 * wax, gallium and ice cream.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  /* ---------------------------------------------------------- colour help */

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function mix(aHex, bHex, t) { return rgb(mixRgb(hexToRgb(aHex), hexToRgb(bHex), t)); }
  function shade(hex, t) {
    var c = hexToRgb(hex);
    return t < 0 ? rgb(mixRgb(c, [0, 0, 0], -t)) : rgb(mixRgb(c, [255, 255, 255], t));
  }
  HL.mix = mix;
  HL.shade = shade;

  /* Heat scale. Ordered light-to-dark-to-light is a trap for colour-blind
   * readers, so this ramp changes LIGHTNESS monotonically as well as hue, and
   * every read-out that uses it also prints the number. */
  var HEAT_STOPS = [
    [-40, '#1b3a6b'], [-20, '#2a5e9e'], [-5, '#4a8fc0'], [5, '#8fc2d8'],
    [20, '#dfd8c8'], [40, '#f0c069'], [70, '#e88c33'], [100, '#d4551f'],
    [150, '#b02d18'], [250, '#f2e05a'], [400, '#fdf6c9']
  ];
  HL.heatColor = function (t) {
    if (t <= HEAT_STOPS[0][0]) return HEAT_STOPS[0][1];
    for (var i = 1; i < HEAT_STOPS.length; i++) {
      if (t <= HEAT_STOPS[i][0]) {
        var a = HEAT_STOPS[i - 1], b = HEAT_STOPS[i];
        return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return HEAT_STOPS[HEAT_STOPS.length - 1][1];
  };
  HL.HEAT_STOPS = HEAT_STOPS;

  /* ----------------------------------------------------------- primitives */

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  HL.roundRect = roundRect;

  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  }

  /* A deterministic wobble, so nothing jitters randomly between frames. */
  function wob(item, t, k) {
    return Math.sin(t * 2.1 + item.wobble + k) * 0.5 + Math.sin(t * 3.7 + item.wobble * 2 + k) * 0.5;
  }

  /* ------------------------------------------------------------- surfaces */

  /* What colour is this item right now? Melting lerps solid to liquid, and
   * burning darkens whatever it was. */
  function bodyColor(item, view) {
    if (view && view.heatCamera) return HL.heatColor(item.temp);
    var cols = item.sub ? item.sub.colors : { solid: '#c9ced4', solidEdge: '#8d949c' };
    var base = cols.solid || '#c9ced4';
    if (item.meltFrac > 0 && cols.liquid) base = mix(base, cols.liquid, Math.min(1, item.meltFrac));
    if (item.burnt) base = mix(base, '#3a2416', 0.7);
    // Metals take on colour as they get hot, the way real metal does.
    if (item.temp > 90 && item.sub && item.sub.cond > 1.5) {
      base = mix(base, '#ff7a2a', Math.min(0.8, (item.temp - 90) / 260));
    }
    return base;
  }

  function edgeColor(item, view) {
    if (view && view.heatCamera) return 'rgba(10,20,35,0.55)';
    var cols = item.sub ? item.sub.colors : {};
    var e = cols.solidEdge || '#8d949c';
    if (item.burnt) e = mix(e, '#241309', 0.7);
    return e;
  }

  /* --------------------------------------------------------------- puddle */

  /* The liquid that has melted out of a solid, pooling at its base. */
  function drawPuddle(ctx, item, view, frac) {
    if (frac <= 0.01) return;
    var cols = item.sub ? item.sub.colors : {};
    var col = view && view.heatCamera ? HL.heatColor(item.temp) : (cols.liquid || '#8fc2d8');
    if (item.burnt) col = mix(col, '#3a2416', 0.7);
    var w = item.w * (0.6 + 0.95 * frac);
    var h = 6 + 11 * frac;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ellipse(ctx, item.x, item.y - h * 0.35, w / 2, h / 2);
    ctx.fillStyle = col;
    ctx.fill();
    // A thin bright rim reads as a wet edge.
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = view && view.heatCamera ? 'rgba(255,255,255,0.35)' : shade(cols.liquid || '#8fc2d8', 0.4);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- forms */

  var FORMS = {};

  FORMS.cube = function (ctx, item, view, t) {
    var solid = 1 - item.meltFrac;
    drawPuddle(ctx, item, view, item.meltFrac);
    if (solid <= 0.02) return;
    var w = item.w * (0.55 + 0.45 * solid);
    var h = item.h * solid;
    var x = item.x - w / 2, y = item.y - h - item.meltFrac * 2;
    var col = bodyColor(item, view);
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, shade(typeof col === 'string' && col[0] === '#' ? col : '#dddddd', 0.25));
    g.addColorStop(1, col);
    roundRect(ctx, x, y, w, h, Math.min(10, w * 0.18));
    ctx.fillStyle = view && view.heatCamera ? col : g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = edgeColor(item, view);
    ctx.stroke();
    if (!(view && view.heatCamera)) {
      // Wax turns from cloudy to clear as it melts, so fade the highlight.
      var clear = item.sub && item.sub.id === 'wax' ? 1 - item.meltFrac : 1;
      ctx.globalAlpha = 0.45 * clear;
      roundRect(ctx, x + w * 0.16, y + h * 0.14, w * 0.3, h * 0.34, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  FORMS.snow = function (ctx, item, view, t) {
    drawPuddle(ctx, item, view, item.meltFrac);
    var solid = 1 - item.meltFrac;
    if (solid <= 0.02) return;
    var col = bodyColor(item, view);
    ctx.fillStyle = col;
    ctx.strokeStyle = edgeColor(item, view);
    ctx.lineWidth = 1.2;
    var n = 7;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rx = item.x + Math.cos(a) * item.w * 0.26;
      var ry = item.y - item.h * 0.42 * solid - Math.sin(a) * item.h * 0.2 * solid;
      ellipse(ctx, rx, ry, item.w * 0.19 * solid + 3, item.h * 0.26 * solid + 3);
      ctx.fill();
    }
    ellipse(ctx, item.x, item.y - item.h * 0.36 * solid, item.w * 0.32, item.h * 0.34 * solid + 2);
    ctx.fill();
  };

  FORMS.block = function (ctx, item, view, t) {
    var solid = 1 - item.meltFrac;
    drawPuddle(ctx, item, view, item.meltFrac);
    if (solid <= 0.02) return;
    var squash = 1 - item.meltFrac * 0.75;
    var w = item.w * (1 + item.meltFrac * 0.35);
    var h = item.h * squash;
    var x = item.x - w / 2, y = item.y - h;
    var col = bodyColor(item, view);
    roundRect(ctx, x, y, w, h, 5 + item.meltFrac * 10);
    ctx.fillStyle = col;
    ctx.fill();
    if (!(view && view.heatCamera)) {
      // Top bevel: reads as a solid block rather than a flat rectangle.
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, w, h * 0.3);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
      ctx.restore();
      if (item.sub && item.sub.id === 'brick') {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + h / 2); ctx.lineTo(x + w - 3, y + h / 2);
        ctx.moveTo(x + w / 2, y + h / 2); ctx.lineTo(x + w / 2, y + h - 3);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = edgeColor(item, view);
    roundRect(ctx, x, y, w, h, 5 + item.meltFrac * 10);
    ctx.stroke();
  };

  FORMS.slab = function (ctx, item, view, t) {
    var solid = 1 - item.meltFrac;
    drawPuddle(ctx, item, view, item.meltFrac);
    if (solid <= 0.02) return;
    // Chocolate slumps: the corners round off and it sags before it goes.
    var sag = item.meltFrac;
    var w = item.w * (1 + sag * 0.3);
    var h = item.h * (1 - sag * 0.7);
    var x = item.x - w / 2, y = item.y - h;
    var col = bodyColor(item, view);
    roundRect(ctx, x, y, w, h, 4 + sag * 14);
    ctx.fillStyle = col;
    ctx.fill();
    if (!(view && view.heatCamera)) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.55 * solid;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      for (var i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(x + (w / 4) * i, y); ctx.lineTo(x + (w / 4) * i, y + h); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
      ctx.globalAlpha = 0.3 * solid;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h * 0.18);
      ctx.restore();
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = edgeColor(item, view);
    roundRect(ctx, x, y, w, h, 4 + sag * 14);
    ctx.stroke();
  };

  FORMS.rock = function (ctx, item, view, t) {
    var col = bodyColor(item, view);
    var w = item.w, h = item.h;
    ctx.beginPath();
    var pts = [[-0.5, 0], [-0.44, -0.55], [-0.2, -0.92], [0.16, -1], [0.45, -0.62], [0.5, -0.1]];
    for (var i = 0; i < pts.length; i++) {
      var px = item.x + pts[i][0] * w, py = item.y + pts[i][1] * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = edgeColor(item, view);
    ctx.stroke();
    if (!(view && view.heatCamera)) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(item.x - w * 0.2, item.y - h * 0.85);
      ctx.lineTo(item.x + w * 0.1, item.y - h * 0.95);
      ctx.lineTo(item.x - w * 0.02, item.y - h * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  FORMS.spoon = function (ctx, item, view, t) {
    var col = bodyColor(item, view);
    var edge = edgeColor(item, view);
    var cx = item.x, top = item.y - item.h;
    // Handle.
    roundRect(ctx, cx - item.w * 0.14, top + item.h * 0.05, item.w * 0.28, item.h * 0.72, item.w * 0.14);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = edge; ctx.stroke();
    // Bowl at the bottom, so it is the end that goes in the water.
    ellipse(ctx, cx, item.y - item.h * 0.13, item.w * 0.42, item.h * 0.15);
    ctx.fillStyle = col; ctx.fill(); ctx.stroke();
    if (!(view && view.heatCamera)) {
      ctx.globalAlpha = 0.4;
      ellipse(ctx, cx - item.w * 0.1, item.y - item.h * 0.15, item.w * 0.16, item.h * 0.05);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  FORMS.scoop = function (ctx, item, view, t) {
    var solid = 1 - item.meltFrac;
    drawPuddle(ctx, item, view, item.meltFrac);
    if (solid <= 0.02) return;
    var col = bodyColor(item, view);
    var r = item.w * 0.5 * (0.6 + 0.4 * solid);
    var cy = item.y - item.h * 0.45 * solid - 2;
    ellipse(ctx, item.x, cy, r, item.h * 0.45 * solid + 4);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = edgeColor(item, view); ctx.stroke();
    if (!(view && view.heatCamera)) {
      // Scoop swirl.
      ctx.globalAlpha = 0.35 * solid;
      ctx.strokeStyle = '#b08a5e'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(item.x, cy, r * 0.55, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  FORMS.puff = function (ctx, item, view, t) {
    var solid = 1 - item.meltFrac;
    drawPuddle(ctx, item, view, item.meltFrac);
    if (solid <= 0.02) return;
    var grow = 1 + item.puff * 0.5;           // marshmallows puff up when warm
    var w = item.w * grow * (0.6 + 0.4 * solid);
    var h = item.h * grow * solid;
    var x = item.x - w / 2, y = item.y - h;
    var col = bodyColor(item, view);
    roundRect(ctx, x, y, w, h, w * 0.32);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = edgeColor(item, view); ctx.stroke();
    if (!(view && view.heatCamera)) {
      ctx.globalAlpha = 0.5;
      ellipse(ctx, item.x - w * 0.16, y + h * 0.26, w * 0.16, h * 0.14);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  FORMS.hand = function (ctx, item, view, t) {
    var col = view && view.heatCamera ? HL.heatColor(item.fixedTemp) : '#e8b48f';
    var x = item.x, y = item.y, w = item.w, h = item.h;
    ctx.fillStyle = col;
    ctx.strokeStyle = view && view.heatCamera ? 'rgba(10,20,35,0.5)' : '#c08a64';
    ctx.lineWidth = 1.8;
    // Palm.
    roundRect(ctx, x - w * 0.34, y - h * 0.58, w * 0.68, h * 0.56, w * 0.18);
    ctx.fill(); ctx.stroke();
    // Four fingers reaching down onto whatever is below.
    for (var i = 0; i < 4; i++) {
      var fx = x - w * 0.28 + i * (w * 0.19);
      roundRect(ctx, fx, y - h * 0.18, w * 0.13, h * 0.2, w * 0.06);
      ctx.fill(); ctx.stroke();
    }
    // Thumb.
    roundRect(ctx, x + w * 0.3, y - h * 0.5, w * 0.16, h * 0.26, w * 0.08);
    ctx.fill(); ctx.stroke();
  };

  /* Fallback for anything without its own art. */
  FORMS.blob = FORMS.block;
  FORMS.liquid = function () { /* drawn by the container it sits in */ };

  HL.FORMS = FORMS;

  /* --------------------------------------------------------- containers */

  /* A container plus whatever is inside it. Liquid fills from the bottom by
   * volume; solid contents sit in the liquid. */
  HL.drawContainer = function (ctx, world, item, view, t) {
    var spec = item.spec;
    var x = item.x - item.w / 2, y = item.y - item.h, w = item.w, h = item.h;
    var wallTop = y + h * 0.06;
    var inner = { x: x + w * 0.09, y: wallTop, w: w * 0.82, h: h * 0.86 };

    // Liquid inside, by volume.
    var liq = world.liquidMass(item);
    var contents = [];
    for (var i = 0; i < item.contents.length; i++) {
      var c = world.byId(item.contents[i]);
      if (c) contents.push(c);
    }
    if (liq > 0) {
      var frac = Math.min(1, liq / item.capacity);
      var lh = inner.h * frac * 0.92;
      var ly = inner.y + inner.h - lh;
      // Average the liquids' colour and temperature for the fill.
      var lc = null, warmest = -999, lmass = 0;
      for (i = 0; i < contents.length; i++) {
        var cc = contents[i];
        if (!(cc.state === 'liquid' || cc.state === 'boiling' || cc.state === 'gas')) continue;
        var col = (cc.sub.colors.liquid || '#5aa9d6');
        lc = lc === null ? hexToRgb(col) : mixRgb(lc, hexToRgb(col), cc.mass / (lmass + cc.mass));
        lmass += cc.mass;
        if (cc.temp > warmest) warmest = cc.temp;
      }
      if (lc) {
        ctx.save();
        roundRect(ctx, inner.x, ly, inner.w, lh, 4);
        ctx.clip();
        ctx.fillStyle = view.heatCamera ? HL.heatColor(warmest) : rgb(lc);
        ctx.fillRect(inner.x, ly, inner.w, lh);
        if (!view.heatCamera) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(inner.x, ly, inner.w, 4);
        }
        ctx.restore();
        // A moving surface line. Thick, cold liquids barely ripple; warm
        // ones slosh; boiling ones churn. This is what "honey thins when
        // warm" looks like without needing a separate viscosity model.
        var churn = Math.max(0.25, Math.min(4, (warmest + 12) / 32));
        if (warmest >= 99) churn = 4;
        ctx.beginPath();
        ctx.moveTo(inner.x, ly);
        for (var sx = 0; sx <= inner.w; sx += 8) {
          ctx.lineTo(inner.x + sx, ly + Math.sin(t * 4 + sx * 0.08) * churn);
        }
        ctx.strokeStyle = view.heatCamera ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Bubbles when it boils.
        var boiler = null;
        for (i = 0; i < contents.length; i++) if (contents[i].state === 'boiling') boiler = contents[i];
        if (boiler && !view.reducedMotion) {
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          for (i = 0; i < 9; i++) {
            var ph = (t * 1.5 + i * 0.37) % 1;
            var bx = inner.x + inner.w * (0.12 + 0.76 * ((i * 0.37) % 1));
            var by = inner.y + inner.h - ph * lh;
            var br = 2 + 3 * ph;
            ellipse(ctx, bx, by, br, br);
            ctx.fill();
          }
        }
      }
    }

    // Solid contents sitting in the container.
    for (i = 0; i < contents.length; i++) {
      var s = contents[i];
      if (s.state === 'liquid' || s.state === 'boiling' || s.state === 'gas') continue;
      var fn = FORMS[s.form] || FORMS.block;
      var keepX = s.x, keepY = s.y;
      s.x = item.x + (i - (contents.length - 1) / 2) * Math.min(26, inner.w * 0.22);
      s.y = inner.y + inner.h - 4;
      if (s.form === 'spoon') s.y = inner.y + inner.h + 2;
      ctx.save();
      fn(ctx, s, view, t);
      ctx.restore();
      s.x = keepX; s.y = keepY;
    }

    // The vessel itself, drawn over the contents so it contains them.
    var body = view.heatCamera ? HL.heatColor(item.temp) : spec.colors.body;
    var edge = view.heatCamera ? 'rgba(10,20,35,0.5)' : spec.colors.edge;
    ctx.lineWidth = Math.max(3, w * 0.035);
    ctx.strokeStyle = edge;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.06, wallTop);
    ctx.lineTo(x + w * 0.09, y + h * 0.95);
    ctx.quadraticCurveTo(x + w * 0.1, y + h, x + w * 0.2, y + h);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.quadraticCurveTo(x + w * 0.9, y + h, x + w * 0.91, y + h * 0.95);
    ctx.lineTo(x + w * 0.94, wallTop);
    ctx.stroke();
    // Walls get a translucent body so glass reads as glass.
    ctx.globalAlpha = spec.id === 'beaker' ? 0.22 : 0.85;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.06, wallTop);
    ctx.lineTo(x + w * 0.09, y + h * 0.95);
    ctx.quadraticCurveTo(x + w * 0.1, y + h, x + w * 0.2, y + h);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.quadraticCurveTo(x + w * 0.9, y + h, x + w * 0.91, y + h * 0.95);
    ctx.lineTo(x + w * 0.94, wallTop);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // Rim.
    ellipse(ctx, item.x, wallTop, w * 0.44, h * 0.045);
    ctx.fillStyle = view.heatCamera ? body : shade(spec.colors.body, 0.2);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke();
    if (spec.id === 'mug' && !view.heatCamera) {
      ctx.beginPath();
      ctx.arc(x + w * 0.94, y + h * 0.5, h * 0.22, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.lineWidth = Math.max(4, w * 0.055);
      ctx.strokeStyle = spec.colors.edge;
      ctx.stroke();
    }
    if (spec.id === 'pot' && !view.heatCamera) {
      // Two side handles, so a pot reads as a pot at a glance.
      ctx.lineWidth = Math.max(5, w * 0.05);
      ctx.strokeStyle = spec.colors.edge;
      ctx.lineCap = 'round';
      for (var hs = -1; hs <= 1; hs += 2) {
        ctx.beginPath();
        ctx.moveTo(item.x + hs * w * 0.45, wallTop + h * 0.14);
        ctx.lineTo(item.x + hs * w * 0.6, wallTop + h * 0.1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    if (spec.id === 'beaker' && !view.heatCamera) {
      ctx.strokeStyle = 'rgba(90,120,135,0.55)';
      ctx.lineWidth = 1.5;
      for (i = 1; i <= 3; i++) {
        var gy = inner.y + inner.h * (i / 4);
        ctx.beginPath(); ctx.moveTo(x + w * 0.6, gy); ctx.lineTo(x + w * 0.86, gy); ctx.stroke();
      }
    }
  };

  /* ------------------------------------------------------------- effects */

  /* Frost creeping over something very cold. */
  HL.drawFrost = function (ctx, item, t) {
    if (item.frost < 0.05) return;
    var n = Math.round(4 + item.frost * 8);
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, item.frost);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + item.wobble;
      var cx = item.x + Math.cos(a) * item.w * 0.36;
      var cy = item.y - item.h * 0.5 + Math.sin(a) * item.h * 0.34;
      var len = 4 + item.frost * 7;
      ctx.beginPath();
      for (var k = 0; k < 3; k++) {
        var b = a + k * 2.09;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(b) * len, cy + Math.sin(b) * len);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  /* Sizzle specks for hot fats. */
  HL.drawSizzle = function (ctx, item, t) {
    if (item.sizzle < 0.1) return;
    ctx.save();
    ctx.globalAlpha = item.sizzle * 0.8;
    ctx.fillStyle = '#fff3d0';
    for (var i = 0; i < 7; i++) {
      var ph = (t * 2.2 + i * 0.41) % 1;
      var sx = item.x + Math.sin(i * 2.7 + item.wobble) * item.w * 0.4;
      var sy = item.y - 6 - ph * 22;
      var r = 2.2 * (1 - ph);
      ellipse(ctx, sx, sy, r, r);
      ctx.fill();
    }
    ctx.restore();
  };

  /* Condensation droplets on a cold surface near something boiling. */
  HL.drawDroplets = function (ctx, item, t, amount) {
    if (amount < 0.05) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, amount);
    ctx.fillStyle = '#e8f6ff';
    ctx.strokeStyle = 'rgba(90,150,180,0.5)';
    ctx.lineWidth = 0.8;
    for (var i = 0; i < 8; i++) {
      var dx = item.x + Math.sin(i * 1.9 + item.wobble) * item.w * 0.38;
      var dy = item.y - item.h * (0.18 + 0.6 * ((i * 0.37) % 1)) + Math.sin(t + i) * 0.6;
      ellipse(ctx, dx, dy, 2.2, 3.2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };

  /* Insulation wrapped around a container. */
  HL.drawWrap = function (ctx, item, view, t) {
    if (!item.wrap) return;
    var wr = HL.wrapById(item.wrap);
    if (!wr) return;
    var x = item.x - item.w / 2 - 5, y = item.y - item.h * 0.78, w = item.w + 10, h = item.h * 0.66;
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = view.heatCamera ? HL.heatColor(HL.ROOM_TEMP + (item.temp - HL.ROOM_TEMP) * 0.25) : wr.color;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.stroke();
    if (!view.heatCamera) {
      ctx.clip();
      ctx.globalAlpha = 0.35;
      if (wr.pattern === 'bubble') {
        ctx.fillStyle = '#ffffff';
        for (var by = y + 7; by < y + h; by += 12) {
          for (var bx = x + 7; bx < x + w; bx += 12) { ellipse(ctx, bx, by, 4, 4); ctx.fill(); }
        }
      } else if (wr.pattern === 'foil') {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        for (var fx = x; fx < x + w; fx += 7) {
          ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx + 5, y + h); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        for (var wy = y + 5; wy < y + h; wy += 8) {
          ctx.beginPath();
          for (var sx2 = x; sx2 < x + w; sx2 += 6) ctx.lineTo(sx2, wy + (sx2 % 12 < 6 ? 2 : -2));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  };

  /* What should we CALL this right now? A fully melted ice cube is water,
   * and saying so is part of the lesson. */
  HL.itemName = function (item) {
    if (!item) return '';
    if (item.sub && !item.sub.isMystery && item.meltFrac >= 1 && item.kind !== 'container'
        && item.sub.label && item.sub.label !== item.label) {
      return item.sub.label;
    }
    return item.label;
  };

  /* A soft halo around anything hot, and a cold bloom around anything well
   * below freezing. Colour alone is never the whole story here - the
   * thermometers and read-outs always give the number - but a student should
   * be able to see at a glance which end of the bench is dangerous. */
  function drawAura(ctx, item, view) {
    if (view.heatCamera || view.quality === 'low') return;
    var t = item.temp;
    var hot = t > 55 ? Math.min(1, (t - 55) / 160) : 0;
    var cold = t < -4 ? Math.min(1, (-4 - t) / 26) : 0;
    if (hot < 0.04 && cold < 0.04) return;
    var cx = item.x, cy = item.y - item.h * 0.5;
    var r = Math.max(item.w, item.h) * 0.9 + 26;
    var g = ctx.createRadialGradient(cx, cy, Math.max(4, r * 0.25), cx, cy, r);
    if (hot >= cold) {
      g.addColorStop(0, 'rgba(255,140,45,' + (0.42 * hot).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,120,20,0)');
    } else {
      g.addColorStop(0, 'rgba(120,200,255,' + (0.36 * cold).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,200,255,0)');
    }
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  HL.drawItem = function (ctx, world, item, view, t) {
    if (item.sub) drawAura(ctx, item, view);
    if (item.kind === 'container') {
      HL.drawContainer(ctx, world, item, view, t);
      HL.drawWrap(ctx, item, view, t);
      return;
    }
    var fn = FORMS[item.form] || FORMS.block;
    fn(ctx, item, view, t);
    if (!view.heatCamera) {
      HL.drawFrost(ctx, item, t);
      HL.drawSizzle(ctx, item, t);
      if (item.condensation) HL.drawDroplets(ctx, item, t, item.condensation);
    }
    HL.drawWrap(ctx, item, view, t);
  };
})();
