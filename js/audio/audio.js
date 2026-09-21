/* Heat Lab - sound.
 *
 * Everything is synthesised with the Web Audio API, so there are no files to
 * download and no network calls. Sounds are short and quiet; the looping ones
 * (bubbling, hissing, sizzling) fade in and out with how strongly the thing
 * is actually doing it, so nothing drones. Muted by default is wrong for a
 * science lab, but ANNOYING is worse - so levels are low and there is a mute
 * button in the toolbar.
 *
 * The audio context is only created on the first real user gesture, which is
 * what browsers require anyway.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  var ctx = null, master = null;
  var muted = false;
  var loops = {};
  var noiseBuf = null;
  var lastOneShot = {};

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // A couple of seconds of white noise, reused by every noisy sound.
    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* A filtered-noise loop, used for bubbling, hissing and sizzling. */
  function makeLoop(name, cfg) {
    if (!ensure()) return null;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = cfg.type;
    filt.frequency.value = cfg.freq;
    filt.Q.value = cfg.q || 1;
    var gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt); filt.connect(gain); gain.connect(master);
    // Bubbling wobbles, which is what makes it sound like a pot and not static.
    var lfo = null, lfoGain = null;
    if (cfg.wobble) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = cfg.wobble;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = cfg.freq * 0.55;
      lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
      lfo.start();
    }
    src.start();
    return { gain: gain, filt: filt, level: 0, cfg: cfg };
  }

  var LOOP_CFG = {
    bubble: { type: 'bandpass', freq: 420, q: 5, wobble: 7, max: 0.32 },
    hiss:   { type: 'highpass', freq: 2600, q: 0.7, max: 0.10 },
    sizzle: { type: 'bandpass', freq: 3200, q: 1.4, wobble: 19, max: 0.14 }
  };

  function setLoop(name, target) {
    if (!ensure()) return;
    if (!loops[name]) loops[name] = makeLoop(name, LOOP_CFG[name]);
    var L = loops[name];
    if (!L) return;
    var want = Math.max(0, Math.min(1, target)) * L.cfg.max;
    L.gain.gain.setTargetAtTime(want, ctx.currentTime, 0.25);
  }

  /* One-shot sounds. */
  function drip() {
    if (!ensure()) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.11);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + 0.18);
  }

  function crack() {
    if (!ensure()) return;
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 1.6;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2.2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.34, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.13);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(); s.stop(ctx.currentTime + 0.15);
  }

  function ding(ok) {
    if (!ensure()) return;
    var notes = ok ? [660, 880, 1170] : [520, 415];
    for (var i = 0; i < notes.length; i++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = notes[i];
      var t0 = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.42);
    }
  }

  function thud() {
    if (!ensure()) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + 0.16);
  }

  /* Rate-limit one-shots so a busy bench does not turn into a machine gun. */
  function once(name, fn, gap) {
    var now = Date.now();
    if (lastOneShot[name] && now - lastOneShot[name] < (gap || 350)) return;
    lastOneShot[name] = now;
    fn();
  }

  HL.Audio = {
    unlock: function () { ensure(); resume(); },

    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    },

    isMuted: function () { return muted; },

    /* Called every frame with the world, so the looping sounds track what is
     * really happening rather than being triggered and forgotten. */
    update: function (world) {
      if (!ctx || muted) return;
      var bubble = 0, hiss = 0, sizzle = 0;
      for (var i = 0; i < world.items.length; i++) {
        var it = world.items[i];
        if (it.state === 'boiling') {
          bubble = Math.max(bubble, 0.6 + 0.4 * Math.min(1, it.mass));
          hiss = Math.max(hiss, 0.7);
        }
        if (it.sizzle > 0.1) sizzle = Math.max(sizzle, it.sizzle);
      }
      for (var s = 0; s < world.stations.length; s++) {
        if (world.stations[s].power < -0.5) hiss = Math.max(hiss, 0.25);
      }
      setLoop('bubble', bubble);
      setLoop('hiss', hiss);
      setLoop('sizzle', sizzle);
    },

    /* World events map onto short sounds. */
    event: function (type) {
      if (muted) return;
      switch (type) {
        case 'melting': once('melting', crack, 900); break;
        case 'melted': once('melted', drip, 500); break;
        case 'freezing': once('freezing', crack, 900); break;
        case 'frozen': once('frozen', crack, 900); break;
        case 'boiling': break;                         // the loop covers this
        case 'pour': once('pour', drip, 200); break;
        case 'drop': once('drop', thud, 120); break;
        case 'scorch': once('scorch', function () { ding(false); }, 900); break;
        case 'win': ding(true); break;
        default: break;
      }
    },

    silence: function () {
      setLoop('bubble', 0); setLoop('hiss', 0); setLoop('sizzle', 0);
    }
  };
})();
