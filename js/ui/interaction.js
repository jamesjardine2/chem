/* Heat Lab - pointer and keyboard interaction.
 *
 * One pointer-event path serves mouse, touch and pen. Drags can start on a
 * shelf tile (DOM) and finish on the bench (canvas), so the drag state lives
 * here rather than in either one.
 *
 * Keyboard support is real, not a token gesture: shelf tiles are buttons that
 * add their item, and on the bench the arrow keys move the selected item,
 * Enter drops it on the nearest station, the bracket keys drive that station's
 * slider, and 1-4 clip a thermometer on.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  function Interaction(app) {
    this.app = app;
    this.world = app.world;
    this.view = app.view;
    this.canvas = app.canvas;
    this.drag = null;
    this.selected = null;
    this.pointerId = null;
    this.bind();
  }

  /* Canvas pixels -> world coordinates. */
  Interaction.prototype.toWorld = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    var tf = this.view.transform;
    return {
      x: (clientX - r.left - tf.ox) / tf.scale,
      y: (clientY - r.top - tf.oy) / tf.scale
    };
  };

  Interaction.prototype.inCanvas = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };

  /* ------------------------------------------------------------ dragging */

  Interaction.prototype.startItemDrag = function (item, p, isNew) {
    item.dragging = true;
    this.drag = {
      kind: 'item', item: item, isNew: !!isNew,
      dx: item.x - p.x, dy: item.y - p.y,
      snap: this.world.snapshot(item), moved: false
    };
    this.selected = item;
  };

  Interaction.prototype.onDown = function (e) {
    if (this.pointerId !== null) return;
    var p = this.toWorld(e.clientX, e.clientY);
    this.app.wake();

    // The particle lens sits above everything and is grabbed first.
    if (HL.lensHit(this.view, p.x, p.y)) {
      this.drag = { kind: 'lens', dx: this.view.lens.x - p.x, dy: this.view.lens.y - p.y };
    } else {
      var st = HL.Bench.sliderHit(this.world, p.x, p.y);
      if (st) {
        this.drag = { kind: 'slider', st: st };
        st.power = HL.Bench.sliderValue(st, p.x);
        this.app.onSliderChange(st);
      } else {
        var th = HL.Bench.thermoHit(this.world, p.x, p.y);
        if (th) {
          var tp = HL.thermoPos(this.world, th);
          th.dragging = true;
          th.x = tp.x; th.y = tp.y;
          this.drag = { kind: 'thermo', th: th, dx: tp.x - p.x, dy: tp.y - p.y };
        } else {
          var item = this.world.itemAt(p.x, p.y, null);
          if (item) this.startItemDrag(item, p, false);
          else this.selected = null;
        }
      }
    }
    if (this.drag) {
      this.pointerId = e.pointerId;
      if (this.canvas.setPointerCapture) {
        try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      }
      e.preventDefault();
    }
  };

  Interaction.prototype.onMove = function (e) {
    if (!this.drag) return;
    var p = this.toWorld(e.clientX, e.clientY);
    var d = this.drag;
    d.moved = true;
    if (d.kind === 'lens') {
      this.view.lens.x = p.x + d.dx;
      this.view.lens.y = p.y + d.dy;
    } else if (d.kind === 'slider') {
      d.st.power = HL.Bench.sliderValue(d.st, p.x);
      this.app.onSliderChange(d.st);
    } else if (d.kind === 'thermo') {
      d.th.x = p.x + d.dx;
      d.th.y = p.y + d.dy;
    } else if (d.kind === 'item') {
      d.item.x = p.x + d.dx;
      d.item.y = p.y + d.dy;
      d.item.station = null;
      d.item.restingOn = null;
    } else if (d.kind === 'wrap') {
      d.x = p.x; d.y = p.y;
    }
    e.preventDefault();
  };

  Interaction.prototype.onUp = function (e) {
    var d = this.drag;
    this.pointerId = null;
    this.drag = null;
    if (!d) return;

    var p = this.toWorld(e.clientX, e.clientY);
    var inside = this.inCanvas(e.clientX, e.clientY);

    if (d.kind === 'thermo') {
      d.th.dragging = false;
      var host = inside ? this.world.itemAt(p.x, p.y, null) : null;
      if (host && host.kind === 'container' && host.contents.length) {
        // Reading a pot of water should measure the water, which is what a
        // student means when they dunk a thermometer in it.
        var biggest = null;
        for (var i = 0; i < host.contents.length; i++) {
          var c = this.world.byId(host.contents[i]);
          if (c && (!biggest || c.mass > biggest.mass)) biggest = c;
        }
        if (biggest) host = biggest;
      }
      if (host) {
        d.th.attachedTo = host.id;
        d.th.onShelf = false;
        d.th.samples = [];
        this.app.toast(host.label + ': ' + Math.round(host.temp) + '°C');
      } else {
        d.th.attachedTo = null;
        d.th.onShelf = true;
        d.th.samples = [];
      }
      this.app.refreshLegend();
      return;
    }

    if (d.kind === 'wrap') {
      var target = inside ? this.world.itemAt(p.x, p.y, null) : null;
      if (target) this.app.applyWrap(target, d.id);
      return;
    }

    if (d.kind === 'item') {
      var item = d.item;
      item.dragging = false;
      if (!inside) {
        // Dragged off the bench: put it away.
        this.world.removeItem(item, false);
        if (this.selected === item) this.selected = null;
        this.app.refreshLegend();
        HL.Audio.event('drop');
        return;
      }
      var res = this.world.place(item, item.x, item.y);
      if (!res.ok) {
        this.app.toast(HL.L(res.reason));
        if (d.isNew) {
          this.world.removeItem(item, false);
          if (this.selected === item) this.selected = null;
        } else {
          this.world.restore(item, d.snap);
        }
        this.app.refreshLegend();
        return;
      }
      if (res.poured) {
        // The item has been dragged to the target's position by now, so put
        // it back using the snapshot taken before the drag started.
        this.world.restore(item, d.snap);
        this.app.toast(HL.L('msg.poured'));
      }
      HL.Audio.event(res.poured ? 'pour' : 'drop');
      this.app.afterPlace(item, res);
    }
  };

  /* --------------------------------------------------------- shelf tiles */

  /* A tile can be tapped (adds the item) or dragged (places it exactly). */
  Interaction.prototype.bindTile = function (tile) {
    var self = this;
    var startX = 0, startY = 0, active = false, created = null, moved = false;

    tile.addEventListener('pointerdown', function (e) {
      if (self.pointerId !== null) return;
      active = true; moved = false; created = null;
      startX = e.clientX; startY = e.clientY;
      self.app.wake();
      tile.classList.add('dragging');
      try { tile.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    tile.addEventListener('pointermove', function (e) {
      if (!active) return;
      var dist = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
      if (!moved && dist < 8) return;
      moved = true;
      if (!created) {
        created = self.app.createFromTile(tile.dataset.kind, tile.dataset.id, e.clientX, e.clientY);
        if (!created) { active = false; tile.classList.remove('dragging'); return; }
        var p = self.toWorld(e.clientX, e.clientY);
        if (created.kind === 'wrap') {
          self.drag = { kind: 'wrap', id: created.id, x: p.x, y: p.y };
          self.view.wrapGhost = self.drag;
        } else if (created.kind === 'item') {
          created.item.x = p.x; created.item.y = p.y;
          self.startItemDrag(created.item, p, true);
        }
        // A thermometer drag is already set up by createFromTile.
        self.pointerId = e.pointerId;
      }
      // From here the bench's own drag logic moves whatever we picked up.
      self.onMove(e);
    });

    function finish(e) {
      if (!active) return;
      active = false;
      tile.classList.remove('dragging');
      self.view.wrapGhost = null;
      if (moved && self.drag) {
        self.onUp(e);
      } else if (!moved) {
        // A plain tap: put it somewhere sensible without making them aim.
        self.app.tapTile(tile.dataset.kind, tile.dataset.id);
      }
      created = null; moved = false;
    }

    tile.addEventListener('pointerup', finish);
    tile.addEventListener('pointercancel', function (e) {
      if (self.drag && self.drag.kind === 'item' && created) {
        self.world.removeItem(self.drag.item, false);
        self.drag = null;
      }
      active = false; moved = false; created = null;
      tile.classList.remove('dragging');
      self.view.wrapGhost = null;
    });

    // Keyboard and assistive tech: activating the button adds the item.
    tile.addEventListener('click', function (e) {
      if (moved) return;
      if (e.detail === 0) self.app.tapTile(tile.dataset.kind, tile.dataset.id);
    });
  };

  /* ------------------------------------------------------------ keyboard */

  Interaction.prototype.onKey = function (e) {
    var w = this.world;
    var items = [];
    for (var i = 0; i < w.items.length; i++) if (!w.items[i].containerId) items.push(w.items[i]);
    var step = e.shiftKey ? 30 : 10;
    var k = e.key;

    if (k === 'Tab') return;                       // leave focus order alone

    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      if (!this.selected && items.length) {
        this.selected = items[0];
      } else if (this.selected && !e.shiftKey && !e.ctrlKey) {
        // Plain arrows nudge the selection; Ctrl+arrows step between items.
        if (e.altKey) {
          var idx = items.indexOf(this.selected);
          this.selected = items[(idx + (k === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
        } else {
          this.selected.x += (k === 'ArrowRight' ? step : -step);
          this.selected.x = Math.max(this.selected.w / 2 + 8, Math.min(w.W - this.selected.w / 2 - 8, this.selected.x));
          this.selected.station = null;
        }
      }
      e.preventDefault();
      this.app.showKeyHint();
      return;
    }

    if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (this.selected) {
        this.selected.y += (k === 'ArrowDown' ? step : -step);
        this.selected.y = Math.max(120, Math.min(w.benchY, this.selected.y));
        this.selected.station = null;
        this.selected.restingOn = null;
        e.preventDefault();
      }
      return;
    }

    if (k === 'Enter' || k === ' ') {
      if (this.selected) {
        // Snap to whatever is nearest: a station, or whatever is under it.
        var res = w.place(this.selected, this.selected.x, this.selected.y);
        if (!res.ok) this.app.toast(HL.L(res.reason));
        else { HL.Audio.event('drop'); this.app.afterPlace(this.selected, res); }
        e.preventDefault();
      }
      return;
    }

    if (k === 'Delete' || k === 'Backspace') {
      if (this.selected) {
        w.removeItem(this.selected, false);
        this.selected = null;
        this.app.refreshLegend();
        e.preventDefault();
      }
      return;
    }

    // Slider control: pick the station nearest the selection (or the first).
    if (k === '[' || k === ']' || k === '-' || k === '=' || k === '+') {
      var st = this.nearestStation();
      if (st && !st.locked) {
        var dir = (k === ']' || k === '=' || k === '+') ? 1 : -1;
        st.power = Math.max(-1, Math.min(1, Math.round((st.power + dir * 0.2) * 10) / 10));
        if (Math.abs(st.power) < 0.05) st.power = 0;
        this.app.onSliderChange(st);
        this.app.toast(HL.L('station.label') + ' ' + (st.index + 1) + ': ' + Math.round(st.power * 100) + '%');
        e.preventDefault();
      }
      return;
    }

    // 1-4 clip that thermometer onto the selected item.
    if (k >= '1' && k <= '4') {
      var th = w.thermometers[parseInt(k, 10) - 1];
      if (th && this.selected) {
        var host = this.selected;
        if (host.kind === 'container' && host.contents.length) {
          var big = null;
          for (var c = 0; c < host.contents.length; c++) {
            var cc = w.byId(host.contents[c]);
            if (cc && (!big || cc.mass > big.mass)) big = cc;
          }
          if (big) host = big;
        }
        th.attachedTo = host.id;
        th.onShelf = false;
        th.samples = [];
        this.app.refreshLegend();
        this.app.toast('Thermometer ' + k + ' on ' + host.label);
        e.preventDefault();
      }
      return;
    }

    if (k === 'p' || k === 'P') { this.app.togglePause(); e.preventDefault(); }
  };

  Interaction.prototype.nearestStation = function () {
    var w = this.world;
    var x = this.selected ? this.selected.x : w.W / 2;
    var best = null, bd = Infinity;
    for (var i = 0; i < w.stations.length; i++) {
      var d = Math.abs(w.stations[i].x - x);
      if (d < bd) { bd = d; best = w.stations[i]; }
    }
    return best;
  };

  /* --------------------------------------------------------------- bind */

  Interaction.prototype.bind = function () {
    var self = this;
    var c = this.canvas;

    c.addEventListener('pointerdown', function (e) { self.onDown(e); });
    c.addEventListener('pointermove', function (e) { self.onMove(e); });
    c.addEventListener('pointerup', function (e) { self.onUp(e); });
    c.addEventListener('pointercancel', function (e) {
      if (self.drag && self.drag.kind === 'item') {
        self.drag.item.dragging = false;
        self.world.restore(self.drag.item, self.drag.snap);
      }
      if (self.drag && self.drag.kind === 'thermo') self.drag.th.dragging = false;
      self.drag = null; self.pointerId = null;
    });
    // A drag that ends outside the canvas still has to be resolved.
    window.addEventListener('pointerup', function (e) {
      if (self.drag && e.target !== c) self.onUp(e);
    });
    c.addEventListener('keydown', function (e) { self.onKey(e); });
    c.addEventListener('focus', function () { self.app.showKeyHint(); });
    // Stop a two-finger pinch on the bench from zooming the whole page.
    c.addEventListener('touchstart', function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  HL.Interaction = Interaction;
})();
