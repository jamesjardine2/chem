/* Heat Lab - the shelf.
 *
 * A real DOM tray rather than part of the canvas, for two reasons: the tiles
 * are proper buttons so the whole shelf works with a keyboard and a screen
 * reader, and they can still be dragged onto the bench with a pointer.
 *
 * Each tile draws its own thumbnail using the same artwork as the bench, so
 * adding a substance to the data file makes a tile appear with no extra work.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  /* A tiny stand-in world, so container thumbnails can be drawn without a
   * real bench behind them. */
  var STUB = { liquidMass: function () { return 0; }, byId: function () { return null; } };
  var THUMB_VIEW = { heatCamera: false, energyView: false, reducedMotion: true };

  function thumbCanvas(w, h, draw) {
    var c = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    draw(ctx, w, h);
    return c;
  }

  /* Draw an item template's artwork scaled to fit the thumbnail box. */
  function drawTemplateThumb(ctx, w, h, tpl) {
    var sub = tpl.sub ? HL.SUBSTANCES[tpl.sub] : null;
    if (sub && sub.isMystery) sub = HL.SUBSTANCES.mystery;
    var iw = tpl.w || 70, ih = tpl.h || 60;
    // Liquids have no standalone artwork, so show them as a filled glass.
    if (tpl.form === 'liquid') {
      var col = sub ? (sub.colors.liquid || '#5aa9d6') : '#5aa9d6';
      var gx = w / 2 - 12, gy = h - 40, gw = 24, gh = 34;
      ctx.fillStyle = col;
      HL.roundRect(ctx, gx + 2, gy + gh * 0.34, gw - 4, gh * 0.62, 3);
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(235,245,252,0.9)';
      ctx.beginPath();
      ctx.moveTo(gx, gy); ctx.lineTo(gx + 2, gy + gh); ctx.lineTo(gx + gw - 2, gy + gh); ctx.lineTo(gx + gw, gy);
      ctx.stroke();
      // Hot or cold gets a hint, so students can tell the three waters apart.
      if (tpl.temp >= 60) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        for (var i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(gx + 7 + i * 10, gy - 3);
          ctx.quadraticCurveTo(gx + 11 + i * 10, gy - 10, gx + 7 + i * 10, gy - 16);
          ctx.stroke();
        }
      } else if (tpl.temp <= 6) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.8;
        for (var k = 0; k < 3; k++) {
          var a = (k / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(w / 2 - Math.cos(a) * 6, gy - 11 - Math.sin(a) * 6);
          ctx.lineTo(w / 2 + Math.cos(a) * 6, gy - 11 + Math.sin(a) * 6);
          ctx.stroke();
        }
      }
      return;
    }
    var scale = Math.min((w - 12) / iw, (h - 12) / ih, 0.86);
    var fake = {
      x: 0, y: 0, w: iw, h: ih, sub: sub, form: tpl.form,
      temp: tpl.temp, state: 'solid', meltFrac: 0, boilFrac: 0,
      burnt: false, frost: tpl.temp < -2 ? Math.min(1, (-2 - tpl.temp) / 14) : 0,
      sizzle: 0, puff: 0, wobble: 1.2, fixedTemp: tpl.fixedTemp || null,
      mass: tpl.mass, cond: 1
    };
    ctx.save();
    ctx.translate(w / 2, h - 8);
    ctx.scale(scale, scale);
    var fn = HL.FORMS[tpl.form] || HL.FORMS.block;
    fn(ctx, fake, THUMB_VIEW, 0);
    if (fake.frost > 0.05) HL.drawFrost(ctx, fake, 0);
    ctx.restore();
  }

  function drawContainerThumb(ctx, w, h, spec) {
    var scale = Math.min((w - 10) / spec.w, (h - 10) / spec.h, 0.62);
    var fake = {
      x: 0, y: 0, w: spec.w, h: spec.h, spec: spec, contents: [],
      capacity: spec.capacity, temp: 20, wrap: null, kind: 'container'
    };
    ctx.save();
    ctx.translate(w / 2, h - 6);
    ctx.scale(scale, scale);
    HL.drawContainer(ctx, STUB, fake, THUMB_VIEW, 0);
    ctx.restore();
  }

  function drawWrapThumb(ctx, w, h, wrap) {
    var fake = {
      x: 0, y: 0, w: 52, h: 46, wrap: wrap.id, temp: 20,
      spec: null, contents: [], kind: 'container'
    };
    ctx.save();
    ctx.translate(w / 2, h - 8);
    ctx.scale(Math.min((w - 8) / 62, 1), Math.min((h - 8) / 40, 1));
    HL.drawWrap(ctx, fake, THUMB_VIEW, 0);
    ctx.restore();
  }

  function drawEraserThumb(ctx, w, h) {
    ctx.save();
    ctx.translate(w / 2, h / 2 - 2);
    ctx.fillStyle = '#e9eef3';
    HL.roundRect(ctx, -16, -11, 32, 22, 6);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#8e9aa6';
    ctx.stroke();
    ctx.strokeStyle = '#e2571c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9, -6); ctx.lineTo(9, 6);
    ctx.moveTo(9, -6); ctx.lineTo(-9, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawThermoThumb(ctx, w, h, color) {
    ctx.save();
    ctx.translate(w / 2, h / 2 + 14);
    HL.roundRect(ctx, -7, -40, 14, 40, 7);
    ctx.fillStyle = '#f7fbfd'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
    HL.roundRect(ctx, -3.5, -18, 7, 16, 3.5);
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    ctx.restore();
  }

  function tile(label, thumb, spec) {
    var b = document.createElement('button');
    b.className = 'shelfTile';
    b.type = 'button';
    b.appendChild(thumb);
    var s = document.createElement('span');
    s.textContent = label;
    b.appendChild(s);
    b.setAttribute('aria-label', spec.aria || label);
    b.dataset.kind = spec.kind;
    b.dataset.id = spec.id;
    if (spec.title) b.title = spec.title;
    return b;
  }

  function group(titleKey, tiles) {
    var g = document.createElement('div');
    g.className = 'shelfGroup';
    g.dataset.group = titleKey;
    var h = document.createElement('h3');
    h.textContent = HL.L(titleKey);
    g.appendChild(h);
    var row = document.createElement('div');
    row.className = 'shelfRow';
    for (var i = 0; i < tiles.length; i++) row.appendChild(tiles[i]);
    g.appendChild(row);
    return g;
  }

  /* Short tab labels. A full shelf is about two screens tall, and making a
   * class scroll to find the pot wastes lesson time - so the shelf is tabbed
   * and every tile is one tap away. */
  var TAB_LABELS = {
    'shelf.everyday': ['Heat it', 'Materials'],
    'shelf.solids': ['Solid', 'Solids'],
    'shelf.surprising': ['Surprise', 'Surprising'],
    'shelf.containers': ['Pots', 'Containers'],
    'shelf.wraps': ['Wraps', 'Insulators'],
    'shelf.thermometer': ['Temp', 'Thermo']
  };

  function tabLabel(key) {
    var row = TAB_LABELS[key];
    if (!row) return HL.L(key);
    return HL.lang.level === 'y56' ? row[1] : row[0];
  }

  /* Build the tab strip and show one group at a time. */
  function installTabs(host) {
    var groups = host.querySelectorAll('.shelfGroup');
    if (groups.length < 2) return;
    var strip = document.createElement('div');
    strip.className = 'shelfTabs';
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-label', 'Shelf sections');
    var buttons = [];

    function select(idx) {
      for (var i = 0; i < groups.length; i++) {
        var on = i === idx;
        groups[i].hidden = !on;
        buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
        buttons[i].tabIndex = on ? 0 : -1;
      }
    }

    for (var i = 0; i < groups.length; i++) {
      var b = document.createElement('button');
      b.className = 'shelfTab';
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = tabLabel(groups[i].dataset.group);
      b.setAttribute('aria-label', HL.L(groups[i].dataset.group));
      b.addEventListener('click', function (k) {
        return function () { select(k); };
      }(i));
      // Left/right arrows walk the tabs, which is what a tablist should do.
      b.addEventListener('keydown', function (k) {
        return function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          var n = (k + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
          select(n); buttons[n].focus(); e.preventDefault();
        };
      }(i));
      buttons.push(b);
      strip.appendChild(b);
    }
    host.insertBefore(strip, host.firstChild);
    select(0);
  }

  HL.Shelf = {
    /* Build the shelf. `allow` limits what is offered (challenges use this);
     * null means everything. */
    build: function (host, world, allow) {
      host.innerHTML = '';
      var TW = 58, TH = 46;
      var groups = [
        { key: 'shelf.everyday', which: 'everyday' },
        { key: 'shelf.solids', which: 'solids' },
        { key: 'shelf.surprising', which: 'surprising' }
      ];
      var i, j;

      for (i = 0; i < groups.length; i++) {
        var tiles = [];
        for (j = 0; j < HL.TEMPLATES.length; j++) {
          var tpl = HL.TEMPLATES[j];
          if (tpl.group !== groups[i].which) continue;
          if (allow && allow.items && allow.items.indexOf(tpl.id) < 0) continue;
          var sub = tpl.sub ? HL.SUBSTANCES[tpl.sub] : null;
          var aria = tpl.label + (sub && sub.hint ? '. ' + sub.hint : '') + ' Starts at ' + tpl.temp + ' degrees.';
          tiles.push(tile(tpl.label,
            thumbCanvas(TW, TH, function (t) {
              return function (c, w, h) { drawTemplateThumb(c, w, h, t); };
            }(tpl)),
            { kind: 'template', id: tpl.id, aria: aria, title: sub && sub.hint ? sub.hint : tpl.label }));
        }
        if (tiles.length) host.appendChild(group(groups[i].key, tiles));
      }

      // Containers.
      var ctiles = [];
      for (i = 0; i < HL.CONTAINERS.length; i++) {
        var spec = HL.CONTAINERS[i];
        if (allow && allow.containers && allow.containers.indexOf(spec.id) < 0) continue;
        ctiles.push(tile(spec.label,
          thumbCanvas(TW, TH, function (sp) {
            return function (c, w, h) { drawContainerThumb(c, w, h, sp); };
          }(spec)),
          { kind: 'container', id: spec.id,
            aria: spec.label + '. ' + (spec.cond > 1 ? HL.L('msg.conductor') : spec.cond < 0.2 ? HL.L('msg.insulator') : '') }));
      }
      if (ctiles.length) host.appendChild(group('shelf.containers', ctiles));

      // Wraps, plus a tile to take a wrap back off again.
      var wtiles = [];
      for (i = 0; i < HL.WRAPS.length; i++) {
        var wr = HL.WRAPS[i];
        if (allow && allow.wraps && allow.wraps.indexOf(wr.id) < 0) continue;
        wtiles.push(tile(wr.label,
          thumbCanvas(TW, TH, function (w2) {
            return function (c, w, h) { drawWrapThumb(c, w, h, w2); };
          }(wr)),
          { kind: 'wrap', id: wr.id, aria: 'Wrap something in ' + wr.label }));
      }
      if (wtiles.length) {
        wtiles.push(tile('No wrap', thumbCanvas(TW, TH, drawEraserThumb),
          { kind: 'wrap', id: '', aria: 'Take the wrap off' }));
        host.appendChild(group('shelf.wraps', wtiles));
      }

      // Thermometers.
      var ttiles = [];
      for (i = 0; i < world.thermometers.length; i++) {
        var th = world.thermometers[i];
        ttiles.push(tile('#' + (i + 1),
          thumbCanvas(TW, TH, function (col) {
            return function (c, w, h) { drawThermoThumb(c, w, h, col); };
          }(th.color)),
          { kind: 'thermo', id: th.id, aria: 'Thermometer ' + (i + 1) + '. Drag onto something to read its temperature.' }));
      }
      host.appendChild(group('shelf.thermometer', ttiles));

      installTabs(host);
    }
  };
})();
