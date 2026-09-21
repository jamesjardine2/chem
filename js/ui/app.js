/* Heat Lab - application wiring.
 *
 * Owns the clock, the view flags, the panels and the challenge state. The
 * physics lives in js/model, the drawing in js/render; this file is the part
 * that knows about buttons.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  var $ = function (id) { return document.getElementById(id); };

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* older browsers */ }

  var App = {
    world: null,
    view: {
      heatCamera: false, energyView: false, graph: true,
      lens: { on: false, x: 500, y: 330, r: 82 },
      reducedMotion: reduceMotion, transform: { scale: 1, ox: 0, oy: 0 },
      dt: 0.016, wrapGhost: null, quality: 'high'
    },
    frameAvg: 16,
    qualityTimer: 0,
    qualityDrops: 0,
    speed: 1,
    speeds: [1, 2, 4],
    challenge: null,
    chState: null,
    completed: {},
    graphAcc: 0,

    /* ------------------------------------------------------------- setup */

    init: function () {
      this.canvas = $('bench');
      this.ctx = this.canvas.getContext('2d');
      this.graphCanvas = $('graph');
      this.graphCtx = this.graphCanvas.getContext('2d');
      this.world = new HL.World(3);

      this.interaction = new HL.Interaction(this);
      this.buildStartScreen();
      this.wireToolbar();
      this.wireSheets();
      this.buildShelf(null);
      this.applyLanguage();
      this.resize();

      var self = this;
      window.addEventListener('resize', function () { self.resize(); });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () { self.resize(); });
      }
      this.last = 0;
      requestAnimationFrame(function (t) { self.frame(t); });
    },

    buildStartScreen: function () {
      var self = this;
      $('liText').textContent = HL.LISC.intention;
      $('liText2').textContent = HL.LISC.intention;
      ['scList', 'scList2'].forEach(function (id) {
        var ul = $(id);
        ul.innerHTML = '';
        HL.LISC.criteria.forEach(function (c) {
          var li = document.createElement('li');
          li.textContent = c;
          ul.appendChild(li);
        });
      });

      var pick = $('levelPick');
      pick.innerHTML = '';
      HL.LEVELS.forEach(function (lv) {
        var b = document.createElement('button');
        b.className = 'segBtn';
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', lv.id === HL.lang.level ? 'true' : 'false');
        b.textContent = lv.label;
        b.addEventListener('click', function () { self.setLevel(lv.id); });
        pick.appendChild(b);
      });

      $('startBtn').addEventListener('click', function () { self.start(false); });
      $('startChallenges').addEventListener('click', function () { self.start(true); });
    },

    start: function (openChallenges) {
      $('startScreen').hidden = true;
      $('app').setAttribute('aria-hidden', 'false');
      HL.Audio.unlock();
      this.resize();
      this.canvas.focus();
      if (openChallenges) this.openChallenges();
    },

    setLevel: function (level) {
      HL.setLevel(level);
      var pick = $('levelPick');
      var btns = pick.querySelectorAll('.segBtn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute('aria-checked', HL.LEVELS[i].id === level ? 'true' : 'false');
      }
      this.applyLanguage();
      this.buildShelf(this.challenge);
      if (this.challenge) this.renderChallengePanel();
    },

    applyLanguage: function () {
      var nodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = HL.L(nodes[i].getAttribute('data-i18n'));
      }
      // The labels are hidden on narrow screens, and display:none takes them
      // out of the accessibility tree too - so mirror them onto aria-label.
      var toolLabels = {
        btnEnergy: 'tool.energy', btnCamera: 'tool.camera', btnLens: 'tool.lens',
        btnGraph: 'tool.graph', btnReset: 'tool.reset', btnSound: 'tool.sound',
        btnChallenges: 'tool.challenges'
      };
      for (var bid in toolLabels) {
        if (!Object.prototype.hasOwnProperty.call(toolLabels, bid)) continue;
        var btn = $(bid);
        if (btn) btn.setAttribute('aria-label', HL.L(toolLabels[bid]));
      }
      $('levelChip').textContent = HL.lang.level === 'y56' ? 'Y5/6' : 'Y3/4';
      $('btnLevel').setAttribute('aria-label', 'Year level words: ' + (HL.lang.level === 'y56' ? 'Years 5 and 6' : 'Years 3 and 4'));
      $('playLabel').textContent = HL.L(this.world.paused ? 'tool.play' : 'tool.pause');
      this.renderChallengeGrid();
    },

    /* ---------------------------------------------------------- toolbar */

    wireToolbar: function () {
      var self = this;
      function toggle(btn, get, set) {
        btn.addEventListener('click', function () {
          set(!get());
          btn.setAttribute('aria-pressed', get() ? 'true' : 'false');
          HL.Audio.unlock();
        });
        btn.setAttribute('aria-pressed', get() ? 'true' : 'false');
      }

      toggle($('btnEnergy'), function () { return self.view.energyView; },
        function (v) { self.view.energyView = v; if (!v) HL.resetChunks(); });
      toggle($('btnCamera'), function () { return self.view.heatCamera; },
        function (v) { self.view.heatCamera = v; });
      toggle($('btnLens'), function () { return self.view.lens.on; },
        function (v) {
          self.view.lens.on = v;
          if (v) { HL.resetLens(); self.view.lens.x = self.world.W * 0.5; self.view.lens.y = HL.BENCH_Y - 150; }
        });
      toggle($('btnGraph'), function () { return self.view.graph; },
        function (v) { self.view.graph = v; $('panelGraph').hidden = !v; });

      $('btnPlay').addEventListener('click', function () { self.togglePause(); });
      $('btnSpeed').addEventListener('click', function () {
        var i = self.speeds.indexOf(self.speed);
        self.speed = self.speeds[(i + 1) % self.speeds.length];
        $('speedLabel').textContent = self.speed + '×';
        $('btnSpeed').setAttribute('aria-label', 'Speed ' + self.speed + ' times');
      });
      $('btnReset').addEventListener('click', function () { self.reset(); });

      $('btnSound').addEventListener('click', function () {
        HL.Audio.unlock();
        var m = !HL.Audio.isMuted();
        HL.Audio.setMuted(m);
        $('btnSound').setAttribute('aria-pressed', m ? 'false' : 'true');
        $('soundIcon').setAttribute('href', m ? '#i-mute' : '#i-sound');
      });

      $('btnChallenges').addEventListener('click', function () { self.openChallenges(); });
      $('btnLevel').addEventListener('click', function () {
        self.setLevel(HL.lang.level === 'y56' ? 'y34' : 'y56');
      });
      $('btnHelp').addEventListener('click', function () { $('helpSheet').hidden = false; });
      $('sideToggle').addEventListener('click', function () { $('side').classList.toggle('open'); });
      $('chExit').addEventListener('click', function () { self.exitChallenge(); });
    },

    wireSheets: function () {
      var self = this;
      $('csClose').addEventListener('click', function () { $('challengeSheet').hidden = true; });
      $('hsClose').addEventListener('click', function () { $('helpSheet').hidden = true; });
      $('csFree').addEventListener('click', function () {
        $('challengeSheet').hidden = true;
        self.exitChallenge();
      });
      [$('challengeSheet'), $('helpSheet')].forEach(function (ov) {
        ov.addEventListener('click', function (e) { if (e.target === ov) ov.hidden = true; });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          if (!$('challengeSheet').hidden) $('challengeSheet').hidden = true;
          else if (!$('helpSheet').hidden) $('helpSheet').hidden = true;
        }
      });
      this.renderChallengeGrid();
    },

    togglePause: function () {
      this.world.paused = !this.world.paused;
      $('playIcon').setAttribute('href', this.world.paused ? '#i-play' : '#i-pause');
      $('playLabel').textContent = HL.L(this.world.paused ? 'tool.play' : 'tool.pause');
      $('btnPlay').setAttribute('aria-label', this.world.paused ? 'Play' : 'Pause');
      if (this.world.paused) HL.Audio.silence();
    },

    onSliderChange: function () { HL.Audio.unlock(); },

    wake: function () { HL.Audio.unlock(); },

    /* ------------------------------------------------------------ shelf */

    buildShelf: function (allow) {
      HL.Shelf.build($('shelfInner'), this.world, allow);
      var tiles = $('shelfInner').querySelectorAll('.shelfTile');
      for (var i = 0; i < tiles.length; i++) this.interaction.bindTile(tiles[i]);
    },

    createFromTile: function (kind, id, clientX, clientY) {
      var p = this.interaction.toWorld(clientX, clientY);
      if (kind === 'wrap') return { kind: 'wrap', id: id };
      if (kind === 'thermo') {
        for (var i = 0; i < this.world.thermometers.length; i++) {
          var th = this.world.thermometers[i];
          if (th.id === id) {
            th.attachedTo = null; th.onShelf = true; th.samples = [];
            th.dragging = true; th.x = p.x; th.y = p.y;
            this.interaction.drag = { kind: 'thermo', th: th, dx: 0, dy: 0 };
            return { kind: 'thermo', item: null };
          }
        }
        return null;
      }
      var item = kind === 'container'
        ? this.world.addContainer(id, p.x, p.y)
        : this.world.addTemplate(id, p.x, p.y);
      if (!item) return null;
      return { kind: 'item', item: item };
    },

    /* A tap (rather than a drag) puts the thing somewhere sensible, so nobody
     * has to be accurate with a finger on a whiteboard. */
    tapTile: function (kind, id) {
      var w = this.world;
      if (kind === 'wrap') {
        // Wrap whatever container is on the bench, or say what to do.
        var target = null;
        for (var i = 0; i < w.items.length; i++) {
          if (w.items[i].kind === 'container' && !w.items[i].containerId) { target = w.items[i]; break; }
        }
        if (!target) {
          for (i = 0; i < w.items.length; i++) if (!w.items[i].containerId) { target = w.items[i]; break; }
        }
        if (target) this.applyWrap(target, id);
        else this.toast('Put something on the bench first.');
        return;
      }
      if (kind === 'thermo') {
        var th = null;
        for (i = 0; i < w.thermometers.length; i++) if (w.thermometers[i].id === id) th = w.thermometers[i];
        if (!th) return;
        // Clip it onto the first thing that has no thermometer yet.
        var host = null;
        for (i = 0; i < w.items.length; i++) {
          var it = w.items[i];
          if (it.kind === 'container' && it.contents.length) continue;
          var taken = false;
          for (var k = 0; k < w.thermometers.length; k++) {
            if (w.thermometers[k].attachedTo === it.id) taken = true;
          }
          if (!taken) { host = it; break; }
        }
        if (!host) { this.toast(HL.L('hint.thermo')); return; }
        th.attachedTo = host.id; th.onShelf = false; th.samples = [];
        this.refreshLegend();
        this.toast('Thermometer ' + (th.index + 1) + ' on ' + host.label);
        return;
      }

      if (kind === 'container') {
        var spot = this.freeSpot(HL.containerById(id).w);
        var c = this.world.addContainer(id, spot.x, spot.y);
        var r = this.world.place(c, spot.x, spot.y);
        if (!r.ok) { this.toast(HL.L(r.reason)); this.world.removeItem(c, false); return; }
        this.interaction.selected = c;
        HL.Audio.event('drop');
        return;
      }

      var tpl = HL.templateById(id);
      if (!tpl) return;
      if (tpl.needsContainer) {
        // Find a container with room for it.
        var vessel = null;
        for (i = 0; i < w.items.length; i++) {
          var cand = w.items[i];
          if (cand.kind !== 'container') continue;
          var probe = { state: 'liquid', mass: tpl.mass };
          if (w.fits(probe, cand)) { vessel = cand; break; }
        }
        if (!vessel) { this.toast(HL.L('msg.needcontainer')); return; }
        var liq = this.world.addTemplate(id, vessel.x, vessel.y - vessel.h + 10);
        var lr = this.world.place(liq, vessel.x, vessel.y - vessel.h + 10);
        if (!lr.ok) { this.toast(HL.L(lr.reason)); this.world.removeItem(liq, false); return; }
        this.interaction.selected = vessel;
        HL.Audio.event('pour');
        this.afterPlace(liq, lr);
        return;
      }

      // Prefer an empty station: that is where students want things to go.
      var st = this.freeStation();
      var item;
      if (st) {
        item = this.world.addTemplate(id, st.x, st.y - st.h);
        this.world.place(item, st.x, st.y - st.h + 2);
      } else {
        var sp = this.freeSpot(tpl.w || 70);
        item = this.world.addTemplate(id, sp.x, sp.y);
        this.world.place(item, sp.x, sp.y);
      }
      this.interaction.selected = item;
      HL.Audio.event('drop');
      this.afterPlace(item, { ok: true });
    },

    freeStation: function () {
      var w = this.world;
      for (var i = 0; i < w.stations.length; i++) {
        var used = false;
        for (var j = 0; j < w.items.length; j++) if (w.items[j].station === i) used = true;
        if (!used) return w.stations[i];
      }
      return null;
    },

    freeSpot: function (width) {
      var w = this.world;
      for (var x = 90; x < w.W - 90; x += 30) {
        var clash = false;
        for (var i = 0; i < w.items.length; i++) {
          var it = w.items[i];
          if (it.containerId || it.station !== null) continue;
          if (Math.abs(it.x - x) < (it.w + width) / 2 + 10) { clash = true; break; }
        }
        if (!clash) return { x: x, y: w.benchY };
      }
      return { x: w.W / 2, y: w.benchY };
    },

    applyWrap: function (target, wrapId) {
      if (!wrapId) {
        if (target.wrap) { target.wrap = null; this.toast('Wrap off'); }
        return;
      }
      if (target.wrap === wrapId) { target.wrap = null; this.toast('Wrap off'); return; }
      target.wrap = wrapId;
      var wr = HL.wrapById(wrapId);
      this.toast(HL.L('msg.wrapped') + ': ' + (wr ? wr.label : ''));
    },

    afterPlace: function (item) {
      this.refreshLegend();
      if (item && item.sub && item.sub.hint && !this.challenge) {
        // A quiet nudge about the material, not a lecture.
        this.toast(item.label + ' · ' + item.sub.hint, 2600);
      }
    },

    /* ------------------------------------------------------------ toast */

    toast: function (msg, ms) {
      var el = $('toast');
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(this._toastT);
      var self = this;
      this._toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 1900);
    },

    showKeyHint: function () {
      var el = $('keyHint');
      el.classList.add('show');
      clearTimeout(this._hintT);
      this._hintT = setTimeout(function () { el.classList.remove('show'); }, 4200);
    },

    /* ----------------------------------------------------------- legend */

    refreshLegend: function () {
      var host = $('graphLegend');
      host.innerHTML = '';
      var w = this.world;
      for (var i = 0; i < w.thermometers.length; i++) {
        var th = w.thermometers[i];
        var d = document.createElement('span');
        d.className = 'legDot' + (th.attachedTo ? '' : ' off');
        d.style.background = th.color;
        d.textContent = String(i + 1);
        var it = th.attachedTo ? w.byId(th.attachedTo) : null;
        d.title = it ? it.label : 'Not attached';
        host.appendChild(d);
      }
    },

    renderReadout: function () {
      var host = $('readout');
      var w = this.world;
      var want = [];
      for (var i = 0; i < w.thermometers.length; i++) {
        var th = w.thermometers[i];
        var it = w.readThermometer(th);
        if (!it) continue;
        want.push({ color: th.color, text: it.label + ' ' + it.temp.toFixed(1) + '°C · ' + HL.Thermo.stateLabel(it) });
      }
      // Rebuild only when the set of chips changes, then patch the text.
      if (host.childNodes.length !== want.length) {
        host.innerHTML = '';
        for (i = 0; i < want.length; i++) {
          var chip = document.createElement('div');
          chip.className = 'roChip';
          var dot = document.createElement('span');
          dot.className = 'roDot';
          dot.style.background = want[i].color;
          var sp = document.createElement('span');
          chip.appendChild(dot); chip.appendChild(sp);
          host.appendChild(chip);
        }
      }
      for (i = 0; i < want.length; i++) {
        var node = host.childNodes[i];
        node.childNodes[0].style.background = want[i].color;
        if (node.childNodes[1].textContent !== want[i].text) node.childNodes[1].textContent = want[i].text;
      }
    },

    /* ------------------------------------------------------- challenges */

    renderChallengeGrid: function () {
      var grid = $('csGrid');
      if (!grid) return;
      var self = this;
      grid.innerHTML = '';
      HL.CHALLENGES.forEach(function (ch) {
        var b = document.createElement('button');
        b.className = 'csCard' + (self.completed[ch.id] ? ' done' : '');
        b.type = 'button';
        var t = document.createElement('span');
        t.className = 'csTitle';
        t.textContent = ch.title;
        if (self.completed[ch.id]) {
          var tick = document.createElement('span');
          tick.className = 'csTick';
          tick.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          t.appendChild(tick);
        }
        var g = document.createElement('span');
        g.className = 'csGoal';
        g.textContent = ch.goal;
        b.appendChild(t); b.appendChild(g);
        b.addEventListener('click', function () {
          $('challengeSheet').hidden = true;
          self.startChallenge(ch.id);
        });
        grid.appendChild(b);
      });
    },

    openChallenges: function () {
      this.renderChallengeGrid();
      $('challengeSheet').hidden = false;
    },

    startChallenge: function (id) {
      var ch = HL.challengeById(id);
      if (!ch) return;
      this.challenge = ch;
      this.chState = { elapsed: 0, done: false, failed: false, predicted: null, revealed: false, identifyCorrect: false, note: null };
      this.world.clearBench();
      HL.resetChunks();

      // Stations: a challenge can lock them, which is how "use only your hand"
      // is enforced without hiding the controls and confusing anyone.
      for (var i = 0; i < this.world.stations.length; i++) {
        this.world.stations[i].power = 0;
        this.world.stations[i].locked = false;
      }
      if (ch.stations) {
        for (i = 0; i < ch.stations.length; i++) {
          var s = ch.stations[i];
          if (this.world.stations[s.index]) {
            this.world.stations[s.index].power = s.power || 0;
            this.world.stations[s.index].locked = !!s.locked;
          }
        }
      }

      this.buildShelf(ch);
      this.renderChallengePanel();
      $('panelChallenge').hidden = false;
      $('panelPredict').hidden = !ch.predict;
      if (ch.predict) this.renderPredict(ch);
      $('side').classList.add('open');
      if (!this.world.paused) { /* keep running */ }
      this.toast(ch.goal, 3200);
      this.refreshLegend();
    },

    exitChallenge: function () {
      this.challenge = null;
      this.chState = null;
      $('panelChallenge').hidden = true;
      $('panelPredict').hidden = true;
      for (var i = 0; i < this.world.stations.length; i++) this.world.stations[i].locked = false;
      this.buildShelf(null);
      this.toast(HL.L('ch.free'));
    },

    renderChallengePanel: function () {
      var ch = this.challenge;
      if (!ch) return;
      $('chTitle').textContent = ch.title;
      $('chGoal').textContent = ch.goal;
      $('chNote').textContent = ch.hint || '';
      $('chNote').className = 'chNote';
      $('chBarFill').style.width = '0%';
      $('chTimer').hidden = !ch.timer;
      var idBox = $('chIdentify');
      idBox.innerHTML = '';
      idBox.hidden = !ch.identify;
      if (ch.identify) {
        var self = this;
        var row = document.createElement('div');
        row.className = 'idRow';
        var q = document.createElement('p');
        q.className = 'chGoal';
        q.textContent = 'What is the mystery sample?';
        idBox.appendChild(q);
        HL.MYSTERY_POOL.forEach(function (key) {
          var b = document.createElement('button');
          b.className = 'idBtn';
          b.type = 'button';
          b.textContent = HL.MYSTERY_LABELS[key] || key;
          b.addEventListener('click', function () { self.answerMystery(key, b); });
          row.appendChild(b);
        });
        idBox.appendChild(row);
      }
    },

    answerMystery: function (key, btn) {
      var w = this.world;
      var m = null;
      for (var i = 0; i < w.items.length; i++) if (w.items[i].sub && w.items[i].sub.isMystery) m = w.items[i];
      if (!m) { this.toast('Put the mystery sample on the bench first.'); return; }
      var right = m.sub.answer === key;
      btn.classList.add(right ? 'right' : 'wrong');
      if (right) {
        this.chState.identifyCorrect = true;
      } else {
        this.toast('Not that one. Watch the temperature where it stops rising.', 2800);
      }
    },

    renderPredict: function (ch) {
      var self = this;
      $('pqText').textContent = ch.predict.question;
      var host = $('pqOptions');
      host.innerHTML = '';
      $('pqResult').hidden = true;
      ch.predict.options.forEach(function (label, idx) {
        var b = document.createElement('button');
        b.className = 'pqOpt';
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.textContent = label;
        b.addEventListener('click', function () {
          self.chState.predicted = idx;
          var all = host.querySelectorAll('.pqOpt');
          for (var i = 0; i < all.length; i++) {
            all[i].setAttribute('aria-pressed', i === idx ? 'true' : 'false');
            all[i].classList.add('locked');
          }
          self.toast(HL.L('predict.locked') + ': ' + label, 1600);
        });
        host.appendChild(b);
      });
      var skip = document.createElement('button');
      skip.className = 'pqSkip';
      skip.type = 'button';
      skip.textContent = HL.L('predict.skip');
      skip.addEventListener('click', function () {
        self.chState.predicted = -1;
        $('panelPredict').hidden = true;
      });
      host.appendChild(skip);
    },

    revealPredict: function () {
      var ch = this.challenge, st = this.chState;
      if (!ch || !ch.predict || !st || st.revealed || st.predicted === null || st.predicted < 0) return;
      st.revealed = true;
      var right = st.predicted === ch.predict.answer;
      var box = $('pqResult');
      box.hidden = false;
      var head = right ? HL.L('predict.right') : HL.L('predict.surprise');
      box.innerHTML = '';
      var b = document.createElement('b');
      b.textContent = head;
      box.appendChild(b);
      var p = document.createElement('div');
      p.textContent = HL.L('predict.locked') + ': ' + ch.predict.options[st.predicted]
        + '  →  ' + HL.L('predict.result') + ': ' + ch.predict.options[ch.predict.answer];
      box.appendChild(p);
      if (ch.predict.explain) {
        var ex = document.createElement('div');
        ex.style.marginTop = '6px';
        ex.textContent = ch.predict.explain;
        box.appendChild(ex);
      }
    },

    updateChallenge: function (dt) {
      var ch = this.challenge, st = this.chState;
      if (!ch || !st) return;
      if (!this.world.paused) st.elapsed += dt;

      if (ch.timer) {
        var left = Math.max(0, ch.timer - st.elapsed);
        $('chTimer').textContent = Math.floor(left / 60) + ':' + ('0' + Math.floor(left % 60)).slice(-2);
      }

      if (st.done) return;

      var res = ch.check(this.world, st) || {};
      if (res.progress !== undefined) {
        $('chBarFill').style.width = Math.round(Math.max(0, Math.min(1, res.progress)) * 100) + '%';
      }
      var note = res.note !== undefined && res.note !== null ? res.note : (res.msg || ch.hint || '');
      if ($('chNote').textContent !== note) $('chNote').textContent = note;

      if (res.failed && !st.failed) {
        st.failed = true;
        $('chNote').className = 'chNote chFail';
        this.revealPredict();
      } else if (!res.failed && st.failed) {
        st.failed = false;
        $('chNote').className = 'chNote';
      }

      if (res.done) {
        st.done = true;
        this.completed[ch.id] = true;
        $('chBarFill').style.width = '100%';
        $('chNote').className = 'chNote chDone';
        $('chNote').textContent = res.note || HL.L('ch.done');
        this.revealPredict();
        this.celebrate(ch, res.note);
        this.renderChallengeGrid();
      }

      // Reveal a prediction once there is clearly something to compare with.
      if (st.predicted !== null && st.predicted >= 0 && !st.revealed && st.elapsed > 28) this.revealPredict();
    },

    celebrate: function (ch, note) {
      var el = $('winBanner');
      el.innerHTML = '';
      el.appendChild(document.createTextNode(HL.L('ch.win')));
      var small = document.createElement('small');
      small.textContent = note || ch.title;
      el.appendChild(small);
      el.hidden = false;
      // Force a reflow so the transition runs from the hidden state.
      void el.offsetWidth;
      el.classList.add('show');
      HL.Audio.event('win');
      var self = this;
      clearTimeout(this._winT);
      this._winT = setTimeout(function () {
        el.classList.remove('show');
        setTimeout(function () { el.hidden = true; }, 300);
        self.openChallenges();
      }, 2600);
    },

    /* ------------------------------------------------------------ reset */

    reset: function () {
      this.world.clearBench();
      HL.resetChunks();
      HL.resetLens();
      HL.Audio.silence();
      this.interaction.selected = null;
      this.view.lens.on = false;
      $('btnLens').setAttribute('aria-pressed', 'false');
      if (this.challenge) this.startChallenge(this.challenge.id);
      else { this.refreshLegend(); this.toast(HL.L('tool.reset')); }
    },

    /* ----------------------------------------------------------- resize */

    /* How wide should the bench be, and how many stations fit, for a stage
     * of this shape? A tall iPad gets a narrow two-station bench so
     * everything is bigger to touch; a wide board gets four stations. */
    benchShape: function (w, h) {
      var a = w / Math.max(1, h);
      if (a < 1.1) return { width: 720, stations: 2 };
      if (a > 2.0) return { width: 1180, stations: 4 };
      return { width: HL.WORLD_W, stations: 3 };
    },

    resize: function () {
      var cap = this.view.quality === 'low' ? 1.25 : 1.75;
      var dpr = Math.min(cap, window.devicePixelRatio || 1);
      var stage = this.canvas.parentElement;
      var w = Math.max(320, stage.clientWidth);
      var h = Math.max(240, stage.clientHeight);
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);

      var shape = this.benchShape(w, h);
      if (this.world.setLayout(shape.width, shape.stations)) {
        // A reshaped bench means the challenge's station presets need
        // reapplying, and the shelf may now show a different thermometer set.
        if (this.challenge && this.challenge.stations) {
          for (var k = 0; k < this.challenge.stations.length; k++) {
            var cs = this.challenge.stations[k];
            if (this.world.stations[cs.index]) {
              this.world.stations[cs.index].power = cs.power || 0;
              this.world.stations[cs.index].locked = !!cs.locked;
            }
          }
        }
        HL.resetChunks();
      }

      // Fit the world into the canvas without distorting it.
      var scale = Math.min(w / this.world.W, h / HL.WORLD_H);
      // Anchor the bench to the BOTTOM of the stage rather than centring it.
      // Spare height then becomes more room above the bench for steam and
      // tall stacks, instead of dead letterbox bars.
      var oy = h - HL.WORLD_H * scale;
      this.view.transform = {
        scale: scale,
        ox: (w - this.world.W * scale) / 2,
        oy: oy
      };
      this.view.topExtra = oy / scale;
      this.view.dpr = dpr;

      var gw = this.graphCanvas.parentElement;
      this.graphCanvas.width = Math.round(Math.max(120, gw.clientWidth) * dpr);
      this.graphCanvas.height = Math.round(Math.max(100, gw.clientHeight) * dpr);
      this.graphW = Math.max(120, gw.clientWidth);
      this.graphH = Math.max(100, gw.clientHeight);
      this.graphAcc = 99;
    },

    /* ------------------------------------------------------------- loop */

    frame: function (ts) {
      var self = this;
      var dt = this.last ? (ts - this.last) / 1000 : 0.016;
      this.last = ts;
      // A tab that was in the background, or a stalled frame, must not make
      // the physics jump. Cap it and carry on.
      if (dt > 0.1) dt = 0.1;
      this.view.dt = dt;

      this.trackQuality(dt);

      var simDt = dt * this.speed;
      this.world.maxSteam = this.view.quality === 'low' ? 18 : 60;
      this.world.step(simDt);
      this.world.updateSteam(simDt);
      this.world.restack();

      // Events from the model drive the sounds.
      var evs = this.world.events;
      for (var i = 0; i < evs.length; i++) {
        HL.Audio.event(evs[i].type);
        if (evs[i].type === 'scorch') this.toast(HL.L('msg.scorched'));
        else if (evs[i].type === 'melted' && !this.challenge) this.toast(HL.L('msg.melted'));
        else if (evs[i].type === 'frozen' && !this.challenge) this.toast(HL.L('msg.frozen'));
        else if (evs[i].type === 'boiling' && !this.challenge) this.toast(HL.L('msg.boiled'));
      }
      evs.length = 0;
      HL.Audio.update(this.world);

      this.updateChallenge(dt);
      this.draw(dt);
      this.renderReadout();

      // The graph does not need 60fps; redrawing it 8 times a second keeps
      // low-end Chromebooks comfortable.
      this.graphAcc += dt;
      if (this.view.graph && this.graphAcc > 0.125) {
        this.graphAcc = 0;
        var g = this.graphCtx;
        g.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
        HL.Graph.draw(g, this.world, this.graphW, this.graphH, false);
      }

      requestAnimationFrame(function (t) { self.frame(t); });
    },

    /* Watch the real frame time and shed the expensive decoration if the
     * machine cannot keep up. A low-end Chromebook keeps the physics, the
     * thermometers, the graph and every change of state; it loses the heat
     * glow around objects and some of the steam. Nothing a student needs to
     * answer a question depends on what gets dropped. */
    trackQuality: function (dt) {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      var ms = Math.min(120, dt * 1000);
      this.frameAvg = this.frameAvg * 0.9 + ms * 0.1;
      this.qualityTimer += dt;
      if (this.qualityTimer < 1.5) return;
      this.qualityTimer = 0;
      if (this.frameAvg > 24 && this.view.quality !== 'low') {
        this.view.quality = 'low';
        this.qualityDrops++;
        // Also stop rendering at more pixels than the screen can keep up with.
        // On a high-density tablet this alone can halve the work.
        this.resize();
      } else if (this.frameAvg < 15 && this.view.quality === 'low' && this.qualityDrops < 2) {
        // Only offer to go back up once. Flipping between the two settings
        // every couple of seconds would be worse than either.
        this.view.quality = 'high';
        this.resize();
      }
    },

    draw: function (dt) {
      var ctx = this.ctx;
      var tf = this.view.transform;
      var dpr = this.view.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
      // Letterbox colour, so the bench sits in a neutral surround.
      ctx.fillStyle = this.view.heatCamera ? '#0a1120' : '#d6e0e7';
      ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
      ctx.save();
      ctx.translate(tf.ox, tf.oy);
      ctx.scale(tf.scale, tf.scale);
      // No clip: the wall is painted past the world box so the bench fills
      // the stage at any aspect ratio.
      HL.Bench.draw(ctx, this.world, this.view, this.world.time, dt);
      this.drawSelection(ctx);
      this.drawWrapGhost(ctx);

      ctx.restore();
    },

    drawSelection: function (ctx) {
      var sel = this.interaction.selected;
      if (!sel || sel.dragging) return;
      if (this.world.items.indexOf(sel) < 0) { this.interaction.selected = null; return; }
      var host = sel.containerId ? (this.world.byId(sel.containerId) || sel) : sel;
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#f5a524';
      HL.roundRect(ctx, host.x - host.w / 2 - 7, host.y - host.h - 7, host.w + 14, host.h + 14, 10);
      ctx.stroke();
      ctx.restore();
    },

    drawWrapGhost: function (ctx) {
      var g = this.view.wrapGhost;
      if (!g) return;
      var wr = HL.wrapById(g.id);
      ctx.save();
      ctx.globalAlpha = 0.8;
      HL.roundRect(ctx, g.x - 34, g.y - 22, 68, 44, 9);
      ctx.fillStyle = wr ? wr.color : '#e9eef3';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.stroke();
      ctx.restore();
    }
  };

  HL.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }
})();
