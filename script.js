// ========================================
// MIST
// ========================================
// ========================================
// MIST
// ========================================

const mist = {
  synth: {
    volume: -24,
    noise: {
      type: 'pink'
    },
    envelope: {
      attack: 0.8,
      decay: 0.3,
      sustain: 0.5,
      release: 2
    }
  },

  filter: {
    frequency: 700,
    type: 'lowpass',
    rolloff: -12
  },

  reverb: {
    wet: 0.8,
    roomSize: 0.9
  },

  channel: {
    volume: -8,
    pan: 0
  }
}

let mistSynth
let mistFilter
let mistReverb
let mistChannel
let mistStarted = false

// ========================================
// INIT MIST
// ========================================

function initMist() {
  if (mistStarted) return

  mistSynth = new Tone.NoiseSynth(mist.synth)

  mistFilter = new Tone.Filter(mist.filter)

  mistReverb = new Tone.JCReverb(mist.reverb)

  mistChannel = new Tone.Channel(mist.channel)

  // MIST SIGNAL CHAIN

  mistSynth.chain(mistFilter, mistReverb, mistChannel)

  mistChannel.toDestination()

  mistStarted = true
}

// ========================================
// START MIST
// ========================================

document.getElementById('mistStart').addEventListener('click', async () => {
  await Tone.start()

  const context = Tone.getContext()

  if (context.state !== 'running') {
    await context.resume()
  }

  initMist()

  mistSynth.triggerAttack()

  console.log('MIST started')
})

// ========================================
// STOP MIST
// ========================================

document.getElementById('mistStop').addEventListener('click', () => {
  if (!mistSynth) return

  mistSynth.triggerRelease()

  console.log('MIST stopped')
})

// ========================================
// MIST VOLUME
// ========================================

document.getElementById('mistVolume').addEventListener('input', (event) => {
  if (!mistChannel) return

  mistChannel.volume.value = Number(event.target.value)
})

// ========================================
// MIST FILTER
// ========================================

document.getElementById('mistFilter').addEventListener('input', (event) => {
  if (!mistFilter) return

  mistFilter.frequency.value = Number(event.target.value)
})

// ========================================
// WATER
// ========================================

const water = {
  synth: {
    volume: -8,
    oscillator: {
      type: 'sine'
    },
    envelope: {
      attack: 0.01,
      decay: 0.4,
      sustain: 0.1,
      release: 1.2
    }
  },

  filter: {
    frequency: 900,
    type: 'lowpass',
    rolloff: -12
  },

  delay: {
    wet: 0.2,
    delayTime: 0.25,
    maxDelayTime: 1
  },

  reverb: {
    wet: 0.5,
    roomSize: 0.7
  },

  channel: {
    volume: -8,
    pan: -0.6
  },

  sequences: {
    CALM: [
      {
        time: '0:0:0',
        noteName: 'C5',
        duration: '8n',
        velocity: 0.5
      },
      {
        time: '0:2:0',
        noteName: 'G5',
        duration: '8n',
        velocity: 0.35
      }
    ],

    FLOW: [
      {
        time: '0:0:0',
        noteName: 'C5',
        duration: '8n',
        velocity: 0.5
      },
      {
        time: '0:0:2',
        noteName: 'E5',
        duration: '8n',
        velocity: 0.4
      },
      {
        time: '0:1:0',
        noteName: 'G5',
        duration: '8n',
        velocity: 0.5
      },
      {
        time: '0:1:2',
        noteName: 'E5',
        duration: '8n',
        velocity: 0.35
      },
      {
        time: '0:2:0',
        noteName: 'D5',
        duration: '8n',
        velocity: 0.4
      },
      {
        time: '0:2:2',
        noteName: 'G5',
        duration: '8n',
        velocity: 0.5
      },
      {
        time: '0:3:0',
        noteName: 'E5',
        duration: '8n',
        velocity: 0.35
      },
      {
        time: '0:3:2',
        noteName: 'C5',
        duration: '8n',
        velocity: 0.45
      }
    ],

    RAIN: [
      {
        time: '0:0:0',
        noteName: 'C5',
        duration: '16n',
        velocity: 0.3
      },
      {
        time: '0:0:1',
        noteName: 'E5',
        duration: '16n',
        velocity: 0.25
      },
      {
        time: '0:0:2',
        noteName: 'G5',
        duration: '16n',
        velocity: 0.35
      },
      {
        time: '0:0:3',
        noteName: 'D5',
        duration: '16n',
        velocity: 0.25
      },
      {
        time: '0:1:0',
        noteName: 'E5',
        duration: '16n',
        velocity: 0.3
      },
      {
        time: '0:1:1',
        noteName: 'G5',
        duration: '16n',
        velocity: 0.25
      },
      {
        time: '0:1:2',
        noteName: 'C5',
        duration: '16n',
        velocity: 0.3
      },
      {
        time: '0:1:3',
        noteName: 'D5',
        duration: '16n',
        velocity: 0.25
      }
    ]
  },

  loop: '1m'
}

