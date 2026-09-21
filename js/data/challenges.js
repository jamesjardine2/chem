/* Heat Lab - lab challenges.
 *
 * Nothing locks and nothing is scored. A challenge limits what is on the
 * shelf, sometimes presets a station, and watches for a result. Ticks last
 * for the session only, deliberately: this is a lesson, not a save file.
 *
 * check(world, ctx) runs every frame and returns:
 *   { done: true }            the goal has been met
 *   { failed: true, msg }     a soft dead end (burnt the chocolate) - the
 *                             student just resets and tries again
 *   { progress: 0..1 }        optional, drives the little progress bar
 */
(function () {
  var HL = (window.HL = window.HL || {});

  /* Helpers the checks share. */
  function find(world, tid) {
    for (var i = 0; i < world.items.length; i++) if (world.items[i].tid === tid) return world.items[i];
    return null;
  }
  function findAll(world, tid) {
    var out = [];
    for (var i = 0; i < world.items.length; i++) if (world.items[i].tid === tid) out.push(world.items[i]);
    return out;
  }
  function liquids(world, minMass) {
    var out = [];
    for (var i = 0; i < world.items.length; i++) {
      var it = world.items[i];
      if (it.kind === 'container' || !it.sub) continue;
      if ((it.state === 'liquid' || it.state === 'boiling') && it.mass >= (minMass || 0)) out.push(it);
    }
    return out;
  }
  function thermoOn(world, item) {
    for (var i = 0; i < world.thermometers.length; i++) {
      if (world.thermometers[i].attachedTo === item.id) return world.thermometers[i];
    }
    return null;
  }
  /* Did this trace hold flat near a target temperature for long enough? That
   * is what a change of state looks like on a graph. */
  function hasPlateau(th, target, minSeconds) {
    if (!th || th.samples.length < 4) return false;
    var run = 0, best = 0;
    for (var i = 1; i < th.samples.length; i++) {
      var s = th.samples[i];
      if (Math.abs(s.temp - target) < 1.5) {
        run += s.t - th.samples[i - 1].t;
        if (run > best) best = run;
      } else run = 0;
    }
    return best >= minSeconds;
  }

  var ALL_CONTAINERS = ['pot', 'beaker', 'foam', 'mug'];
  var ALL_WRAPS = ['wool', 'foil', 'bubble', 'sock'];

  HL.CHALLENGES = [
    {
      id: 'keepice',
      title: 'Keep it frozen',
      goal: 'Stop the ice cube melting for 2 minutes.',
      hint: 'Something has to slow the heat down.',
      items: ['icecube'],
      containers: ALL_CONTAINERS,
      wraps: ALL_WRAPS,
      timer: 120,
      predict: {
        question: 'Which will keep the ice cube frozen longest?',
        options: ['On the bare bench', 'In a foam cup', 'In a metal pot', 'Wrapped in wool'],
        answer: 1,
        explain: 'A foam cup and wool both trap air, and trapped air is a poor conductor. A metal pot moves heat straight in.'
      },
      check: function (world, ctx) {
        var ice = find(world, 'icecube');
        if (!ice) return { failed: true, msg: 'The ice has gone!' };
        if (ice.meltFrac > 0.55) return { failed: true, msg: 'Too much of it melted. Try more insulation.' };
        return { progress: Math.min(1, ctx.elapsed / 120), done: ctx.elapsed >= 120 };
      }
    },
    {
      id: 'meltchoc',
      title: 'Melt the chocolate',
      goal: 'Melt all the chocolate, then keep it under 70 °C for 8 seconds.',
      hint: 'Gentle heat - or melt it fast, then turn the heater down.',
      items: ['chocolate'],
      containers: ['pot', 'beaker'],
      wraps: [],
      timer: null,
      predict: {
        question: 'What will happen on full heat?',
        options: ['It melts nicely', 'It burns', 'Nothing happens'],
        answer: 1,
        explain: 'Chocolate melts at about 32 \u00b0C but scorches above 90 \u00b0C, so gentle heat is the trick.'
      },
      check: function (world, ctx) {
        var ch = find(world, 'chocolate');
        if (!ch) return {};
        if (ch.burnt) return { failed: true, msg: 'Burnt! Much lower heat next time.' };
        if (ch.meltFrac < 0.99) { ctx.holdFrom = null; return { progress: ch.meltFrac * 0.6 }; }
        // Melted. Now it has to survive 8 seconds without cooking.
        if (ch.temp > 70) {
          ctx.holdFrom = null;
          return { progress: 0.6, failed: true,
                   msg: Math.round(ch.temp) + ' \u00b0C is too hot - turn the heater down.' };
        }
        if (ctx.holdFrom === null || ctx.holdFrom === undefined) ctx.holdFrom = ctx.elapsed;
        var held = ctx.elapsed - ctx.holdFrom;
        return { progress: 0.6 + 0.4 * Math.min(1, held / 8), done: held >= 8,
                 note: 'Melted and steady at ' + Math.round(ch.temp) + ' \u00b0C' };
      }
    },
    {
      id: 'chill',
      title: 'Chill the drink',
      goal: 'Cool the hot drink below 10 °C as fast as you can.',
      hint: 'Ice helps. So does a container that moves heat well.',
      items: ['hotwater', 'icecube', 'snow'],
      containers: ALL_CONTAINERS,
      wraps: [],
      timer: null,
      predict: {
        question: 'Which cools the drink fastest?',
        options: ['A foam cup on the cooler', 'A metal pot on the cooler', 'Adding ice only'],
        answer: 1,
        explain: 'A metal pot conducts heat out fast, so it cools quickest on a cooler. Ice also works, because melting it soaks up energy.'
      },
      check: function (world, ctx) {
        var ws = liquids(world, 0.4);
        for (var i = 0; i < ws.length; i++) {
          if (ws[i].sub.id === 'water' && ws[i].temp <= 10) {
            return { done: true, note: 'Cooled in ' + Math.round(ctx.elapsed) + ' seconds.' };
          }
        }
        var best = null;
        for (i = 0; i < ws.length; i++) if (!best || ws[i].temp < best) best = ws[i].temp;
        return { progress: best === null ? 0 : Math.max(0, Math.min(1, (80 - best) / 70)) };
      }
    },
    {
      id: 'spoonrace',
      title: 'Spoon race',
      goal: 'Put both spoons in the hot water. Which one gets hot first?',
      hint: 'Clip a thermometer on each spoon and watch the graph.',
      items: ['hotwater', 'spoonmetal', 'spoonwood'],
      containers: ['pot', 'beaker'],
      wraps: [],
      timer: null,
      predict: {
        question: 'Which spoon gets hot first?',
        options: ['The metal spoon', 'The wooden spoon', 'Both the same'],
        answer: 0,
        explain: 'Metal is a good conductor, wood is a good insulator. Same water, same shape - the material is what changed.'
      },
      check: function (world, ctx) {
        var m = find(world, 'spoonmetal'), wd = find(world, 'spoonwood');
        if (!m || !wd) return {};
        if (!thermoOn(world, m) || !thermoOn(world, wd)) {
          return { progress: 0.15, note: 'Put a thermometer on each spoon.' };
        }
        ctx.metalPeak = Math.max(ctx.metalPeak || 0, m.temp);
        ctx.woodPeak = Math.max(ctx.woodPeak || 0, wd.temp);
        var gap = m.temp - wd.temp;
        var ready = ctx.metalPeak >= 45 && gap >= 12 && ctx.elapsed >= 8;
        return {
          progress: Math.min(1, Math.max(ctx.elapsed / 8, (ctx.metalPeak - 20) / 25) * 0.9),
          done: ready,
          note: ready ? null : 'Metal ' + Math.round(m.temp) + ' \u00b0C, wood ' + Math.round(wd.temp) + ' \u00b0C'
        };
      }
    },
    {
      id: 'mix40',
      title: 'Make 40 degrees',
      goal: 'Mix hot and cold water to get between 38 and 42 °C.',
      hint: 'Pour one container onto the other. The answer lands in between. A touch of heat or cooling fine-tunes it.',
      items: ['hotwater', 'coldwater'],
      containers: ALL_CONTAINERS,
      wraps: [],
      timer: null,
      predict: {
        question: 'Mix the same amount of 80 °C and 4 °C water. What do you get?',
        options: ['About 4 °C', 'About 42 °C', 'About 80 °C', 'About 84 °C'],
        answer: 1,
        explain: 'Mixing shares the energy out, so the answer lands BETWEEN the two. It never adds up to 84 \u00b0C - energy is shared, not created.'
      },
      check: function (world) {
        var ws = liquids(world, 1.2);
        for (var i = 0; i < ws.length; i++) {
          if (ws[i].temp >= 38 && ws[i].temp <= 42) return { done: true };
        }
        var best = null;
        for (i = 0; i < ws.length; i++) if (ws[i].mass >= 1.2 && (best === null || Math.abs(ws[i].temp - 40) < Math.abs(best - 40))) best = ws[i].temp;
        return { progress: ws.length ? 0.6 : 0.1,
                 note: best === null ? null : 'Closest so far: ' + best.toFixed(1) + ' \u00b0C' };
      }
    },
    {
      id: 'insulator',
      title: 'Best insulator',
      goal: 'Keep the soup above 42 °C for 90 seconds.',
      hint: 'Try each wrap. One is much better than the others.',
      items: ['soup'],
      containers: ['mug', 'foam', 'beaker', 'pot'],
      wraps: ALL_WRAPS,
      timer: 90,
      predict: {
        question: 'Which wrap keeps the soup hottest?',
        options: ['Foil', 'A sock', 'Bubble wrap', 'Wool'],
        answer: 3,
        explain: 'Wool traps the most air, and trapped air is the real insulator.'
      },
      check: function (world, ctx) {
        var sp = find(world, 'soup');
        if (!sp) return {};
        if (sp.temp < 42 && ctx.elapsed > 3) {
          return { failed: true, msg: 'It dropped below 42 °C after ' + Math.round(ctx.elapsed) + ' s. Try a better insulator.' };
        }
        return { progress: Math.min(1, ctx.elapsed / 90), done: ctx.elapsed >= 90 };
      }
    },
    {
      id: 'gallium',
      title: 'Melt it with your hand',
      goal: 'Melt the gallium using only the hand.',
      hint: 'A hand is about 37 °C. Gallium melts at 30 °C.',
      items: ['gallium', 'hand'],
      containers: [],
      wraps: [],
      timer: null,
      stations: [{ index: 0, power: 0, locked: true }, { index: 1, power: 0, locked: true }, { index: 2, power: 0, locked: true }],
      predict: {
        question: 'Can a hand melt a metal?',
        options: ['No, metals need a furnace', 'Yes, if the metal melts below 37 °C'],
        answer: 1,
        explain: 'Gallium melts at 30 \u00b0C. A hand at 37 \u00b0C is more than warm enough.'
      },
      check: function (world) {
        var g = find(world, 'gallium');
        if (!g) return {};
        return { progress: g.meltFrac, done: g.meltFrac >= 0.9 };
      }
    },
    {
      id: 'ironcream',
      title: 'Which way does heat go?',
      goal: 'Put the hot iron on the ice cream and melt it.',
      hint: 'Turn on the energy view and watch which way the chunks travel.',
      items: ['hotiron', 'icecream'],
      containers: [],
      wraps: [],
      timer: null,
      stations: [{ index: 0, power: 0, locked: true }, { index: 1, power: 0, locked: true }, { index: 2, power: 0, locked: true }],
      predict: {
        question: 'Which way will the heat energy move?',
        options: ['Iron to ice cream', 'Ice cream to iron', 'Both ways at once'],
        answer: 0,
        explain: 'Heat energy only ever travels from hotter to colder. The iron cools down as the ice cream warms up.'
      },
      check: function (world) {
        var ic = find(world, 'icecream');
        if (!ic) return {};
        return { progress: ic.meltFrac, done: ic.meltFrac >= 0.8 };
      }
    },
    {
      id: 'plateau',
      title: 'Find the flat parts',
      goal: 'Heat ice all the way to steam and find both flat parts on the graph.',
      hint: 'Attach a thermometer first, then heat it hard.',
      items: ['icecube'],
      containers: ['pot', 'beaker'],
      wraps: [],
      timer: null,
      predict: {
        question: 'What happens to the temperature while ice is melting?',
        options: ['It keeps rising', 'It stays at 0 °C', 'It drops'],
        answer: 1,
        explain: 'While it melts, all the energy going in does the melting instead of raising the temperature. That is the flat part on the graph.'
      },
      check: function (world) {
        var ice = find(world, 'icecube');
        var th = null;
        for (var i = 0; i < world.thermometers.length; i++) {
          var t = world.thermometers[i];
          if (t.samples.length > 4) {
            if (hasPlateau(t, 0, 2) || hasPlateau(t, 100, 2)) { th = t; break; }
            if (!th) th = t;
          }
        }
        if (!th) return { progress: 0.05, note: 'Attach a thermometer to record the graph.' };
        var a = hasPlateau(th, 0, 2.5), b = hasPlateau(th, 100, 2.5);
        return { progress: (a ? 0.5 : 0) + (b ? 0.5 : 0), done: a && b,
                 note: a && !b ? 'Found 0 °C. Keep heating for the second one.' : null };
      }
    },
    {
      id: 'mystery',
      title: 'Mystery sample',
      goal: 'Heat and cool the mystery sample, then say what it is.',
      hint: 'Watch the temperature where it stops rising. That is its melting point.',
      items: ['mystery'],
      containers: ['pot', 'beaker'],
      wraps: [],
      timer: null,
      identify: true,
      predict: null,
      check: function (world, ctx) {
        if (ctx.identifyCorrect) return { done: true };
        var m = find(world, 'mystery');
        if (!m) return {};
        return { progress: m.meltFrac > 0 ? 0.6 : 0.2,
                 note: m.meltFrac > 0 ? 'It is melting - read the temperature!' : 'Heat it gently and watch.' };
      }
    }
  ];

  HL.challengeById = function (id) {
    for (var i = 0; i < HL.CHALLENGES.length; i++) if (HL.CHALLENGES[i].id === id) return HL.CHALLENGES[i];
    return null;
  };

  /* Options offered for the mystery sample, labelled the way a student would
   * recognise them. */
  HL.MYSTERY_LABELS = {
    gallium: 'Gallium (melts at 30 °C)',
    wax: 'Candle wax (melts at 55 °C)',
    chocolate: 'Chocolate (melts at 32 °C)',
    butter: 'Butter (melts at 33 °C)',
    saltwater: 'Salt water (freezes at -6 °C)'
  };
})();
