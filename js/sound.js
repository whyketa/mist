// ========================================
// MIST — the three voices
// ========================================
// The sound design is the same as in the original synth.
// Only the controls changed: everything is driven by the
// remote (remote.js) through the small panel at the end.
// ========================================

const mist = {
  synth: {
    volume: -24,
    noise: { type: 'pink' },
    envelope: { attack: 0.8, decay: 0.3, sustain: 0.5, release: 2 }
  },
  filter: { frequency: 700, type: 'lowpass', rolloff: -12 },
  reverb: { wet: 0.8, roomSize: 0.9 },
  channel: { volume: -8, pan: 0 }
}

let mistSynth, mistFilter, mistReverb, mistChannel

function initMist() {
  if (mistSynth) return

  mistSynth = new Tone.NoiseSynth(mist.synth)
  mistFilter = new Tone.Filter(mist.filter)
  mistReverb = new Tone.JCReverb(mist.reverb)
  mistChannel = new Tone.Channel(mist.channel)

  // MIST SIGNAL CHAIN
  mistSynth.chain(mistFilter, mistReverb, mistChannel)
  mistChannel.toDestination()

  mistChannel.mute = true
}

// ========================================
// WATER
// ========================================

const water = {
  synth: {
    volume: -8,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 1.2 }
  },
  filter: { frequency: 900, type: 'lowpass', rolloff: -12 },
  delay: { wet: 0.2, delayTime: 0.25, maxDelayTime: 1 },
  reverb: { wet: 0.5, roomSize: 0.7 },
  channel: { volume: -8, pan: -0.6 },

  sequences: {
    CALM: [
      { time: '0:0:0', noteName: 'C5', duration: '8n', velocity: 0.5 },
      { time: '0:2:0', noteName: 'G5', duration: '8n', velocity: 0.35 }
    ],
    FLOW: [
      { time: '0:0:0', noteName: 'C5', duration: '8n', velocity: 0.5 },
      { time: '0:0:2', noteName: 'E5', duration: '8n', velocity: 0.4 },
      { time: '0:1:0', noteName: 'G5', duration: '8n', velocity: 0.5 },
      { time: '0:1:2', noteName: 'E5', duration: '8n', velocity: 0.35 },
      { time: '0:2:0', noteName: 'D5', duration: '8n', velocity: 0.4 },
      { time: '0:2:2', noteName: 'G5', duration: '8n', velocity: 0.5 },
      { time: '0:3:0', noteName: 'E5', duration: '8n', velocity: 0.35 },
      { time: '0:3:2', noteName: 'C5', duration: '8n', velocity: 0.45 }
    ],
    RAIN: [
      { time: '0:0:0', noteName: 'C5', duration: '16n', velocity: 0.3 },
      { time: '0:0:1', noteName: 'E5', duration: '16n', velocity: 0.25 },
      { time: '0:0:2', noteName: 'G5', duration: '16n', velocity: 0.35 },
      { time: '0:0:3', noteName: 'D5', duration: '16n', velocity: 0.25 },
      { time: '0:1:0', noteName: 'E5', duration: '16n', velocity: 0.3 },
      { time: '0:1:1', noteName: 'G5', duration: '16n', velocity: 0.25 },
      { time: '0:1:2', noteName: 'C5', duration: '16n', velocity: 0.3 },
      { time: '0:1:3', noteName: 'D5', duration: '16n', velocity: 0.25 }
    ]
  },
  loop: '1m'
}

let waterSynth, waterPart, waterChannel, waterFilter, waterReverb, waterDelay

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

  waterPart = new Tone.Part((time, note) => {
    waterSynth.triggerAttackRelease(note.noteName, note.duration, time, note.velocity)
    Tone.Draw.schedule(() => window.onVoiceNote && window.onVoiceNote('water', note), time)
  }, water.sequences.CALM)

  waterPart.loopEnd = water.loop
  waterPart.loop = true
  waterChannel.mute = true
  waterPart.start(0)
}

function randomWaterSequence() {
  const notes = ['C5', 'D5', 'E5', 'G5', 'A5']
  const seq = []

  for (let i = 0; i < 8; i++) {
    seq.push({
      time: `0:${Math.floor(i / 4)}:${i % 4}`,
      noteName: notes[Math.floor(Math.random() * notes.length)],
      duration: '16n',
      velocity: 0.2 + Math.random() * 0.3
    })
  }

  return seq
}

// ========================================
// BELL
// ========================================

const bell = {
  synth: {
    volume: -10,
    harmonicity: 3.5,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 2, sustain: 0.05, release: 3 }
  },
  filter: { frequency: 1500, type: 'lowpass', rolloff: -12 },
  chorus: { frequency: 1.0, delayTime: 3.5, depth: 0.5, wet: 0.35 },
  reverb: { wet: 0.7, roomSize: 0.9 },
  channel: { volume: -8, pan: 0.6 },

  sequences: {
    TEMPLE: [
      { time: '0:0:0', noteName: 'C4', duration: '2n', velocity: 0.6 },
      { time: '0:2:0', noteName: 'G4', duration: '2n', velocity: 0.35 }
    ],
    ZEN: [
      { time: '0:0:0', noteName: 'C5', duration: '2n', velocity: 0.45 },
      { time: '0:1:0', noteName: 'E5', duration: '2n', velocity: 0.3 },
      { time: '0:2:0', noteName: 'G5', duration: '2n', velocity: 0.35 },
      { time: '0:3:0', noteName: 'E5', duration: '2n', velocity: 0.25 }
    ],
    NIGHT: [
      { time: '0:0:0', noteName: 'A5', duration: '2n', velocity: 0.3 },
      { time: '0:2:0', noteName: 'E5', duration: '2n', velocity: 0.2 }
    ]
  },
  loop: '1m'
}