// ========================================
// WATER AUDIO OBJECTS
// ========================================

let waterSynth
let waterPart
let waterChannel
let waterFilter
let waterReverb
let waterDelay

// ========================================
// INIT WATER
// ========================================

function initWater() {
  if (waterPart) return

  waterSynth = new Tone.PolySynth(Tone.Synth, water.synth)

  waterFilter = new Tone.Filter(water.filter)

  waterDelay = new Tone.PingPongDelay(water.delay)

  waterReverb = new Tone.JCReverb(water.reverb)

  waterChannel = new Tone.Channel(water.channel)

  // WATER SIGNAL CHAIN
  waterSynth.chain(waterFilter, waterDelay, waterReverb, waterChannel)

  waterChannel.toDestination()

  // WATER LOOP
  waterPart = new Tone.Part((time, note) => {
    waterSynth.triggerAttackRelease(
      note.noteName,
      note.duration,
      time,
      note.velocity
    )
  }, water.sequences.CALM)

  waterPart.loopEnd = water.loop
  waterPart.loop = true

  // Start muted.
  // START WATER will unmute it.
  waterChannel.mute = true

  waterPart.start(0)
}

// ========================================
// WATER START
// ========================================

document.getElementById('waterStart').addEventListener('click', async () => {
  await Tone.start()

  const context = Tone.getContext()

  if (context.state !== 'running') {
    await context.resume()
  }

  initWater()

  if (Tone.getTransport().state !== 'started') {
    Tone.getTransport().start()
  }

  waterChannel.mute = false

  console.log('WATER started')
})

// ========================================
// WATER STOP
// ========================================

document.getElementById('waterStop').addEventListener('click', () => {
  if (!waterChannel) return

  waterChannel.mute = true

  console.log('WATER stopped')
})

// ========================================
// WATER SEQUENCES
// ========================================

function changeWaterSequence(name) {
  if (!waterPart) {
    console.log('Start WATER first')

    return
  }

  const sequence = water.sequences[name]

  if (!sequence) {
    console.log('Water sequence not found:', name)

    return
  }

  waterPart.clear()

  sequence.forEach((note) => {
    waterPart.add(note.time, note)
  })

  console.log('WATER sequence:', name)
}

// ========================================
// WATER PRESET BUTTONS
// ========================================

document.getElementById('waterCalm').addEventListener('click', () => {
  changeWaterSequence('CALM')
})

document.getElementById('waterFlow').addEventListener('click', () => {
  changeWaterSequence('FLOW')
})

document.getElementById('waterRain').addEventListener('click', () => {
  changeWaterSequence('RAIN')
})

// ========================================
// WATER RANDOM
// ========================================

function randomWaterSequence() {
  if (!waterPart) {
    console.log('Start WATER first')

    return
  }

  const notes = ['C5', 'D5', 'E5', 'G5', 'A5']

  const randomSequence = []

  for (let i = 0; i < 8; i++) {
    const randomNote = notes[Math.floor(Math.random() * notes.length)]

    const randomVelocity = 0.2 + Math.random() * 0.3

    randomSequence.push({
      time: `0:${Math.floor(i / 4)}:${i % 4}`,

      noteName: randomNote,

      duration: '16n',

      velocity: randomVelocity
    })
  }

  waterPart.clear()

  randomSequence.forEach((note) => {
    waterPart.add(note.time, note)
  })

  console.log('WATER RANDOM:', randomSequence)
}

