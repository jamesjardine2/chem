/* Heat Lab - year-level vocabulary.
 *
 * Years 3/4 uses: heat, hot, cold, melt, freeze, boil.
 * Years 5/6 adds: heat energy, transfer, conduction, insulator, conductor,
 *                 change of state, evaporation, condensation.
 *
 * Every piece of on-screen wording lives here so a teacher can retune the
 * language without touching the app code. Keep strings SHORT - some students
 * read slowly and this gets projected on a whiteboard.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  var STRINGS = {
    /* key: [Years 3/4, Years 5/6] */
    'app.title':        ['Heat Lab', 'Heat Lab'],
    'app.subtitle':     ['Heating and cooling', 'Heat energy transfer'],

    'tool.energy':      ['Heat moving', 'Energy view'],
    'tool.camera':      ['Heat view', 'Heat camera'],
    'tool.lens':        ['Zoom in', 'Particles'],
    'tool.graph':       ['Graph', 'Graph'],
    'tool.play':        ['Play', 'Play'],
    'tool.pause':       ['Pause', 'Pause'],
    'tool.speed':       ['Speed', 'Speed'],
    'tool.reset':       ['Reset', 'Reset'],
    'tool.sound':       ['Sound', 'Sound'],
    'tool.challenges':  ['Missions', 'Missions'],
    'tool.predict':     ['Guess first', 'Predict'],
    'tool.help':        ['Help', 'Help'],

    'shelf.everyday':   ['Things to heat', 'Everyday materials'],
    'shelf.solids':     ['Hard things', 'Solids'],
    'shelf.surprising': ['Surprises', 'Surprising materials'],
    'shelf.containers': ['Cups and pots', 'Containers'],
    'shelf.wraps':      ['Wrap it up', 'Insulators'],
    'shelf.tools':      ['Tools', 'Tools'],
    'shelf.thermometer': ['Thermometer', 'Thermometer'],

    'station.cool':     ['Cold', 'Cooling'],
    'station.off':      ['Off', 'Off'],
    'station.heat':     ['Hot', 'Heating'],
    'station.label':    ['Heater', 'Heater / cooler'],

    'state.solid':      ['solid', 'solid'],
    'state.liquid':     ['liquid', 'liquid'],
    'state.gas':        ['gas', 'gas'],
    'state.melting':    ['melting', 'melting (change of state)'],
    'state.freezing':   ['freezing', 'freezing (change of state)'],
    'state.boiling':    ['boiling', 'boiling (evaporation)'],
    'state.condensing': ['drops forming', 'condensation'],

    'msg.heatmoves':    ['Heat moves from hot to cold', 'Heat energy transfers from hot to cold'],
    'msg.conductor':    ['Moves heat fast', 'Good conductor'],
    'msg.insulator':    ['Slows heat down', 'Good insulator'],
    'msg.needcontainer': ['Liquids need a cup or pot!', 'Liquids need a container!'],
    'msg.full':         ['That is full!', 'That container is full.'],
    'msg.scorched':     ['Oops - burnt!', 'Too hot - it has scorched.'],
    'msg.melted':       ['It melted!', 'It changed state: solid to liquid.'],
    'msg.frozen':       ['It froze!', 'It changed state: liquid to solid.'],
    'msg.boiled':       ['It is boiling!', 'It is boiling - liquid to gas.'],
    'msg.poured':       ['Mixed together!', 'Mixed - the energy shared out.'],
    'msg.wrapped':      ['Wrapped up warm', 'Insulated'],
    'msg.draghere':     ['Drag something onto the bench', 'Drag a material onto the bench'],

    'graph.title':      ['Temperature over time', 'Temperature over time'],
    'graph.x':          ['Time (seconds)', 'Time (seconds)'],
    'graph.y':          ['Temperature (°C)', 'Temperature (°C)'],
    'graph.flat':       ['Flat bit = changing state', 'Plateau = change of state'],
    'graph.empty':      ['Put a thermometer on something', 'Attach a thermometer to record'],

    'energy.in':        ['Heat added', 'Energy in'],
    'energy.out':       ['Heat taken away', 'Energy out'],
    'energy.total':     ['Heat in the things', 'Energy in the system'],
    'energy.room':      ['Lost to the room', 'Transferred to the room'],

    'lens.solid':       ['Packed tight, wobbling', 'Solid: fixed positions, vibrating'],
    'lens.liquid':      ['Sliding past each other', 'Liquid: particles slide past each other'],
    'lens.gas':         ['Zooming everywhere', 'Gas: particles spread out and move fast'],
    'lens.air':         ['Air in the room', 'Air - a gas - in the room'],

    'predict.ask':      ['What do you think?', 'Make a prediction'],
    'predict.locked':   ['Your guess', 'Your prediction'],
    'predict.result':   ['What happened', 'Result'],
    'predict.close':    ['So close!', 'Very close!'],
    'predict.right':    ['You called it!', 'Your prediction matched.'],
    'predict.surprise': ['Surprise!', 'A surprise - worth explaining why.'],
    'predict.skip':     ['Just try it', 'Skip prediction'],

    'ch.title':         ['Missions', 'Lab challenges'],
    'ch.start':         ['Start', 'Start'],
    'ch.done':          ['Done!', 'Complete'],
    'ch.goal':          ['Your job', 'Goal'],
    'ch.exit':          ['Back to free play', 'Free explore'],
    'ch.free':          ['Free play', 'Free explore'],
    'ch.win':           ['You did it!', 'Success!'],

    'start.begin':      ['Start the lab', 'Start the lab'],
    'start.li':         ['What we are learning', 'Learning Intention'],
    'start.sc':         ['I can:', 'I can:'],
    'start.year':       ['Year level words', 'Year level vocabulary'],

    'hint.drop':        ['Drop it on a heater', 'Place it on a station'],
    'hint.thermo':      ['Drag a thermometer onto it', 'Attach a thermometer to read its temperature']
  };

  HL.LEVELS = [
    { id: 'y34', label: 'Years 3/4' },
    { id: 'y56', label: 'Years 5/6' }
  ];

  HL.lang = { level: 'y34' };

  HL.L = function (key) {
    var row = STRINGS[key];
    if (!row) return key;
    return HL.lang.level === 'y56' ? row[1] : row[0];
  };

  HL.setLevel = function (level) {
    HL.lang.level = level === 'y56' ? 'y56' : 'y34';
  };

  /* Learning Intention and Success Criteria, shown on the start screen. */
  HL.LISC = {
    intention: 'To explore how heat energy moves between objects and how heating and cooling can change materials.',
    criteria: [
      'predict what will happen when I heat or cool a material.',
      'explain which way heat energy moves when a hot object touches a cold one.',
      'describe how heating and cooling can change a solid into a liquid, or a liquid into a gas, and back again.'
    ]
  };
})();
