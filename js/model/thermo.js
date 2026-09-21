/* Heat Lab - thermal model.
 *
 * The honest bits, stated once:
 *   - Every body stores a quantity of thermal ENERGY. Temperature is derived
 *     from that energy, its mass and its heat capacity. Nothing sets a
 *     temperature directly except deliberately thermostatted things (the
 *     room, a hand, a heater's safety cut-out).
 *   - Energy only ever flows from the hotter body to the colder one. "Cold"
 *     never flows. Energy is never used up, only moved.
 *   - During a change of state the temperature holds FLAT: the energy goes
 *     into the change. That is what makes the plateaus on the graph.
 *   - Every transfer is clamped so it can never overshoot equilibrium, which
 *     is what keeps the model stable at 60fps without tiny timesteps.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  var T0 = HL.T0;
  var MIN_MASS = 0.02;

  function has(v) { return v !== null && v !== undefined; }

  /* Energy thresholds for a body of this substance and mass:
   *   e1 = warmed right up to the melting point, still all solid
   *   e2 = fully melted, still at the melting point
   *   e3 = warmed right up to the boiling point, still all liquid
   *   e4 = fully boiled away
   * Any threshold that cannot be reached is Infinity. */
  function thresholds(sub, mass) {
    var e1 = has(sub.melt) ? mass * sub.cSolid * (sub.melt - T0) : Infinity;
    var e2 = isFinite(e1) ? e1 + mass * sub.latentMelt : Infinity;
    var e3 = (isFinite(e2) && has(sub.boil))
      ? e2 + mass * sub.cLiquid * (sub.boil - sub.melt) : Infinity;
    var e4 = isFinite(e3) ? e3 + mass * sub.latentBoil : Infinity;
    return { e1: e1, e2: e2, e3: e3, e4: e4 };
  }

  /* Energy a body must hold to sit at this temperature (and state). */
  function energyForTemp(sub, mass, temp) {
    var th = thresholds(sub, mass);
    if (!has(sub.melt) || temp < sub.melt) {
      return mass * sub.cSolid * (temp - T0);
    }
    if (temp === sub.melt) return th.e1;                 // solid, just about to melt
    if (!has(sub.boil) || temp < sub.boil) {
      return th.e2 + mass * sub.cLiquid * (temp - sub.melt);
    }
    if (temp === sub.boil) return th.e3;
    return th.e4 + mass * sub.cGas * (temp - sub.boil);
  }

  /* Work out a body's temperature and state from its stored energy, and write
   * the answer straight onto the body.
   *
   * This runs a few hundred times per frame (every contact, every substep), so
   * it deliberately allocates NOTHING - the thresholds are computed inline
   * rather than returned in an object. On a throttled Chromebook the garbage
   * from the previous version cost several milliseconds a frame. */
  function refresh(body) {
    var sub = body.sub;
    if (!sub) {
      // A thermostatted prop such as the hand: it simply holds its temperature.
      body.temp = body.fixedTemp;
      body.state = 'solid';
      body.meltFrac = 0; body.boilFrac = 0;
      body.cap = Infinity;
      return body;
    }
    var m = body.mass > MIN_MASS ? body.mass : MIN_MASS;
    var e = body.energy;
    var melt = sub.melt, boil = sub.boil;
    var hasMelt = melt !== null && melt !== undefined;
    var e1 = hasMelt ? m * sub.cSolid * (melt - T0) : Infinity;

    if (e < e1) {
      body.temp = T0 + e / (m * sub.cSolid);
      body.state = 'solid';
      body.meltFrac = 0; body.boilFrac = 0;
      body.cap = m * sub.cSolid;
      return body;
    }
    var e2 = e1 + m * sub.latentMelt;
    if (e < e2) {
      body.temp = melt;
      body.state = 'melting';
      body.meltFrac = (e - e1) / (m * sub.latentMelt);
      body.boilFrac = 0;
      body.cap = Infinity;                 // a change of state soaks up energy
      return body;
    }
    var hasBoil = boil !== null && boil !== undefined;
    var e3 = hasBoil ? e2 + m * sub.cLiquid * (boil - melt) : Infinity;
    // The epsilon matters: boiling parks a body exactly ON e3 every frame (see
    // releaseVapour), and without it the state would flicker between "liquid"
    // and "boiling" sixty times a second.
    if (e < e3 - 1e-9) {
      body.temp = melt + (e - e2) / (m * sub.cLiquid);
      body.state = 'liquid';
      body.meltFrac = 1; body.boilFrac = 0;
      body.cap = m * sub.cLiquid;
      return body;
    }
    var e4 = e3 + m * sub.latentBoil;
    if (e < e4) {
      body.temp = boil;
      body.state = 'boiling';
      body.meltFrac = 1;
      body.boilFrac = (e - e3) / (m * sub.latentBoil);
      body.cap = Infinity;
      return body;
    }
    body.temp = boil + (e - e4) / (m * sub.cGas);
    body.state = 'gas';
    body.meltFrac = 1; body.boilFrac = 1;
    body.cap = m * sub.cGas;
    return body;
  }

  /* How much energy would bring a and b to the same temperature? A body in a
   * change of state has an effectively infinite capacity, so it simply soaks
   * up whatever arrives without changing temperature. */
  function equalisingEnergy(a, b) {
    var invA = a.cap === Infinity ? 0 : 1 / a.cap;
    var invB = b.cap === Infinity ? 0 : 1 / b.cap;
    var inv = invA + invB;
    if (inv <= 0) return Infinity;
    return (a.temp - b.temp) / inv;
  }

  /* Conduction: move energy from the hotter body to the colder one.
   * Returns the energy actually moved (always from a to b, so negative means
   * b was the hotter one). */
  function conduct(a, b, G, dt) {
    var dT = a.temp - b.temp;
    if (dT === 0 || G <= 0) return 0;
    var q = G * dT * dt;
    var lim = equalisingEnergy(a, b);
    if (isFinite(lim)) {
      // Never overshoot: that is what would let a cold body end up hotter.
      if (q > 0) q = Math.min(q, lim);
      else q = Math.max(q, lim);
    }
    a.energy -= q;
    b.energy += q;
    return q;
  }

  /* Two touching materials: the poorer conductor sets the pace, so use the
   * harmonic mean of their conductivities. */
  function pairConductance(base, kA, kB) {
    if (kA <= 0 || kB <= 0) return 0;
    return base * (2 * kA * kB) / (kA + kB);
  }

  /* While a liquid boils, the vapour leaves the bench. Take away the mass and
   * exactly the energy that mass was holding, which pins the temperature at
   * the boiling point and conserves energy to the last decimal place. */
  function releaseVapour(body) {
    var sub = body.sub;
    if (!sub || !has(sub.boil) || !body.openToAir) return 0;
    var th = thresholds(sub, body.mass);
    if (!isFinite(th.e3) || body.energy <= th.e3) return 0;
    var perMass = th.e3 / body.mass;              // energy per mass unit of liquid at boiling point
    var dm = (body.energy - th.e3) / sub.latentBoil;
    dm = Math.min(dm, Math.max(0, body.mass - MIN_MASS));
    if (dm <= 0) return 0;
    var carried = dm * (perMass + sub.latentBoil);
    body.mass -= dm;
    body.energy -= carried;
    body.vapourLost = (body.vapourLost || 0) + dm;
    return carried;
  }

  HL.Thermo = {
    MIN_MASS: MIN_MASS,
    thresholds: thresholds,
    energyForTemp: energyForTemp,
    refresh: refresh,
    conduct: conduct,
    pairConductance: pairConductance,
    equalisingEnergy: equalisingEnergy,
    releaseVapour: releaseVapour,

    /* Is this body currently sitting in a change of state? */
    isChanging: function (body) {
      return body.state === 'melting' || body.state === 'boiling';
    },

    /* Plain-language state name for the read-out. */
    stateLabel: function (body) {
      switch (body.state) {
        case 'melting': return HL.L(body.lastDir === 'down' ? 'state.freezing' : 'state.melting');
        case 'boiling': return HL.L(body.lastDir === 'down' ? 'state.condensing' : 'state.boiling');
        case 'liquid': return HL.L('state.liquid');
        case 'gas': return HL.L('state.gas');
        default: return HL.L('state.solid');
      }
    }
  };
})();