document.getElementById('waterRandom').addEventListener('click', () => {
  randomWaterSequence()
})

// ========================================
// BELL
// ========================================

const bell = {
  synth: {
    volume: -10,

    harmonicity: 3.5,

    oscillator: {
      type: 'sine'
    },

    envelope: {
      attack: 0.01,

      decay: 2,

      sustain: 0.05,

      release: 3
    }
  },

  // FILTER FOR BELL

  filter: {
    frequency: 1500,

    type: 'lowpass',

    rolloff: -12
  },

  chorus: {
    frequency: 1.0,
    delayTime: 3.5,
    depth: 0.5,
    wet: 0.35
  },

  reverb: {
    wet: 0.7,

    roomSize: 0.9
  },

  channel: {
    volume: -8,

    pan: 0.6
  },

  sequences: {
    TEMPLE: [
      {
        time: '0:0:0',
        noteName: 'C4',
        duration: '2n',
        velocity: 0.6
      },

      {
        time: '0:2:0',
        noteName: 'G4',
        duration: '2n',
        velocity: 0.35
      }
    ],

    ZEN: [
      {
        time: '0:0:0',
        noteName: 'C5',
        duration: '2n',
        velocity: 0.45
      },

      {
        time: '0:1:0',
        noteName: 'E5',
        duration: '2n',
        velocity: 0.3
      },

      {
        time: '0:2:0',
        noteName: 'G5',
        duration: '2n',
        velocity: 0.35
      },

      {
        time: '0:3:0',
        noteName: 'E5',
        duration: '2n',
        velocity: 0.25
      }
    ],

    NIGHT: [
      {
        time: '0:0:0',
        noteName: 'A5',
        duration: '2n',
        velocity: 0.3
      },

      {
        time: '0:2:0',
        noteName: 'E5',
        duration: '2n',
        velocity: 0.2
      }
    ]
  },

  loop: '1m'
}

// ========================================
// BELL AUDIO OBJECTS
// ========================================

let bellSynth
let bellLoop
let bellChannel
let bellFilter
let bellReverb
let bellChorus

// ========================================
// INIT BELL
// ========================================

function initBell() {
  if (bellLoop) return

  bellSynth = new Tone.FMSynth(bell.synth)

  // BELL FILTER

  bellFilter = new Tone.Filter(bell.filter)

  bellChorus = new Tone.Chorus(bell.chorus).start()

  bellReverb = new Tone.JCReverb(bell.reverb)

  bellChannel = new Tone.Channel(bell.channel)

  // BELL SIGNAL CHAIN

  bellSynth.chain(bellFilter, bellChorus, bellReverb, bellChannel)

  bellChannel.toDestination()

  // BELL LOOP

  bellLoop = new Tone.Part(
    (time, note) => {
      bellSynth.triggerAttackRelease(
        note.noteName,
        note.duration,
        time,
        note.velocity
      )
    },

    bell.sequences.ZEN
  )

  bellLoop.loopEnd = bell.loop

  bellLoop.loop = true

  // Start muted.
  // START BELL will unmute it.

  bellChannel.mute = true

  bellLoop.start(0)
}

// ========================================
// BELL START
// ========================================

document.getElementById('bellStart').addEventListener('click', async () => {
  await Tone.start()

  const context = Tone.getContext()

  if (context.state !== 'running') {
    await context.resume()
  }

  initBell()

  if (Tone.getTransport().state !== 'started') {
    Tone.getTransport().start()
  }

  bellChannel.mute = false

  console.log('BELL started')
})

// ========================================
// BELL STOP
// ========================================

document.getElementById('bellStop').addEventListener('click', () => {
  if (!bellChannel) return

  bellChannel.mute = true

  console.log('BELL stopped')
})

// ========================================
// BELL SEQUENCES
// ========================================

