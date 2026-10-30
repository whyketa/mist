// ========================================
// THE REMOTE
// ========================================
// outside:  blue ± water · green ± bell · orange ± mist
//           sun  — water modes  calm → flow → rain → random
//           moon — bell modes   temple → zen → night → random
//                  (night also puts the room into night mode)
//           waves — tempo 40 → 52 → 70 → 100
// under the cover, for the voice touched last:
//           warm/cool = filter · humidity = reverb
//           swing = pan · aroma = echo (delay / chorus)
// ========================================

;(() => {
  const room = document.getElementById('room')
  const remote = document.getElementById('remote')
  const lcdText = document.querySelector('#lcd span')
  const lcdDot = document.querySelector('#lcd i')
  const leds = [...document.querySelectorAll('.led')]
  const sliders = [...document.querySelectorAll('.slider')]

  // ----------------------------------------
  // layout: the wall and the table are drawn in code and fill any
  // window; the device and the remote are placed on them at a size
  // that never goes past the render's own pixels, so they stay sharp.
  // ----------------------------------------

  const stage = document.getElementById('stage')
  const stageTop = document.getElementById('stage-top')

  function fit() {
    const vw = innerWidth
    const vh = innerHeight

    const s = Math.min(vw / 1700, vh / 1050, 1)

    // the device and the remote on the table, centred together
    const tx = vw * 0.5 - 760 * s
    const ty = vh * 0.5 - 600 * s
    const t = `translate(${tx}px, ${ty}px) scale(${s})`
    stage.style.transform = t
    stageTop.style.transform = t

    // the cord runs from the back of the device off the right edge
    const xEnd = Math.round((vw - tx) / s + 60)
    const d = `M1262 616 C1310 618 1350 626 1420 627 L${xEnd} 628`
    document.querySelectorAll('.cord').forEach((p) => p.setAttribute('d', d))

    // where the table meets the wall, and its front edge
    room.style.setProperty('--hz', `${ty + 600 * s}px`)
    room.style.setProperty('--edge', `${Math.min(vh - 30, ty + 955 * s)}px`)
    room.style.setProperty('--gx', `${tx + 933 * s}px`)
    room.style.setProperty('--gy', `${ty + 377 * s}px`)
    room.style.setProperty('--ty', `${ty + 730 * s}px`)
    room.style.setProperty('--s', s.toFixed(4))

    // the remote in the hand: follows both width and height, with air above and below
    const rh = Math.round(Math.min(vh * 0.76, ((vw * 0.24) * 1719) / 616))
    const rw = (rh * 616) / 1719
    const rx = Math.round(Math.max(16, vw * 0.08))
    const ry = Math.round((vh - rh) / 2)
    room.style.setProperty('--rh', `${rh}px`)
    room.style.setProperty('--rx', `${rx}px`)
    room.style.setProperty('--ry', `${ry}px`)
    room.style.setProperty('--u', (rh / 963).toFixed(4))

    // where it lies on the table, on screen, for the pick-up move
    const tableX = tx + 406 * s
    const tableY = ty + 800 * s
    const cx = rx + rw * 0.5
    const cy = ry + rh * 0.39
    room.style.setProperty('--dx', `${tableX - cx}px`)
    room.style.setProperty('--dy', `${tableY - cy}px`)
    room.style.setProperty('--k', ((430 * s) / (rh * 0.78)).toFixed(4))
  }

  fit()
  addEventListener('resize', fit)

  room.addEventListener('scroll', () => {
    room.scrollTop = 0
    room.scrollLeft = 0
  })

  // ----------------------------------------
  // state
  // ----------------------------------------

  const COLOURS = {
    water: [70, 140, 255],
    bell: [70, 215, 120],
    mist: [255, 128, 60]
  }

  const MODES = {
    water: ['CALM', 'FLOW', 'RAIN', 'RANDOM'],
    bell: ['TEMPLE', 'ZEN', 'NIGHT', 'RANDOM']
  }

  const TEMPI = [40, 52, 70, 100]
  const STEPS = 5

  const state = {
    on: false,
    up: false,
    open: false,
    last: 'water',
    step: { water: 0, bell: 0, mist: 0 },
    mode: { water: 0, bell: 1 },
    tempo: 1,
    night: false,
    // slider positions, 0…1, matching the original synth defaults
    p: {
      water: { filter: 0.555, reverb: 0.5, pan: 0.2, echo: 0.2 },
      bell: { filter: 0.626, reverb: 0.7, pan: 0.8, echo: 0.35 },
      mist: { filter: 0.463, reverb: 0.8, pan: 0.5, echo: null }
    }
  }

  // ----------------------------------------
  // waking the sound on the first touch
  // ----------------------------------------

  async function wake() {
    if (state.on) return
    await window.Voices.wake()
    state.on = true
    window.Voices.pattern('water', MODES.water[state.mode.water])
    window.Voices.pattern('bell', MODES.bell[state.mode.bell])
    window.Voices.tempo(TEMPI[state.tempo])
    paintLeds()
  }

  // ----------------------------------------
  // the screen
  // ----------------------------------------

  function lcd(text, voice) {
    lcdText.textContent = text
    const c = COLOURS[voice || state.last]
    lcdDot.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`
    lcdDot.style.boxShadow = `0 0 6px rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.8)`
  }

  function readout(param, t) {
    if (param === 'filter') return `${Math.round((2200 + t * 4300) / 100) * 100}K`
    if (param === 'reverb') return `${Math.round(30 + t * 60)}%`
    if (param === 'pan') {
      const v = Math.round((t * 2 - 1) * 100)
      return Math.abs(v) < 6 ? '0' : v < 0 ? `L${-v}` : `R${v}`
    }
    if (param === 'echo') return t == null ? '--' : '▮'.repeat(Math.round(t * 5)) + '▯'.repeat(5 - Math.round(t * 5))
    return ''
  }

  // ----------------------------------------
  // voices
  // ----------------------------------------

  function nudge(voice, dir) {
    const next = Math.max(0, Math.min(STEPS, state.step[voice] + dir))
    state.last = voice
    paintSliders()

    if (next !== state.step[voice]) {
      state.step[voice] = next
      window.Voices.level(voice, next / STEPS)
    }

    lcd(next === 0 ? 'OFF' : '▮'.repeat(next) + '▯'.repeat(STEPS - next), voice)

    // the vapour follows the whole sound: every voice adds to it
    const total = state.step.water + state.step.bell + state.step.mist
    window.Steam.set(Math.min(1, total / 9))
    paintLeds()
  }

  function cycleMode(voice) {
    state.mode[voice] = (state.mode[voice] + 1) % 4
    const name = MODES[voice][state.mode[voice]]
    window.Voices.pattern(voice, name)
    state.last = voice
    paintSliders()
    lcd(`M${state.mode[voice] + 1}`, voice)

    if (voice === 'bell') setNight(name === 'NIGHT')
    lamp.flash = 0.6
  }

  function setNight(on) {
    state.night = on
    room.style.setProperty('--night', on ? 1 : 0)
  }

  function cycleTempo() {
    state.tempo = (state.tempo + 1) % TEMPI.length
    window.Voices.tempo(TEMPI[state.tempo])
    lcd(String(TEMPI[state.tempo]))
  }

  // the four lights on the device: one per voice, and ON
  const LED_VOICES = ['water', 'bell', 'mist', null]

  function paintLeds() {
    leds.forEach((el, i) => {
      const v = LED_VOICES[i]
      const on = v ? state.step[v] > 0 : state.step.water + state.step.bell + state.step.mist > 0
      el.classList.toggle('is-lit', on)
    })
  }

  function blinkLed(voice, strength) {
    const el = leds[LED_VOICES.indexOf(voice)]
    if (!el) return
    el.style.setProperty('--blink', (0.6 + strength).toFixed(2))
    el.classList.remove('is-blink')
    void el.offsetWidth
    el.classList.add('is-blink')
  }

  // ----------------------------------------
  // sliders
  // ----------------------------------------

  function paintSliders() {
    const p = state.p[state.last]
    sliders.forEach((el) => {
      const t = p[el.dataset.param]
      el.querySelector('b').style.setProperty('--p', `${(1 - (t == null ? 0.5 : t)) * 100}%`)
    })
  }

  sliders.forEach((el) => {
    const param = el.dataset.param

    function move(e) {
      const r = el.getBoundingClientRect()
      const t = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))
      state.p[state.last][param] = t
      el.querySelector('b').style.setProperty('--p', `${(1 - t) * 100}%`)
      window.Voices.param(state.last, param, t)
      lcd(readout(param, t))
    }

    el.addEventListener('pointerdown', async (e) => {
      // mist has no echo: the slider stays put and the screen says so
      if (state.p[state.last][param] == null) {
        lcd('OFF')
        return
      }
      e.preventDefault()
      await wake()
      el.setPointerCapture(e.pointerId)
      el.classList.add('is-dragging')
      move(e)
      el.onpointermove = move
    })

    el.addEventListener('pointerup', (e) => {
      el.classList.remove('is-dragging')
      el.onpointermove = null
      try {
        el.releasePointerCapture(e.pointerId)
      } catch (_) {}
    })
  })

  // ----------------------------------------
  // picking the remote up and putting it down
  // ----------------------------------------

  function setUp(up) {
    state.up = up
    room.classList.toggle('is-up', up)
    if (!up) setOpen(false)
  }

  function setOpen(open) {
    state.open = open
    remote.classList.toggle('is-open', open)
    if (open) {
      paintSliders()
      lcd(readout('reverb', state.p[state.last].reverb))
    }
  }

  document.getElementById('pickup').addEventListener('click', async () => {
    setUp(true)
    await wake()
  })

  document.getElementById('backdrop').addEventListener('click', () => setUp(false))
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setUp(false)
  })

  document.getElementById('cover').addEventListener('click', () => setOpen(!state.open))


  // ----------------------------------------
  // the keys
  // ----------------------------------------

  document.querySelectorAll('.key').forEach((key) => {
    key.addEventListener('mousedown', (e) => e.preventDefault())

    key.addEventListener('click', async () => {
      key.classList.add('is-hit')
      setTimeout(() => key.classList.remove('is-hit'), 160)

      await wake()

      if (key.dataset.voice) nudge(key.dataset.voice, key.dataset.act === 'up' ? 1 : -1)
      else if (key.dataset.fn === 'sun') cycleMode('water')
      else if (key.dataset.fn === 'moon') cycleMode('bell')
      else if (key.dataset.fn === 'tempo') cycleTempo()
    })
  })

  // ----------------------------------------
  // what the music does to the picture
  // ----------------------------------------

  const lamp = { r: 255, g: 255, b: 255, lit: 0, flash: 0 }

  window.onVoiceNote = (voice, note) => {
    blinkLed(voice, note.velocity)
    if (voice === 'bell') {
      window.Steam.ring(note.velocity * 1.4)
      lamp.flash = Math.max(lamp.flash, note.velocity * 0.6)
    } else {
      lamp.flash = Math.max(lamp.flash, note.velocity * 0.18)
    }
  }

  let last = performance.now()

  function frame(now) {
    // real elapsed time, so the lamp settles at the same speed on slow machines
    const dt = Math.min(0.5, (now - last) / 1000)
    last = now

    const playing = state.step.water + state.step.bell + state.step.mist > 0
    const targetLit = playing ? (state.night ? 0.06 : 0.92) : 0
    const c = COLOURS[state.last]

    const k = 1 - Math.pow(0.002, dt)
    lamp.r += (c[0] - lamp.r) * k
    lamp.g += (c[1] - lamp.g) * k
    lamp.b += (c[2] - lamp.b) * k
    lamp.lit += (targetLit - lamp.lit) * k
    lamp.flash *= Math.pow(0.08, dt)

    const lit = Math.min(1, lamp.lit * (1 + lamp.flash * 0.6))

    room.style.setProperty('--lr', Math.round(lamp.r))
    room.style.setProperty('--lg', Math.round(lamp.g))
    room.style.setProperty('--lb', Math.round(lamp.b))
    room.style.setProperty('--lit', lit.toFixed(3))

    window.Steam.colour(Math.round(lamp.r), Math.round(lamp.g), Math.round(lamp.b), Math.max(0.25, lit))

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  paintSliders()
})()