let bellSynth, bellLoop, bellChannel, bellFilter, bellReverb, bellChorus

function initBell() {
  if (bellLoop) return

  bellSynth = new Tone.FMSynth(bell.synth)
  bellFilter = new Tone.Filter(bell.filter)
  bellChorus = new Tone.Chorus(bell.chorus).start()
  bellReverb = new Tone.JCReverb(bell.reverb)
  bellChannel = new Tone.Channel(bell.channel)

  // BELL SIGNAL CHAIN
  bellSynth.chain(bellFilter, bellChorus, bellReverb, bellChannel)
  bellChannel.toDestination()

  bellLoop = new Tone.Part((time, note) => {
    bellSynth.triggerAttackRelease(note.noteName, note.duration, time, note.velocity)
    Tone.Draw.schedule(() => window.onVoiceNote && window.onVoiceNote('bell', note), time)
  }, bell.sequences.ZEN)

  bellLoop.loopEnd = bell.loop
  bellLoop.loop = true
  bellChannel.mute = true
  bellLoop.start(0)
}

function randomBellSequence() {
  const notes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5']
  const seq = []

  for (let i = 0; i < 4; i++) {
    seq.push({
      time: `0:${i}:0`,
      noteName: notes[Math.floor(Math.random() * notes.length)],
      duration: '2n',
      velocity: 0.2 + Math.random() * 0.4
    })
  }

  return seq
}

function loadPart(part, seq) {
  part.clear()
  seq.forEach((note) => part.add(note.time, note))
}

// ========================================
// THE PANEL THE REMOTE TALKS TO
// ========================================

const FADE = 1.2

// channel volume for level 0.2 … 1.0 (five steps on the remote)
const RANGE = {
  water: [-18, 0],
  bell: [-18, 0],
  mist: [-10, 6]
}

const levels = { water: 0, bell: 0, mist: 0 }

let ready = false

async function wake() {
  if (ready) return

  await Tone.start()

  const ctx = Tone.getContext()
  if (ctx.state !== 'running') await ctx.resume()

  initMist()
  initWater()
  initBell()

  Tone.getTransport().bpm.value = 52
  if (Tone.getTransport().state !== 'started') Tone.getTransport().start()

  ready = true
}

function channelOf(voice) {
  return voice === 'water' ? waterChannel : voice === 'bell' ? bellChannel : mistChannel
}

function setLevel(voice, level) {
  if (!ready) return

  const was = levels[voice]
  const ch = channelOf(voice)
  const [lo, hi] = RANGE[voice]

  levels[voice] = level

  if (level > 0) {
    if (was === 0) {
      ch.volume.value = lo - 18
      ch.mute = false
      if (voice === 'mist') mistSynth.triggerAttack()
    }
    ch.volume.rampTo(lo + (hi - lo) * level, FADE)
  } else if (was > 0) {
    ch.volume.rampTo(lo - 24, FADE)
    if (voice === 'mist') mistSynth.triggerRelease()
    setTimeout(() => {
      if (levels[voice] === 0) ch.mute = true
    }, FADE * 1000 + 300)
  }
}

// value is 0…1 from the slider; each voice maps it to its own range
function setParam(voice, param, t) {
  if (!ready) return

  const log = (lo, hi) => lo * Math.pow(hi / lo, t)

  if (param === 'filter') {
    const f = voice === 'bell' ? log(200, 5000) : log(200, 3000)
    ;({ water: waterFilter, bell: bellFilter, mist: mistFilter })[voice].frequency.rampTo(f, 0.1)
  }

  if (param === 'reverb') {
    ;({ water: waterReverb, bell: bellReverb, mist: mistReverb })[voice].wet.rampTo(t, 0.1)
  }

  if (param === 'pan') {
    channelOf(voice).pan.rampTo(t * 2 - 1, 0.1)
  }

  if (param === 'echo') {
    if (voice === 'water') waterDelay.wet.rampTo(t, 0.1)
    if (voice === 'bell') bellChorus.wet.rampTo(t, 0.1)
  }
}

function setPattern(voice, name) {
  if (!ready) return

  if (voice === 'water') {
    loadPart(waterPart, name === 'RANDOM' ? randomWaterSequence() : water.sequences[name])
  } else {
    loadPart(bellLoop, name === 'RANDOM' ? randomBellSequence() : bell.sequences[name])
  }
}

function setTempo(bpm) {
  if (!ready) return
  Tone.getTransport().bpm.rampTo(bpm, 2)
}

window.Voices = {
  wake,
  level: setLevel,
  param: setParam,
  pattern: setPattern,
  tempo: setTempo,
  get ready() {
    return ready
  }
}
