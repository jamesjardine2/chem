/* Heat Lab - substance data.
 *
 * ENERGY UNITS
 * ------------
 * The model works in "lab energy units" (EU) rather than joules:
 *   1 EU = the energy needed to raise 1 mass unit of liquid water by 1 degC.
 * Heat capacities are therefore *relative* (liquid water = 1.0), which is what
 * the curriculum asks for, and it keeps the numbers small enough to show
 * students ("42 energy units moved").
 *
 * Melting and boiling points are real, rounded values. Latent heats are kept
 * in the right ORDER and proportion (boiling always costs more than melting)
 * but are compressed so a classroom experiment finishes inside a lesson:
 * real water needs 80 EU to melt and 540 EU to boil; we use 80 and 220.
 * The plateau behaviour students must observe is unchanged.
 *
 * To add a substance: add an entry here, then an item template below.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  HL.T0 = -60;        // reference temp for "zero stored energy" (degC)
  HL.ROOM_TEMP = 20;  // room air temperature (degC)

  /* Each substance:
   *   cSolid/cLiquid/cGas  relative heat capacity per mass unit
   *   melt / boil          degC, or null if it does not happen in our range
   *   latentMelt/latentBoil EU per mass unit held in the change of state
   *   cond                 relative conductivity (wool 0.05 ... metal 3.0)
   *   scorch               degC at which it burns/scorches, or null
   *   colors               per-state fill colours used by the renderer
   */
  var S = {
    water: {
      id: 'water', label: 'Water', chem: 'H₂O',
      cSolid: 0.5, cLiquid: 1.0, cGas: 0.5,
      melt: 0, boil: 100, latentMelt: 80, latentBoil: 220,
      cond: 0.6, scorch: null,
      colors: { solid: '#cfeaf7', solidEdge: '#8fc9e6', liquid: '#5aa9d6', gas: '#dbeaf2' },
      hint: 'Melts at 0 °C, boils at 100 °C.'
    },
    saltwater: {
      id: 'saltwater', label: 'Salt water',
      cSolid: 0.5, cLiquid: 0.95, cGas: 0.5,
      melt: -6, boil: 102, latentMelt: 76, latentBoil: 220,
      cond: 0.6, scorch: null,
      colors: { solid: '#d8e8ee', solidEdge: '#9dbfcc', liquid: '#4f93b8', gas: '#dbeaf2' },
      hint: 'Salt makes water freeze below 0 °C.'
    },
    orangejuice: {
      id: 'orangejuice', label: 'Orange juice',
      cSolid: 0.55, cLiquid: 0.95, cGas: 0.5,
      melt: -2, boil: 100, latentMelt: 72, latentBoil: 220,
      cond: 0.55, scorch: null,
      colors: { solid: '#ffd79a', solidEdge: '#e0a95c', liquid: '#f6a01e', gas: '#f7dfc0' },
      hint: 'Mostly water, so it behaves a lot like water.'
    },
    chocolate: {
      id: 'chocolate', label: 'Chocolate',
      cSolid: 0.35, cLiquid: 0.42, cGas: null,
      melt: 32, boil: null, latentMelt: 26, latentBoil: null,
      cond: 0.2, scorch: 90,
      colors: { solid: '#6b3a1e', solidEdge: '#4a2513', liquid: '#8a4a22', gas: null },
      hint: 'Melts at about 32 °C. Burns if it gets too hot.'
    },
    butter: {
      id: 'butter', label: 'Butter',
      cSolid: 0.5, cLiquid: 0.55, cGas: null,
      melt: 33, boil: null, latentMelt: 20, latentBoil: null,
      cond: 0.2, scorch: 130,
      colors: { solid: '#f5e08a', solidEdge: '#d7bd5b', liquid: '#f0cf5a', gas: null },
      hint: 'Melts at about 33 °C, then sizzles when very hot.'
    },
    wax: {
      id: 'wax', label: 'Candle wax',
      cSolid: 0.48, cLiquid: 0.55, cGas: null,
      melt: 55, boil: null, latentMelt: 22, latentBoil: null,
      cond: 0.15, scorch: 200,
      colors: { solid: '#f2ece0', solidEdge: '#cfc7b6', liquid: '#f6efdc', gas: null },
      hint: 'Goes from cloudy to clear as it melts at about 55 °C.'
    },
    honey: {
      id: 'honey', label: 'Honey',
      cSolid: 0.5, cLiquid: 0.6, cGas: 0.5,
      melt: -12, boil: 105, latentMelt: 40, latentBoil: 220,
      cond: 0.2, scorch: 160,
      colors: { solid: '#c98a1c', solidEdge: '#8c5d10', liquid: '#e0a32a', gas: '#f0ddb4' },
      hint: 'Thick when cold, runny when warm.'
    },
    icecream: {
      id: 'icecream', label: 'Ice cream',
      cSolid: 0.6, cLiquid: 0.8, cGas: null,
      melt: -2, boil: null, latentMelt: 42, latentBoil: null,
      cond: 0.3, scorch: null,
      colors: { solid: '#fdf2e3', solidEdge: '#e8d3b8', liquid: '#f6e3c8', gas: null },
      hint: 'Melts just below 0 °C, so it goes soft fast.'
    },
    marshmallow: {
      id: 'marshmallow', label: 'Marshmallow',
      cSolid: 0.4, cLiquid: 0.5, cGas: null,
      melt: 95, boil: null, latentMelt: 30, latentBoil: null,
      cond: 0.1, scorch: 125,
      puffAbove: 55,
      colors: { solid: '#fff6f3', solidEdge: '#e8cfc8', liquid: '#f3ded2', gas: null },
      hint: 'Puffs up when warm, toasts when hot.'
    },
    gallium: {
      id: 'gallium', label: 'Gallium',
      cSolid: 0.1, cLiquid: 0.12, cGas: null,
      melt: 30, boil: null, latentMelt: 18, latentBoil: null,
      cond: 2.0, scorch: null,
      colors: { solid: '#c3c8cf', solidEdge: '#8e959e', liquid: '#aeb6c0', gas: null },
      hint: 'A metal that melts at 30 °C - cooler than your hand!'
    },
    iron: {
      id: 'iron', label: 'Iron',
      cSolid: 0.11, cLiquid: 0.15, cGas: null,
      melt: 1538, boil: null, latentMelt: 60, latentBoil: null,
      cond: 3.0, scorch: null,
      colors: { solid: '#8d949c', solidEdge: '#5c6268', liquid: '#ffb26b', gas: null },
      hint: 'Heats up fast and stays solid. A good conductor.'
    },
    steel: {
      id: 'steel', label: 'Metal',
      cSolid: 0.11, cLiquid: 0.15, cGas: null,
      melt: 1450, boil: null, latentMelt: 60, latentBoil: null,
      cond: 3.0, scorch: null,
      colors: { solid: '#bcc3ca', solidEdge: '#868d95', liquid: '#ffb26b', gas: null },
      hint: 'Metal moves heat energy very quickly.'
    },
    brick: {
      id: 'brick', label: 'Brick',
      cSolid: 0.2, cLiquid: null, cGas: null,
      melt: null, boil: null, latentMelt: null, latentBoil: null,
      cond: 0.3, scorch: null,
      colors: { solid: '#a8563c', solidEdge: '#7a3b28', liquid: null, gas: null },
      hint: 'Stays solid. Holds its heat for a long time.'
    },
    rock: {
      id: 'rock', label: 'Rock',
      cSolid: 0.2, cLiquid: null, cGas: null,
      melt: null, boil: null, latentMelt: null, latentBoil: null,
      cond: 0.5, scorch: null,
      colors: { solid: '#8a8b86', solidEdge: '#5f6060', liquid: null, gas: null },
      hint: 'Stays solid at every temperature on this bench.'
    },
    wood: {
      id: 'wood', label: 'Wood',
      cSolid: 0.4, cLiquid: null, cGas: null,
      melt: null, boil: null, latentMelt: null, latentBoil: null,
      cond: 0.08, scorch: 250,
      colors: { solid: '#c08f52', solidEdge: '#8d6435', liquid: null, gas: null },
      hint: 'A poor conductor, so it feels cool to hold.'
    },
    soup: {
      id: 'soup', label: 'Soup',
      cSolid: 0.6, cLiquid: 0.95, cGas: 0.5,
      melt: -1, boil: 100, latentMelt: 78, latentBoil: 220,
      cond: 0.55, scorch: null,
      colors: { solid: '#e8b169', solidEdge: '#b9813d', liquid: '#e08a3c', gas: '#f0dcc4' },
      hint: 'Mostly water, served hot.'
    },
    /* The mystery sample copies one of these at random (see HL.pickMystery). */
    mystery: {
      id: 'mystery', label: 'Mystery', isMystery: true,
      cSolid: 0.4, cLiquid: 0.5, cGas: null,
      melt: 40, boil: null, latentMelt: 25, latentBoil: null,
      cond: 0.4, scorch: null,
      colors: { solid: '#b9b4c7', solidEdge: '#87829a', liquid: '#cdc8da', gas: null },
      hint: 'Heat it and cool it. What is its melting point?'
    }
  };
  HL.SUBSTANCES = S;

  /* Hidden pool for the "identify the mystery substance" challenge. */
  HL.MYSTERY_POOL = ['gallium', 'wax', 'chocolate', 'butter', 'saltwater'];

  HL.pickMystery = function () {
    var pool = HL.MYSTERY_POOL;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var src = S[pick];
    var m = {};
    for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) m[k] = src[k]; }
    m.id = 'mystery';
    m.label = 'Mystery';
    m.isMystery = true;
    m.answer = pick;
    m.colors = S.mystery.colors;
    m.hint = S.mystery.hint;
    return m;
  };

  /* ---- Item templates: what appears on the shelf ------------------------ */
  /* form drives the artwork: cube, block, slab, spoon, scoop, blob, puff,
   * liquid (needs a container), stick, hand.                               */
  HL.TEMPLATES = [
    { id: 'icecube',   sub: 'water',       label: 'Ice cube',   group: 'everyday', form: 'cube',  mass: 0.4, temp: -8,  w: 66,  h: 62 },
    { id: 'snow',      sub: 'water',       label: 'Snow',       group: 'everyday', form: 'snow',  mass: 0.3, temp: -12, w: 82,  h: 50, cond: 0.12 },
    { id: 'water',     sub: 'water',       label: 'Water',      group: 'everyday', form: 'liquid', mass: 0.8, temp: 20, needsContainer: true },
    { id: 'hotwater',  sub: 'water',       label: 'Hot water',  group: 'everyday', form: 'liquid', mass: 0.8, temp: 80, needsContainer: true },
    { id: 'coldwater', sub: 'water',       label: 'Cold water', group: 'everyday', form: 'liquid', mass: 0.8, temp: 4,  needsContainer: true },
    { id: 'chocolate', sub: 'chocolate',   label: 'Chocolate',  group: 'everyday', form: 'slab',  mass: 0.5, temp: 20,  w: 84,  h: 44 },
    { id: 'butter',    sub: 'butter',      label: 'Butter',     group: 'everyday', form: 'block', mass: 0.4, temp: 8,   w: 74,  h: 46 },
    { id: 'wax',       sub: 'wax',         label: 'Candle wax', group: 'everyday', form: 'cube',  mass: 0.5, temp: 20,  w: 64,  h: 58 },
    { id: 'honey',     sub: 'honey',       label: 'Honey',      group: 'everyday', form: 'liquid', mass: 0.8, temp: 20, needsContainer: true },
    { id: 'icecream',  sub: 'icecream',    label: 'Ice cream',  group: 'everyday', form: 'scoop', mass: 0.5, temp: -14, w: 78,  h: 70 },
    { id: 'marshmallow', sub: 'marshmallow', label: 'Marshmallow', group: 'everyday', form: 'puff', mass: 0.25, temp: 20, w: 62, h: 58 },
    { id: 'soup',      sub: 'soup',        label: 'Soup',       group: 'everyday', form: 'liquid', mass: 0.8, temp: 85, needsContainer: true },

    { id: 'iron',      sub: 'iron',        label: 'Iron block', group: 'solids',   form: 'block', mass: 2.0, temp: 20,  w: 78,  h: 66 },
    { id: 'hotiron',   sub: 'iron',        label: 'Hot iron',   group: 'solids',   form: 'block', mass: 2.0, temp: 140, w: 78,  h: 66 },
    { id: 'brick',     sub: 'brick',       label: 'Brick',      group: 'solids',   form: 'block', mass: 1.4, temp: 20,  w: 96,  h: 52 },
    { id: 'rock',      sub: 'rock',        label: 'Rock',       group: 'solids',   form: 'rock',  mass: 1.0, temp: 20,  w: 78,  h: 58 },
    { id: 'spoonmetal', sub: 'steel',      label: 'Metal spoon', group: 'solids',  form: 'spoon', mass: 1.0, temp: 20,  w: 40,  h: 120, contactFactor: 0.15 },
    { id: 'spoonwood', sub: 'wood',        label: 'Wooden spoon', group: 'solids', form: 'spoon', mass: 1.0, temp: 20,  w: 40,  h: 120, contactFactor: 0.15 },

    { id: 'gallium',   sub: 'gallium',     label: 'Gallium',    group: 'surprising', form: 'block', mass: 0.5, temp: 20, w: 70, h: 52 },
    { id: 'saltwater', sub: 'saltwater',   label: 'Salt water', group: 'surprising', form: 'liquid', mass: 0.8, temp: 20, needsContainer: true },
    { id: 'frozenoj',  sub: 'orangejuice', label: 'Frozen OJ',  group: 'surprising', form: 'cube',  mass: 0.5, temp: -10, w: 66, h: 62 },
    { id: 'mystery',   sub: 'mystery',     label: 'Mystery',    group: 'surprising', form: 'cube',  mass: 0.5, temp: 20, w: 66, h: 62 },
    { id: 'hand',      sub: null,          label: 'Hand',       group: 'surprising', form: 'hand',  mass: 0,   temp: 37, w: 86, h: 74, fixedTemp: 37 }
  ];

  HL.templateById = function (id) {
    for (var i = 0; i < HL.TEMPLATES.length; i++) {
      if (HL.TEMPLATES[i].id === id) return HL.TEMPLATES[i];
    }
    return null;
  };

  /* ---- Containers ------------------------------------------------------- */
  HL.CONTAINERS = [
    { id: 'pot',    label: 'Metal pot',   cond: 2.6,  mass: 0.5, c: 0.11, capacity: 2.4, w: 150, h: 96,  colors: { body: '#b9c0c7', edge: '#7d848b' } },
    { id: 'beaker', label: 'Glass beaker', cond: 0.8, mass: 0.4, c: 0.2,  capacity: 1.8, w: 112, h: 118, colors: { body: '#dceaf0', edge: '#9fb8c2' } },
    { id: 'foam',   label: 'Foam cup',    cond: 0.05, mass: 0.1, c: 0.3,  capacity: 1.6, w: 100, h: 112, colors: { body: '#fbfbf8', edge: '#d8d8d2' } },
    { id: 'mug',    label: 'Clay mug',    cond: 0.35, mass: 0.5, c: 0.25, capacity: 1.6, w: 112, h: 100, colors: { body: '#d87f5f', edge: '#a4573b' } }
  ];

  HL.containerById = function (id) {
    for (var i = 0; i < HL.CONTAINERS.length; i++) {
      if (HL.CONTAINERS[i].id === id) return HL.CONTAINERS[i];
    }
    return null;
  };

  /* ---- Insulation wraps ------------------------------------------------- */
  /* airFactor multiplies how fast the wrapped thing swaps heat with the room:
   * 1.0 = no change, 0.15 = only 15% as fast.                              */
  HL.WRAPS = [
    { id: 'wool',   label: 'Wool',        airFactor: 0.18, color: '#c98fa8', pattern: 'wool' },
    { id: 'foil',   label: 'Foil',        airFactor: 0.55, color: '#cfd6dc', pattern: 'foil' },
    { id: 'bubble', label: 'Bubble wrap', airFactor: 0.22, color: '#cfe6ee', pattern: 'bubble' },
    { id: 'sock',   label: 'Sock',        airFactor: 0.3,  color: '#9fb6d6', pattern: 'sock' }
  ];

  HL.wrapById = function (id) {
    for (var i = 0; i < HL.WRAPS.length; i++) {
      if (HL.WRAPS[i].id === id) return HL.WRAPS[i];
    }
    return null;
  };
})();