function changeBellSequence(name) {
  if (!bellLoop) {
    console.log('Start BELL first')

    return
  }

  const sequence = bell.sequences[name]

  if (!sequence) {
    console.log('Bell sequence not found:', name)

    return
  }

  bellLoop.clear()

  sequence.forEach((note) => {
    bellLoop.add(note.time, note)
  })

  console.log('BELL sequence:', name)
}

// ========================================
// BELL PRESET BUTTONS
// ========================================

document.getElementById('bellTemple').addEventListener('click', () => {
  changeBellSequence('TEMPLE')
})

document.getElementById('bellZen').addEventListener('click', () => {
  changeBellSequence('ZEN')
})

document.getElementById('bellNight').addEventListener('click', () => {
  changeBellSequence('NIGHT')
})

// ========================================
// BELL RANDOM
// ========================================

function randomBellSequence() {
  if (!bellLoop) {
    console.log('Start BELL first')

    return
  }

  const notes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5']

  const randomSequence = []

  for (let i = 0; i < 4; i++) {
    const randomNote = notes[Math.floor(Math.random() * notes.length)]

    const randomVelocity = 0.2 + Math.random() * 0.4

    randomSequence.push({
      time: `0:${i}:0`,

      noteName: randomNote,

      duration: '2n',

      velocity: randomVelocity
    })
  }

  bellLoop.clear()

  randomSequence.forEach((note) => {
    bellLoop.add(note.time, note)
  })

  console.log('BELL RANDOM:', randomSequence)
}

document.getElementById('bellRandom').addEventListener('click', () => {
  randomBellSequence()
})

// ========================================
// CONTROLS
// ========================================

// ----------------------------------------
// WATER VOLUME
// ----------------------------------------

document.getElementById('waterVolume').addEventListener('input', (event) => {
  if (!waterChannel) return

  waterChannel.volume.value = Number(event.target.value)
})

// ----------------------------------------
// WATER FILTER
// ----------------------------------------

document.getElementById('waterFilter').addEventListener('input', (event) => {
  if (!waterFilter) return

  waterFilter.frequency.value = Number(event.target.value)
})

// ----------------------------------------
// WATER REVERB
// ----------------------------------------

document.getElementById('waterReverb').addEventListener('input', (event) => {
  if (!waterReverb) return

  waterReverb.wet.value = Number(event.target.value)
})

// ----------------------------------------
// BELL VOLUME
// ----------------------------------------

document.getElementById('bellVolume').addEventListener('input', (event) => {
  if (!bellChannel) return

  bellChannel.volume.value = Number(event.target.value)
})

// ----------------------------------------
// BELL FILTER
// ----------------------------------------

document.getElementById('bellFilter').addEventListener('input', (event) => {
  if (!bellFilter) return

  bellFilter.frequency.value = Number(event.target.value)
})

// ----------------------------------------
// BELL REVERB
// ----------------------------------------

document.getElementById('bellReverb').addEventListener('input', (event) => {
  if (!bellReverb) return

  bellReverb.wet.value = Number(event.target.value)
})

// ----------------------------------------
// WATER PAN
// ----------------------------------------

document.getElementById('waterPan').addEventListener('input', (event) => {
  if (!waterChannel) return

  waterChannel.pan.value = Number(event.target.value)
})

// ----------------------------------------
// WATER DELAY
// ----------------------------------------

document.getElementById('waterDelay').addEventListener('input', (event) => {
  if (!waterDelay) return

  waterDelay.wet.value = Number(event.target.value)
})

// ----------------------------------------
// BELL PAN
// ----------------------------------------

document.getElementById('bellPan').addEventListener('input', (event) => {
  if (!bellChannel) return

  bellChannel.pan.value = Number(event.target.value)
})

// ----------------------------------------
// BELL CHORUS
// ----------------------------------------

document.getElementById('bellChorus').addEventListener('input', (event) => {
  if (!bellChorus) return

  bellChorus.wet.value = Number(event.target.value)
})

// ========================================
// TEMPO / BPM
// ========================================

const tempoControl = document.getElementById('tempoControl')

const tempoValue = document.getElementById('tempoValue')

tempoControl.addEventListener('input', (event) => {
  const bpm = Number(event.target.value)

  Tone.getTransport().bpm.value = bpm

  tempoValue.textContent = bpm
})
