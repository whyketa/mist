// =========================================================
// MIST — visuals
//   pond   : WebGL2 — pebble bed, caustics, refraction, koi,
//            lily pads, a real ripple simulation
//   air    : fireflies over the water at night
//   fog    : WebGL — rolls in slowly on START MIST, lies over
//            the whole UI but thins out over the controls
// script.js is untouched. This file listens to the same buttons
// and wraps waterSynth / bellSynth to sync visuals with notes.
// =========================================================

;(() => {
  'use strict'

  const STAGE_W = 1440
  const STAGE_H = 900
  const $ = (id) => document.getElementById(id)
  const root = document.documentElement
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const T0 = performance.now()
  const now = () => (performance.now() - T0) / 1000

  // seeded random so the pond bed is the same every visit
  function rng(seed) {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  // ---------------------------------------------------------
  // Stage scaling: the design is 1440×900 and scales to fit
  // ---------------------------------------------------------

  const stage = $('stage')
  let stageScale = 1
  function fit() {
    stageScale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H)
    stage.style.transform = `translate(-50%, -50%) scale(${stageScale})`
  }
  fit()

  // ---------------------------------------------------------
  // State shared by every layer
  // ---------------------------------------------------------

  const S = ({
    night: 0,
    nightTarget: 0,
    fogReveal: 0,
    fogTarget: 0,
    fogDensity: 0.8,
    clarity: 1,
    damp: 0.992,
    delay: 0.2,
    waterPan: -0.6,
    bellPan: 0.6,
    chorus: 0.3,
    tempo: 1,
    lastClick: -10
  })

  // ---------------------------------------------------------
  // Slider fill, readouts, and slider → visual mapping
  // ---------------------------------------------------------

  const fmt = {
    db: (v) => `${v} dB`,
    hz: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v} Hz`),
    pct: (v) => `${Math.round(v * 100)}%`,
    pan: (v) => {
      v = Number(v)
      if (Math.abs(v) < 0.03) return 'C'
      return `${v < 0 ? 'L' : 'R'} ${Math.round(Math.abs(v) * 100)}`
    }
  }

  const visualMap = {
    // the water filter decides how clear the pond is
    waterFilter: (v) => (S.clarity = lerp(0.45, 1.15, (v - 200) / 2800)),
    // reverb = how long the rings live
    waterReverb: (v) => (S.damp = lerp(0.984, 0.9965, v)),
    // ping-pong delay = an echo drop on the opposite side
    waterDelay: (v) => (S.delay = Number(v)),
    // pan = where the drops fall
    waterPan: (v) => (S.waterPan = Number(v)),
    bellPan: (v) => (S.bellPan = Number(v)),
    bellChorus: (v) => (S.chorus = Number(v)),
    // mist volume = fog density
    mistVolume: (v) => (S.fogDensity = lerp(0.55, 1.05, (v - -40) / 35)),
    tempoControl: (v) => {
      S.tempo = v / 52
      root.style.setProperty('--beat', `${(60 / v) * 2}s`)
    }
  }

  document.querySelectorAll('input[type=range]').forEach((input) => {
    const out = document.querySelector(`output[data-for="${input.id}"]`)
    const centered = input.hasAttribute('data-center')
    const update = () => {
      const p = ((input.value - input.min) / (input.max - input.min)) * 100
      input.style.setProperty('--a', (centered ? Math.min(p, 50) : 0) + '%')
      input.style.setProperty('--b', (centered ? Math.max(p, 50) : p) + '%')
      if (out) out.textContent = fmt[out.dataset.fmt](input.value)
      if (visualMap[input.id]) visualMap[input.id](Number(input.value))
    }
    input.addEventListener('input', update)
    update()
  })

  // ---------------------------------------------------------
  // Day / night
  // ---------------------------------------------------------

  function setNight(on) {
    root.dataset.mode = on ? 'night' : 'day'
    S.nightTarget = on ? 1 : 0
  }
  // the NIGHT bell pattern darkens the pond; the others bring the day back
  $('bellNight').addEventListener('click', () => setNight(true))
  $('bellTemple').addEventListener('click', () => setNight(false))
  $('bellZen').addEventListener('click', () => setNight(false))

  // ---------------------------------------------------------
  // Panel states, presets, auto-start on first preset click
  // ---------------------------------------------------------

  const readyCheck = {
    water: () => typeof waterPart !== 'undefined' && waterPart,
    bell: () => typeof bellLoop !== 'undefined' && bellLoop
  }

  function setOn(name, on) {
    const panel = $(name)
    panel.classList.toggle('is-on', on)
    const st = panel.querySelector('.status b')
    if (st) st.textContent = on ? 'playing' : 'off'
  }

  ;['water', 'bell', 'mist'].forEach((name) => {
    $(name + 'Start').addEventListener('click', () => {
      setOn(name, true)
      if (name === 'mist') S.fogTarget = 1
      else hookSynths()
    })
    $(name + 'Stop').addEventListener('click', () => {
      setOn(name, false)
      if (name === 'mist') S.fogTarget = 0
    })
  })

  document.querySelectorAll('.presets').forEach((group) => {
    const panel = group.closest('.panel')
    const name = panel.id
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip')
      if (!chip) return
      group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === chip))
      if (chip.classList.contains('chip--dice')) {
        chip.classList.remove('is-rolled')
        void chip.offsetWidth
        chip.classList.add('is-rolled')
      }
      // script.js ignores presets until the voice is started:
      // start it, wait for the part to exist, then apply the preset
      if (!readyCheck[name]()) {
        $(name + 'Start').click()
        const t0 = performance.now()
        const wait = () => {
          if (readyCheck[name]()) chip.click()
          else if (performance.now() - t0 < 6000) setTimeout(wait, 60)
        }
        setTimeout(wait, 60)
      }
    })
  })

  // ---------------------------------------------------------
  // Hook the synths: every note leaves a mark on the pond
  // ---------------------------------------------------------

  let waterHooked = false
  let bellHooked = false

  function hookSynths() {
    const t0 = performance.now()
    const tryHook = () => {
      try {
        if (!waterHooked && typeof waterSynth !== 'undefined' && waterSynth) {
          const orig = waterSynth.triggerAttackRelease.bind(waterSynth)
          waterSynth.triggerAttackRelease = (note, dur, time, vel) => {
            if (!waterChannel.mute) Tone.getDraw().schedule(() => onWaterNote(note, vel), time)
            return orig(note, dur, time, vel)
          }
          waterHooked = true
        }
        if (!bellHooked && typeof bellSynth !== 'undefined' && bellSynth) {
          const orig = bellSynth.triggerAttackRelease.bind(bellSynth)
          bellSynth.triggerAttackRelease = (note, dur, time, vel) => {
            if (!bellChannel.mute) Tone.getDraw().schedule(() => onBellNote(note, vel), time)
            return orig(note, dur, time, vel)
          }
          bellHooked = true
        }
      } catch (err) {
        /* synth not ready yet */
      }
      if ((!waterHooked || !bellHooked) && performance.now() - t0 < 6000) setTimeout(tryHook, 80)
    }
    tryHook()
  }

  // panels in viewport px (for fog thinning and drop placement)
  let panelRects = []
  function measurePanels() {
    panelRects = [...document.querySelectorAll('.panel')].map((p) => p.getBoundingClientRect())
  }

  function inPanel(x, y, pad = 10) {
    return panelRects.some((r) => x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad)
  }

  const r = rng(Date.now() & 0xffff)

  function openWaterSpot(biasX) {
    // no opaque slabs any more: the whole surface is open water
    const x = clamp(0.5 + biasX * 0.38 + (r() - 0.5) * 0.8, 0.03, 0.97) * innerWidth
    const y = (0.04 + r() * 0.92) * innerHeight
    return [x, y]
  }

  function onWaterNote(note, vel = 0.4) {
    const [x, y] = openWaterSpot(S.waterPan)
    const s = 0.12 + vel * 0.32
    pond.drop(x, y, 16 + vel * 14, s)
    floaters.push(x, y, 140, 0.6)
    // ping-pong delay → an echo landing on the opposite side
    if (S.delay > 0.06) {
      const ex = innerWidth - x
      setTimeout(() => pond.drop(ex, y + (r() - 0.5) * 60, 12, s * S.delay * 0.9), 380 / S.tempo)
    }
  }

  const bellTitle = document.querySelector('#bell h2')

  function onBellNote(note, vel = 0.4) {
    // the word "bell" glows coral on every strike
    bellTitle.classList.remove('is-ringing')
    void bellTitle.offsetWidth
    bellTitle.classList.add('is-ringing')
    // a slow ring opens on the water where the bell is panned
    const bx = clamp(0.5 + S.bellPan * 0.42 + (r() - 0.5) * 0.16, 0.04, 0.96) * innerWidth
    const by = (0.08 + r() * 0.84) * innerHeight
    pond.drop(bx, by, 30, 0.1 + vel * 0.18)
    setTimeout(() => pond.drop(bx, by, 46, 0.05 + vel * 0.08), 420)
    air.flash(bx, by, 'bloom')
  }

  // ---------------------------------------------------------
  // Shared GL helpers
  // ---------------------------------------------------------

  function makeProgram(gl, vsSrc, fsSrc) {
    const sh = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
      return s
    }
    const p = gl.createProgram()
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc))
    gl.bindAttribLocation(p, 0, 'aPos')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
    const u = {}
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)
      const name = info.name.replace(/\[0\]$/, '')
      u[name] = gl.getUniformLocation(p, info.name)
    }
    return { p, u }
  }

  function fullscreenTriangle(gl) {
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  const VS = `#version 300 es
  in vec2 aPos; out vec2 vUv;
  void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`

  const NOISE = `
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 x){ vec2 i=floor(x), f=fract(x); vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  vec3 noised(vec2 x){ vec2 i=floor(x), f=fract(x);
    vec2 u=f*f*f*(f*(f*6.-15.)+10.); vec2 du=30.*f*f*(f*(f-2.)+1.);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    float k1=b-a, k2=c-a, k4=a-b-c+d;
    return vec3(a+k1*u.x+k2*u.y+k4*u.x*u.y, du*vec2(k1+k4*u.y, k2+k4*u.x)); }
  float fbm(vec2 p){ float s=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<5;i++){ s+=a*vnoise(p); p=m*p; a*=.5; } return s; }
  `

  // =========================================================
  // POND BED (generated once on a 2D canvas)
  // =========================================================

  function makeBottom(w, h) {
    // a mossy pond floor, like the white koi photo: dark silt with
    // yellow-green algae gathered in soft clouds
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    const R = rng(1977)
    const k = w / 1440

    const octaves = [
      [5, 0.5],
      [13, 0.27],
      [31, 0.15],
      [75, 0.08]
    ].map(([n, a]) => {
      const gw = Math.ceil((n * w) / h) + 2
      const gh = n + 2
      const g = new Float32Array(gw * gh)
      for (let i = 0; i < g.length; i++) g[i] = R()
      return { n, a, gw, g }
    })
    const noise = (px, py) => {
      let s = 0
      for (const o of octaves) {
        const gx = (px / h) * o.n
        const gy = (py / h) * o.n
        const ix = gx | 0
        const iy = gy | 0
        let fx = gx - ix
        let fy = gy - iy
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        const i0 = iy * o.gw + ix
        const a = o.g[i0]
        const b = o.g[i0 + 1]
        const cc = o.g[i0 + o.gw]
        const d = o.g[i0 + o.gw + 1]
        s += o.a * (a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy)
      }
      return s
    }

    const img = x.createImageData(w, h)
    const d = img.data
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const f = noise(px, py)
        let m = (f - 0.4) / 0.3
        m = m < 0 ? 0 : m > 1 ? 1 : m
        m = m * m * (3 - 2 * m)
        let rr = 18
        let gg = 25
        let bb = 22
        const q = R()
        if (q < m * 0.8) {
          const t = R()
          const dim = 0.45 + 0.55 * m
          rr = (70 + t * 95) * dim
          gg = (82 + t * 92) * dim
          bb = (36 + t * 46) * dim
        } else {
          const t = R() * 12
          rr += t
          gg += t
          bb += t * 0.8
        }
        const i = (py * w + px) * 4
        d[i] = rr
        d[i + 1] = gg
        d[i + 2] = bb
        d[i + 3] = 255
      }
    }
    x.putImageData(img, 0, 0)

    // a few sunken stones, half-buried in silt
    for (let i = 0; i < 26; i++) {
      const cx = R() * w
      const cy = R() * h
      const rad = (14 + R() * 40) * k
      x.save()
      x.translate(cx, cy)
      x.rotate(R() * Math.PI)
      const g = x.createRadialGradient(-rad * 0.3, -rad * 0.3, 0, 0, 0, rad)
      g.addColorStop(0, 'rgba(92,98,88,0.85)')
      g.addColorStop(0.7, 'rgba(46,52,46,0.8)')
      g.addColorStop(1, 'rgba(20,26,22,0)')
      x.fillStyle = g
      x.beginPath()
      x.ellipse(0, 0, rad, rad * (0.6 + R() * 0.35), 0, 0, Math.PI * 2)
      x.fill()
      x.restore()
    }

    // sunken petals and leaves
    for (let i = 0; i < 40; i++) {
      const cx = R() * w
      const cy = R() * h
      const s = (5 + R() * 6) * k
      x.save()
      x.translate(cx, cy)
      x.rotate(R() * 6.28)
      x.fillStyle = R() < 0.75 ? 'rgba(196,140,150,0.55)' : 'rgba(110,84,46,0.7)'
      x.beginPath()
      x.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2)
      x.fill()
      x.restore()
    }

    const soft = document.createElement('canvas')
    soft.width = w
    soft.height = h
    const sx2 = soft.getContext('2d')
    sx2.filter = `blur(${0.9 * k}px)`
    sx2.drawImage(c, 0, 0)
    return soft
  }

  // =========================================================
  // MIRROR — what the still water reflects: a misty karst valley
  // (moodboard: the raft on the river). Peaks hang down from the
  // far edge because they are reflections.
  // =========================================================

  function makeRefl(w, h, night) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    const R = rng(night ? 808 : 808)
    const sky = x.createLinearGradient(0, 0, 0, h)
    if (night) {
      sky.addColorStop(0, '#16233a')
      sky.addColorStop(0.5, '#0c1526')
      sky.addColorStop(1, '#060b15')
    } else {
      sky.addColorStop(0, '#b4c9d2')
      sky.addColorStop(0.45, '#8aa1ac')
      sky.addColorStop(1, '#526872')
    }
    x.fillStyle = sky
    x.fillRect(0, 0, w, h)

    if (night) {
      for (let i = 0; i < 160; i++) {
        x.fillStyle = `rgba(220,230,255,${0.2 + R() * 0.6})`
        const s = R() < 0.9 ? 1 : 2
        x.fillRect(R() * w, R() * h, s, s)
      }
      const mx = w * 0.47
      const my = h * 0.6
      const mr = h * 0.032
      const halo = x.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 7)
      halo.addColorStop(0, 'rgba(200,215,255,0.35)')
      halo.addColorStop(1, 'rgba(200,215,255,0)')
      x.fillStyle = halo
      x.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14)
      x.fillStyle = '#e8eefc'
      x.beginPath()
      x.arc(mx, my, mr, 0, Math.PI * 2)
      x.fill()
    } else {
      // pale sun behind cloud
      const sx = w * 0.62
      const sy = h * 0.55
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, h * 0.35)
      g.addColorStop(0, 'rgba(250,252,255,0.55)')
      g.addColorStop(1, 'rgba(250,252,255,0)')
      x.fillStyle = g
      x.fillRect(0, 0, w, h)
    }

    const layers = [
      { col: night ? '#1b283b' : '#7f959f', fog: night ? 'rgba(90,110,145,' : 'rgba(214,235,242,', peaks: [[0.36, 0.3, 0.05], [0.47, 0.4, 0.055], [0.6, 0.34, 0.05], [0.72, 0.27, 0.06], [0.86, 0.22, 0.07]] },
      { col: night ? '#131f2f' : '#617680', fog: night ? 'rgba(70,90,120,' : 'rgba(214,235,242,', peaks: [[0.52, 0.5, 0.06], [0.66, 0.44, 0.065], [0.8, 0.36, 0.05]] },
      { col: night ? '#0b1420' : '#3c4f57', fog: night ? 'rgba(50,66,92,' : 'rgba(200,222,230,', peaks: [[0.04, 0.82, 0.19], [0.24, 0.5, 0.07], [0.98, 0.42, 0.09]] }
    ]
    for (const L of layers) {
      const ridge = (px) => {
        let d = 0
        for (const [cxr, hh, wd] of L.peaks) {
          const q = (px / w - cxr) / wd
          d = Math.max(d, hh * Math.exp(-q * q * q * q))
        }
        return d * h
      }
      x.beginPath()
      x.moveTo(0, 0)
      for (let px = 0; px <= w; px += 3) x.lineTo(px, ridge(px) + (R() - 0.5) * 2)
      x.lineTo(w, 0)
      x.closePath()
      x.fillStyle = L.col
      x.fill()
      // cliff texture: faint vertical streaks
      x.save()
      x.clip()
      for (let i = 0; i < 260; i++) {
        x.strokeStyle = R() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'
        x.lineWidth = 1 + R() * 2
        const px = R() * w
        x.beginPath()
        x.moveTo(px, 0)
        x.lineTo(px + (R() - 0.5) * 10, ridge(px))
        x.stroke()
      }
      x.restore()
      // the base of every layer sinks into mist (at the horizon = top)
      const fg = x.createLinearGradient(0, 0, 0, h * 0.55)
      fg.addColorStop(0, L.fog + '0.75)')
      fg.addColorStop(1, L.fog + '0)')
      x.fillStyle = fg
      x.fillRect(0, 0, w, h * 0.55)
    }

    const soft = document.createElement('canvas')
    soft.width = w
    soft.height = h
    const s2 = soft.getContext('2d')
    s2.filter = 'blur(1.5px)'
    s2.drawImage(c, 0, 0)
    return soft
  }

  // =========================================================
  // LILY PADS (static, float on the surface)
  // =========================================================

  function makePads(w, h) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    const R = rng(4242)
    const k = w / 1440
    const sx = w / innerWidth
    const sy = h / innerHeight

    // positions in stage coords → viewport → canvas
    const toCanvas = (X, Y) => {
      const ox = (innerWidth - STAGE_W * stageScale) / 2
      const oy = (innerHeight - STAGE_H * stageScale) / 2
      return [(ox + X * stageScale) * sx, (oy + Y * stageScale) * sy]
    }
    const sk = stageScale * sx

    function pad(X, Y, rad, rot, tone = 0) {
      const [cx, cy] = toCanvas(X, Y)
      const r = rad * sk
      x.save()
      x.translate(cx, cy)
      x.rotate(rot)
      const notch = 0.2 + R() * 0.12
      const shapePath = () => {
        x.beginPath()
        x.moveTo(0, 0)
        x.arc(0, 0, r, notch, Math.PI * 2 - notch * 0.4)
        x.closePath()
      }
      const greens = [
        ['#7ea64a', '#4f7f2f', '#2f5a22'],
        ['#8aa84f', '#5b8132', '#355b23'],
        ['#6f9a45', '#46752c', '#2a4f1e'],
        ['#9aa556', '#6d7d34', '#4a5a22']
      ][tone]
      const g = x.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.05, 0, 0, r)
      g.addColorStop(0, greens[0])
      g.addColorStop(0.6, greens[1])
      g.addColorStop(1, greens[2])
      shapePath()
      x.fillStyle = g
      x.fill()
      // veins
      x.save()
      shapePath()
      x.clip()
      x.strokeStyle = 'rgba(205,230,150,0.28)'
      x.lineWidth = Math.max(1, r * 0.018)
      const veins = 18
      for (let i = 0; i < veins; i++) {
        const a = notch + (i / veins) * (Math.PI * 2 - notch * 1.4)
        x.beginPath()
        x.moveTo(0, 0)
        x.quadraticCurveTo(Math.cos(a + 0.08) * r * 0.5, Math.sin(a + 0.08) * r * 0.5, Math.cos(a) * r, Math.sin(a) * r)
        x.stroke()
      }
      // waxy sheen + speckles + yellowing
      const sh = x.createLinearGradient(-r, -r, r, r)
      sh.addColorStop(0, 'rgba(255,255,240,0.22)')
      sh.addColorStop(0.45, 'rgba(255,255,240,0)')
      x.fillStyle = sh
      x.fillRect(-r, -r, r * 2, r * 2)
      for (let i = 0; i < r * 0.6; i++) {
        x.fillStyle = `rgba(${R() < 0.5 ? '40,60,20' : '200,190,90'},${0.08 + R() * 0.12})`
        const a = R() * Math.PI * 2
        const d = Math.sqrt(R()) * r
        x.beginPath()
        x.arc(Math.cos(a) * d, Math.sin(a) * d, (1 + R() * 3) * k, 0, Math.PI * 2)
        x.fill()
      }
      if (R() < 0.5) {
        const a = R() * Math.PI * 2
        const yg = x.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, r * 0.6)
        yg.addColorStop(0, 'rgba(160,120,40,0.55)')
        yg.addColorStop(1, 'rgba(160,120,40,0)')
        x.fillStyle = yg
        x.fillRect(-r, -r, r * 2, r * 2)
      }
      x.restore()
      // rolled rim
      shapePath()
      x.strokeStyle = 'rgba(30,55,20,0.55)'
      x.lineWidth = Math.max(1.2, r * 0.03)
      x.stroke()
      x.beginPath()
      x.arc(0, 0, r - r * 0.03, notch + 0.1, Math.PI * 1.2)
      x.strokeStyle = 'rgba(210,235,160,0.35)'
      x.lineWidth = Math.max(1, r * 0.02)
      x.stroke()
      x.restore()
    }

    function flower(X, Y, size) {
      const [cx, cy] = toCanvas(X, Y)
      const s = size * sk
      x.save()
      x.translate(cx, cy)
      x.shadowColor = 'rgba(20,40,20,0.35)'
      x.shadowBlur = s * 0.3
      x.shadowOffsetY = s * 0.08
      const layers = [
        [10, 1.0, '#f2dbe3', '#c96f8f'],
        [8, 0.78, '#fbeef2', '#dc8aa6'],
        [6, 0.55, '#fffafb', '#eab0c3']
      ]
      layers.forEach(([n, len, c0, c1], li) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + li * 0.35
          x.save()
          x.rotate(a)
          const g = x.createLinearGradient(0, 0, s * len, 0)
          g.addColorStop(0, c0)
          g.addColorStop(1, c1)
          x.beginPath()
          x.moveTo(0, 0)
          x.quadraticCurveTo(s * len * 0.5, -s * 0.2, s * len, 0)
          x.quadraticCurveTo(s * len * 0.5, s * 0.2, 0, 0)
          x.fillStyle = g
          x.fill()
          x.restore()
        }
        x.shadowColor = 'transparent'
      })
      const g = x.createRadialGradient(0, 0, 0, 0, 0, s * 0.22)
      g.addColorStop(0, '#fff2a0')
      g.addColorStop(1, '#e0a72a')
      x.beginPath()
      x.arc(0, 0, s * 0.2, 0, Math.PI * 2)
      x.fillStyle = g
      x.fill()
      x.restore()
    }

    // willow hanging over the water (moodboard: the pavilion in the rain)
    function willow(X0, X1, n, maxLen, seed) {
      const R2 = rng(seed)
      const wc = document.createElement('canvas')
      wc.width = w
      wc.height = h
      const wx = wc.getContext('2d')
      for (let i = 0; i < n; i++) {
        const u = R2()
        const sxs = X0 + u * (X1 - X0)
        const reach = 1 - Math.abs((sxs - X0) / (X1 - X0) - (X0 === 0 ? 0 : 1)) * 0.7
        const len = (50 + R2() * maxLen) * reach
        const sway = (R2() - 0.5) * 30
        const [ax, ay] = toCanvas(sxs, -10)
        const [bx, by] = toCanvas(sxs + sway, len)
        const [mx, my] = toCanvas(sxs + sway * 0.2, len * 0.5)
        wx.strokeStyle = 'rgba(38,52,34,0.9)'
        wx.lineWidth = Math.max(1, 1.2 * sk)
        wx.beginPath()
        wx.moveTo(ax, ay)
        wx.quadraticCurveTo(mx, my, bx, by)
        wx.stroke()
        const steps = Math.floor(len / 6)
        for (let s = 0; s < steps; s++) {
          const t = s / steps
          const px = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx
          const py = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by
          for (const side of [-1, 1]) {
            if (R2() < 0.25) continue
            wx.save()
            wx.translate(px, py)
            wx.rotate(Math.PI / 2 + side * (0.35 + R2() * 0.4))
            const L = (7 + R2() * 6) * sk
            wx.fillStyle = `hsl(${95 + R2() * 35},${28 + R2() * 18}%,${16 + R2() * 16}%)`
            wx.beginPath()
            wx.ellipse(L * 0.5, 0, L * 0.5, L * 0.13, 0, 0, Math.PI * 2)
            wx.fill()
            wx.restore()
          }
        }
      }
      // it hangs above the water, so it is a little out of focus
      x.save()
      x.filter = `blur(${1.3 * sk}px)`
      x.drawImage(wc, 0, 0)
      x.restore()
    }

    return c
  }


  // =========================================================
  // KOI (redrawn every frame on a half-size canvas)
  // =========================================================

  const KOI_STYLES = [
    { base: '#e3eae0', spots: '#eef2ea', fins: 'rgba(232,238,228,0.5)' },  // ghost white, from the moodboard photo
    { base: '#f2eee9', spots: '#fe8684', fins: 'rgba(250,228,224,0.5)' },  // coral
    { base: '#cfe2ea', spots: '#83cae2', fins: 'rgba(214,235,242,0.5)' },  // ice
    { base: '#ebe6db', spots: '#d6ebf2', fins: 'rgba(240,236,228,0.5)' }   // mist
  ]


  class Koi {
    constructor(i, R) {
      this.style = KOI_STYLES[i % KOI_STYLES.length]
      this.len = 150 + R() * 80
      this.x = R() * innerWidth
      this.y = R() * innerHeight
      this.a = R() * Math.PI * 2
      this.turn = 0
      this.speed = 13 + R() * 8
      this.baseSpeed = this.speed
      this.boost = 0
      this.phase = R() * 10
      this.seed = R() * 100
      this.n = 14
      this.seg = this.len / this.n
      this.pts = []
      for (let k = 0; k < this.n; k++) this.pts.push([this.x - Math.cos(this.a) * k * this.seg, this.y - Math.sin(this.a) * k * this.seg])
      this.spots = []
      for (let k = 0; k < 5; k++) this.spots.push([1 + R() * (this.n - 5), (R() - 0.5) * 0.9, 0.5 + R() * 0.7, R() < 0.25])
    }
    flee(x, y, radius) {
      const dx = this.x - x
      const dy = this.y - y
      const d = Math.hypot(dx, dy)
      if (d < radius) {
        this.target = Math.atan2(dy, dx)
        this.boost = 1
      }
    }
    update(dt, t) {
      // wander
      const w = Math.sin(t * 0.13 + this.seed) * 0.6 + Math.sin(t * 0.31 + this.seed * 2.1) * 0.4
      let desired = this.a + w * 0.9 * dt
      // soft walls
      const m = 120
      const W = innerWidth
      const H = innerHeight
      let steerX = 0
      let steerY = 0
      if (this.x < m) steerX = 1
      if (this.x > W - m) steerX = -1
      if (this.y < m) steerY = 1
      if (this.y > H - m) steerY = -1
      if (steerX || steerY) {
        const ta = Math.atan2(steerY, steerX)
        let da = ((ta - this.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        desired = this.a + da * 0.9 * dt
      }
      if (this.target !== undefined && this.boost > 0.1) {
        let da = ((this.target - this.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        desired = this.a + da * 3.2 * dt
      }
      this.a = desired
      this.boost *= Math.pow(0.35, dt)
      this.speed = this.baseSpeed * S.tempo ** 0.5 * (1 + this.boost * 4)
      this.phase += dt * (2 + this.speed * 0.06)
      this.x += Math.cos(this.a) * this.speed * dt
      this.y += Math.sin(this.a) * this.speed * dt
      // spine follows the head, with a swimming wave
      const p = this.pts
      p[0][0] = this.x
      p[0][1] = this.y
      for (let k = 1; k < this.n; k++) {
        const dx = p[k][0] - p[k - 1][0]
        const dy = p[k][1] - p[k - 1][1]
        const d = Math.hypot(dx, dy) || 1
        const wig = Math.sin(this.phase - k * 0.55) * 0.012 * k
        const nx = dx / d
        const ny = dy / d
        p[k][0] = p[k - 1][0] + (nx - ny * wig) * this.seg
        p[k][1] = p[k - 1][1] + (ny + nx * wig) * this.seg
      }
    }
    draw(x, s) {
      const p = this.pts.map(([a, b]) => [a * s, b * s])
      const n = this.n
      const W = this.len * 0.17 * s
      const prof = [0.6, 0.85, 0.97, 1, 0.98, 0.92, 0.82, 0.7, 0.57, 0.44, 0.32, 0.22, 0.14, 0.08]
      const L = []
      const Rr = []
      const dir = (k) => {
        const a = p[Math.max(0, k - 1)]
        const b = p[Math.min(n - 1, k + 1)]
        const dx = a[0] - b[0]
        const dy = a[1] - b[1]
        const d = Math.hypot(dx, dy) || 1
        return [dx / d, dy / d]
      }
      for (let k = 0; k < n; k++) {
        const [dx, dy] = dir(k)
        const w = W * prof[k]
        L.push([p[k][0] - dy * w, p[k][1] + dx * w])
        Rr.push([p[k][0] + dy * w, p[k][1] - dx * w])
      }
      const st = this.style
      // tail
      const [tx, ty] = dir(n - 1)
      const tail = p[n - 1]
      const sw = Math.sin(this.phase - n * 0.55) * 0.5
      x.fillStyle = st.fins
      x.beginPath()
      x.moveTo(tail[0], tail[1])
      const tl = this.len * 0.28 * s
      const ax = -tx
      const ay = -ty
      x.quadraticCurveTo(tail[0] + (ax - ay * (0.9 + sw)) * tl, tail[1] + (ay + ax * (0.9 + sw)) * tl, tail[0] + (ax - ay * 0.1) * tl * 0.75, tail[1] + (ay + ax * 0.1) * tl * 0.75)
      x.quadraticCurveTo(tail[0] + (ax + ay * (0.9 - sw)) * tl, tail[1] + (ay - ax * (0.9 - sw)) * tl, tail[0], tail[1])
      x.fill()
      // pectoral fins
      const fk = 3
      const [fx, fy] = dir(fk)
      const fl = this.len * 0.16 * s
      const flap = Math.sin(this.phase * 0.7) * 0.25
      for (const side of [-1, 1]) {
        const base = side < 0 ? L[fk] : Rr[fk]
        const ox = -fy * side
        const oy = fx * side
        x.beginPath()
        x.moveTo(base[0], base[1])
        x.quadraticCurveTo(base[0] + (ox * 1.1 - fx * (0.3 + flap)) * fl, base[1] + (oy * 1.1 - fy * (0.3 + flap)) * fl, base[0] + (ox * 0.4 - fx * 1.1) * fl, base[1] + (oy * 0.4 - fy * 1.1) * fl)
        x.closePath()
        x.fill()
      }
      // body
      const body = new Path2D()
      body.moveTo(L[0][0], L[0][1])
      for (let k = 1; k < n; k++) body.lineTo(L[k][0], L[k][1])
      for (let k = n - 1; k >= 0; k--) body.lineTo(Rr[k][0], Rr[k][1])
      const [hx, hy] = dir(0)
      body.quadraticCurveTo(p[0][0] + hx * W * 1.35, p[0][1] + hy * W * 1.35, L[0][0], L[0][1])
      x.fillStyle = st.base
      x.fill(body)
      x.save()
      x.clip(body)
      for (const [k, off, sz, alt] of this.spots) {
        const i = Math.floor(k)
        const [dx, dy] = dir(i)
        x.fillStyle = alt && st.spots2 ? st.spots2 : st.spots
        x.beginPath()
        x.ellipse(p[i][0] - dy * off * W, p[i][1] + dx * off * W, W * sz * 1.4, W * sz, Math.atan2(dy, dx), 0, Math.PI * 2)
        x.fill()
      }
      // back highlight & belly shade for volume
      x.lineCap = 'round'
      x.strokeStyle = 'rgba(255,255,255,0.28)'
      x.lineWidth = W * 0.45
      x.beginPath()
      x.moveTo(p[1][0], p[1][1])
      for (let k = 2; k < n - 3; k++) x.lineTo(p[k][0], p[k][1])
      x.stroke()
      x.strokeStyle = 'rgba(0,0,0,0.22)'
      x.lineWidth = W * 0.5
      x.stroke(body)
      x.restore()
      // eyes
      x.fillStyle = 'rgba(20,15,10,0.8)'
      const [ex, ey] = dir(0)
      for (const side of [-1, 1]) {
        x.beginPath()
        x.arc(p[0][0] + ex * W * 0.6 - ey * side * W * 0.55, p[0][1] + ey * W * 0.6 + ex * side * W * 0.55, Math.max(1, W * 0.12), 0, Math.PI * 2)
        x.fill()
      }
    }
  }

  // =========================================================
  // Floating petals (drift with the surface, pushed by ripples)
  // =========================================================

  const floaters = {
    list: [],
    lanterns: [],
    init() {
      const R = rng(88)
      this.list = []
      // petals arrive in loose drifts, like the white koi photo
      const clusters = [[0.12, 0.2], [0.55, 0.12], [0.9, 0.62], [0.33, 0.88], [0.7, 0.45]]
      for (let i = 0; i < 46; i++) {
        const [cx, cy] = clusters[i % clusters.length]
        this.list.push({
          x: (cx + (R() - 0.5) * 0.16) * innerWidth,
          y: (cy + (R() - 0.5) * 0.14) * innerHeight,
          vx: 0,
          vy: 0,
          a: R() * Math.PI * 2,
          va: (R() - 0.5) * 0.2,
          s: 6 + R() * 6,
          kind: R() < 0.9 ? 'petal' : 'leaf',
          hue: R()
        })
      }
      // floating paper lanterns for the night
      this.lanterns = [
        [0.29, 0.93],
        [0.62, 0.86],
        [0.86, 0.95]
      ].map(([x, y], i) => ({ x: x * innerWidth, y: y * innerHeight, vx: 0, vy: 0, a: i, va: 0, s: 15, ph: R() * 6 }))
    },
    push(x, y, radius, power) {
      for (const f of [...this.list, ...this.lanterns]) {
        const dx = f.x - x
        const dy = f.y - y
        const d = Math.hypot(dx, dy)
        if (d < radius && d > 0.1) {
          const k = (1 - d / radius) * power * (f.ph !== undefined ? 25 : 60)
          f.vx += (dx / d) * k
          f.vy += (dy / d) * k
          f.va += (Math.random() - 0.5) * power
        }
      }
    },
    update(dt, t) {
      for (const f of [...this.list, ...this.lanterns]) {
        const slow = f.ph !== undefined ? 0.4 : 1
        const cx = (5 + Math.sin(t * 0.05 + f.y * 0.004) * 4) * slow
        const cy = Math.cos(t * 0.04 + f.x * 0.003) * 3 * slow
        f.vx += (cx - f.vx) * dt * 0.4
        f.vy += (cy - f.vy) * dt * 0.4
        f.x += f.vx * dt
        f.y += f.vy * dt
        f.a += f.va * dt
        f.va *= Math.pow(0.6, dt)
        if (f.x > innerWidth + 30) f.x = -30
        if (f.x < -30) f.x = innerWidth + 30
        if (f.y > innerHeight + 30) f.y = -30
        if (f.y < -30) f.y = innerHeight + 30
      }
    },
    draw(x, s) {
      for (const f of this.list) {
        x.save()
        x.translate(f.x * s, f.y * s)
        x.rotate(f.a)
        const z = f.s * s
        if (f.kind === 'petal') {
          const g = x.createLinearGradient(-z, 0, z, 0)
          g.addColorStop(0, `hsl(${348 + f.hue * 8},${62 + f.hue * 20}%,${78 + f.hue * 8}%)`)
          g.addColorStop(1, `hsl(${342 + f.hue * 10},50%,90%)`)
          x.fillStyle = g
          x.beginPath()
          x.moveTo(-z, 0)
          x.bezierCurveTo(-z * 0.4, -z * 0.8, z * 0.7, -z * 0.7, z, -z * 0.1)
          x.lineTo(z * 0.75, 0)
          x.lineTo(z, z * 0.1)
          x.bezierCurveTo(z * 0.7, z * 0.7, -z * 0.4, z * 0.8, -z, 0)
          x.fill()
        } else {
          x.fillStyle = `hsl(${70 + f.hue * 40},40%,${34 + f.hue * 10}%)`
          x.beginPath()
          x.moveTo(-z * 1.4, 0)
          x.quadraticCurveTo(0, -z * 0.8, z * 1.4, 0)
          x.quadraticCurveTo(0, z * 0.8, -z * 1.4, 0)
          x.fill()
        }
        x.restore()
      }
      if (S.night < 0.02) return
      x.save()
      x.globalAlpha = S.night
      for (const L of this.lanterns) {
        x.save()
        x.translate(L.x * s, L.y * s)
        x.rotate(L.a * 0.3)
        const z = L.s * s
        // wooden base
        x.fillStyle = '#2b1d12'
        x.fillRect(-z * 1.15, -z * 1.15, z * 2.3, z * 2.3)
        // glowing paper
        const g = x.createRadialGradient(0, 0, 0, 0, 0, z * 1.3)
        g.addColorStop(0, '#fff3d0')
        g.addColorStop(0.5, '#ffc77a')
        g.addColorStop(1, '#e38a46')
        x.fillStyle = g
        x.fillRect(-z, -z, z * 2, z * 2)
        x.strokeStyle = 'rgba(60,35,15,0.6)'
        x.lineWidth = Math.max(1, z * 0.1)
        x.beginPath()
        x.moveTo(0, -z)
        x.lineTo(0, z)
        x.moveTo(-z, 0)
        x.lineTo(z, 0)
        x.stroke()
        x.restore()
      }
      x.restore()
    }
  }


  // =========================================================
  // POND (WebGL2)
  // =========================================================

  const SIM_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uState; uniform vec2 uTexel; uniform float uDamp;
  void main(){
    vec4 s = texture(uState, vUv);
    float avg = ( texture(uState, vUv+vec2(uTexel.x,0.)).r + texture(uState, vUv-vec2(uTexel.x,0.)).r
                + texture(uState, vUv+vec2(0.,uTexel.y)).r + texture(uState, vUv-vec2(0.,uTexel.y)).r ) * .25;
    s.g += (avg - s.r) * 2.0;
    s.g *= uDamp;
    s.r += s.g;
    s.r *= 0.998;
    o = s;
  }`

  const DROP_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uState; uniform vec2 uCenter; uniform float uRadius; uniform float uStrength; uniform vec2 uAspect;
  void main(){
    vec4 s = texture(uState, vUv);
    float d = length((vUv - uCenter) * uAspect) / uRadius;
    float b = max(0., 1. - d);
    b = 0.5 - cos(b * 3.14159265) * 0.5;
    s.r -= b * uStrength;
    o = s;
  }`

  const POND_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uSim, uBottom, uPads, uKoi, uDrift, uRefl, uReflN;
  uniform vec2 uSimTexel;
  uniform float uTime, uNight, uClarity, uAspect, uTempo;
  uniform vec3 uLant[3];
  uniform vec4 uGlass[4];
  uniform int uGlassN;
  uniform float uGlassR;
  ${NOISE}

  float caustic(vec2 uv, float time){
    vec2 p = mod(uv*6.28318, 6.28318) - 250.;
    vec2 i = p; float c = 1.; float inten = .005;
    for (int n = 0; n < 5; n++){
      float t = time * (1. - (3.5 / float(n+1)));
      i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
      c += 1. / length(vec2(p.x / (sin(i.x+t)/inten), p.y / (cos(i.y+t)/inten)));
    }
    c /= 5.; c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.);
  }

  // wind on the surface: long swells plus a fine chop (Frame 4's water photo)
  vec2 swell(vec2 p, float t){
    vec2 g = vec2(0.);
    vec2 D[6] = vec2[](vec2(.8,.6), vec2(-.5,.86), vec2(.96,-.28), vec2(-.9,-.43), vec2(.2,.98), vec2(-.7,.7));
    float F[6] = float[](8., 13., 21., 33., 52., 77.);
    float A[6] = float[](.0022, .0014, .0010, .00065, .00042, .00028);
    for (int i = 0; i < 6; i++){
      float w = sqrt(F[i]) * .55;
      float ph = dot(D[i], p) * F[i] - t * w + float(i) * 1.7;
      g += D[i] * F[i] * A[i] * cos(ph);
    }
    vec3 n1 = noised(vec2(p.x * 26., p.y * 40.) + vec2(t * .35, t * .2));
    vec3 n2 = noised(mat2(.8,.6,-.6,.8) * vec2(p.x * 48., p.y * 70.) - vec2(t * .3, -t * .45));
    g += n1.yz * vec2(.0012, .0019) + n2.yz * vec2(.0006, .0009);
    return g;
  }

  vec3 absorb(vec3 c, float depth, float night){
    float k = depth * mix(.45, 1.4, night) * (1.65 - uClarity);
    vec3 trans = exp(-k * vec3(1.3, .85, .8));
    vec3 waterDay = vec3(.10, .17, .19);
    vec3 waterNight = vec3(.006, .02, .045);
    vec3 scatter = mix(waterDay, waterNight, night) * (1. - exp(-k * 1.2));
    return c * trans + scatter;
  }

  void main(){
    vec2 uv = vUv;
    float t = uTime;
    float night = uNight;
    vec2 P = vec2(uv.x * uAspect, uv.y);

    // ---- surface: ripple simulation + wind
    float hC = texture(uSim, uv).r;
    float hR = texture(uSim, uv + vec2(uSimTexel.x, 0.)).r;
    float hL = texture(uSim, uv - vec2(uSimTexel.x, 0.)).r;
    float hU = texture(uSim, uv + vec2(0., uSimTexel.y)).r;
    float hD = texture(uSim, uv - vec2(0., uSimTexel.y)).r;
    vec2 gSim = vec2(hR - hL, hU - hD) * .55;
    float lap = (hR + hL + hU + hD - 4. * hC);
    vec2 g = gSim + swell(P, t * (.75 + .25 * uTempo));
    vec3 N = normalize(vec3(-g * 3.2, 1.));
    float slope = dot(g, g);

    vec2 off = -g * vec2(1. / uAspect, 1.) * .08;
    vec2 sunDir2 = vec2(.008, -.014);

    // ---- under the surface: mossy floor, koi
    vec3 bot = texture(uBottom, uv + off).rgb;
    float padSh = textureLod(uPads, uv + off + sunDir2 * 1.6, 3.).a;
    float drSh  = textureLod(uDrift, uv + off + sunDir2 * 1.6, 2.).a;
    float koiSh = textureLod(uKoi, uv + off + sunDir2, 2.5).a;
    float shade = 1. - clamp(padSh * .55 + drSh * .3 + koiSh * .45, 0., .85);

    vec2 cp = P * 1.2 + off * 4. + vec2(fbm(P * .8 + t * .03), fbm(P * .8 - t * .03)) * .35;
    float ct = t * .3 * (.7 + .3 * uTempo);
    float caus = caustic(cp, ct) * .6 + caustic(cp * 1.37 + vec2(.31, .72), ct * .83 + 3.) * .4;
    caus = clamp(caus * 1.2 + max(0., lap) * 9., 0., 2.);
    float causAmt = mix(.5, .05, night) * clamp(uClarity, .35, 1.2);

    vec3 lightCol = mix(vec3(1.05, 1.08, 1.02), vec3(.16, .22, .34), night);
    vec3 col = bot * lightCol * shade;
    col += col * vec3(1., .98, .9) * caus * causAmt * shade * 1.5;
    float depth = .5 + .45 * fbm(P * 1.2 + 3.1);
    col = absorb(col, depth, night);

    vec4 koi = texture(uKoi, uv + off * .6);
    vec3 kc = koi.rgb * lightCol * (1. + caus * causAmt * .5);
    kc = absorb(kc, depth * .35, night);
    col = mix(col, kc, koi.a * .95);

    // ---- the mirror: a misty valley, stretched and broken by the waves
    vec2 ruv = uv + N.xy * vec2(.04, .1);
    vec3 refl = mix(texture(uRefl, ruv).rgb, texture(uReflN, ruv).rgb, night);
    float fres = mix(.08, .26, smoothstep(.0, 1., uv.y));
    fres = clamp(fres + slope * 9., 0., .9);
    // the koi and pads come up through the mirror
    fres *= 1. - koi.a * .55;
    col = mix(col, refl, fres);

    // soft overcast sheen
    vec3 L = normalize(vec3(.25, .5, 1.));
    vec3 H = normalize(L + vec3(0., 0., 1.));
    float nh = max(dot(N, H), 0.);
    col += mix(vec3(.92, .96, 1.), vec3(.55, .65, .85), night) * (pow(nh, 260.) * .22 + pow(nh, 2000.) * 1.1) * (1. - .6 * night);

    // ---- glitter on the ripples (the tiger drinking from the pond)
    vec2 gp = floor(gl_FragCoord.xy / 1.5);
    float hs = hash(gp + floor(t * 5.) * 17.31);
    float crest = smoothstep(.03, .12, length(gSim));
    float glit = step(.955, hs) * crest;
    vec3 glitDay = vec3(.9, .97, 1.);
    vec3 glitNight = mix(vec3(1., .8, .42), vec3(.55, .78, 1.), step(.965, hs));
    col += glit * mix(glitDay, glitNight, night) * mix(.45, 1.1, night);

    // let the moon in the mirror stay bright
    col += night * fres * max(vec3(0.), refl - .45) * 1.6;

    // ---- night: lanterns throw long warm streaks, ripples glow faintly
    for (int i = 0; i < 3; i++){
      vec2 lp = vec2(uLant[i].x * uAspect, uLant[i].y);
      vec2 dq = (P - lp) + N.xy * .1;
      float streak = exp(-abs(dq.x) * 60.) * exp(-max(0., -dq.y) * 5. - max(0., dq.y) * 40.);
      col += uLant[i].z * night * vec3(1., .7, .36) * streak * .6 * (.65 + .35 * vnoise(P * 90. + t * 1.5));
    }
    col += night * vec3(.3, .55, .85) * clamp(abs(hC) * 1.3, 0., .4);

    // ---- on the surface: petals, pads, willow
    vec2 fuv = uv + g * vec2(1. / uAspect, 1.) * .02;
    vec4 dr = texture(uDrift, fuv);
    vec3 drLit = dr.rgb * mix(vec3(1.), vec3(.3, .3, .42), night * (1. - smoothstep(.3, .45, dr.r - dr.b)));
    col = mix(col, drLit, dr.a);

    vec4 pd = texture(uPads, fuv);
    vec3 pc = pd.rgb * mix(vec3(.92, .97, .95), vec3(.18, .24, .34), night);
    col = mix(col, pc, pd.a);

    // ---- frosted glass panels, drawn here instead of CSS backdrop-filter
    float glass = 0.;
    for (int i = 0; i < 4; i++){
      if (i >= uGlassN) break;
      vec4 r = uGlass[i];
      vec2 c = vec2((r.x + r.z) * .5 * uAspect, (r.y + r.w) * .5);
      vec2 b = vec2((r.z - r.x) * .5 * uAspect, (r.w - r.y) * .5);
      vec2 q = abs(P - c) - b + uGlassR;
      float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - uGlassR;
      glass = max(glass, smoothstep(.0015, -.0015, d));
    }
    if (glass > 0.) {
      vec2 wob = g * vec2(1. / uAspect, 1.) * .01;
      vec3 fb = textureLod(uBottom, uv + wob, 5.5).rgb * lightCol;
      fb = absorb(fb, depth, night);
      vec4 fk = textureLod(uKoi, uv, 4.5);
      fb = mix(fb, absorb(fk.rgb * lightCol, depth * .35, night), fk.a * .8);
      vec4 fd = textureLod(uDrift, uv, 3.5);
      fb = mix(fb, fd.rgb * mix(vec3(1.), vec3(.3, .3, .42), night), fd.a * .7);
      fb = mix(fb, mix(vec3(.05, .07, .06), vec3(.03, .045, .08), night), .45) * .85;
      col = mix(col, fb, glass);
    }

    vec2 v = uv - .5;
    col *= 1. - mix(.3, .55, night) * pow(length(v * vec2(1.1, 1.3)), 2.4);

    o = vec4(col, 1.);
  }`


  const pond = (() => {
    const canvas = $('pond')
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false })
    const api = { ok: false, drop() {}, frame() {}, resize() {}, rebuildPads() {} }
    if (!gl) return api
    const cbf = gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    let progSim, progDrop, progPond
    try {
      progSim = makeProgram(gl, VS, SIM_FS)
      progDrop = makeProgram(gl, VS, DROP_FS)
      progPond = makeProgram(gl, VS, POND_FS)
    } catch (err) {
      console.warn('[mist] pond shader failed:', err.message)
      return api
    }
    fullscreenTriangle(gl)

    let W = 0
    let H = 0
    let simW = 0
    let simH = 0
    let simTex = []
    let simFb = []
    let cur = 0
    const queue = []

    function makeTex(w, h, internal, format, type, filter = gl.LINEAR) {
      const t = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }

    function uploadCanvas(tex, cnv, mip) {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      if (mip) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.generateMipmap(gl.TEXTURE_2D)
      }
    }

    const texBottom = makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    const texPads = makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    const texKoi = makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    const texDrift = makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    const texRefl = makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    const texReflN = makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    const lantData = new Float32Array(9)
    const glassData = new Float32Array(16)

    // half-size canvases for moving things
    const koiCanvas = document.createElement('canvas')
    const koiCtx = koiCanvas.getContext('2d')
    const driftCanvas = document.createElement('canvas')
    const driftCtx = driftCanvas.getContext('2d')
    const kois = []
    const KR = rng(31)
    for (let i = 0; i < 4; i++) kois.push(new Koi(i, KR))
    api.kois = kois

    function buildSim() {
      simW = Math.max(64, Math.round(innerWidth / 3))
      simH = Math.max(64, Math.round(innerHeight / 3))
      simTex.forEach((t) => gl.deleteTexture(t))
      simFb.forEach((f) => gl.deleteFramebuffer(f))
      simTex = []
      simFb = []
      for (let i = 0; i < 2; i++) {
        const t = cbf
          ? makeTex(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT)
          : makeTex(simW, simH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
        const f = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, f)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        simTex.push(t)
        simFb.push(f)
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      api.simOk = !!cbf
    }

    let bottomCanvas = null
    let quality = 1
    function setQuality(q) {
      quality = q
      W = Math.round(innerWidth * quality)
      H = Math.round(innerHeight * quality)
      canvas.width = W
      canvas.height = H
    }
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5)
      setQuality(quality)
      buildSim()
      const bw = Math.min(2200, Math.round(innerWidth * Math.min(dpr, 1.25)))
      const bh = Math.round((bw * innerHeight) / innerWidth)
      // the pebble bed only depends on the aspect; regenerate on big changes
      if (!bottomCanvas || Math.abs(bottomCanvas.width / bottomCanvas.height - bw / bh) > 0.02 || bottomCanvas.width < bw * 0.8) {
        bottomCanvas = makeBottom(bw, bh)
        uploadCanvas(texBottom, bottomCanvas, true)
        const rw = Math.round(bw / 2)
        const rh = Math.round(bh / 2)
        uploadCanvas(texRefl, makeRefl(rw, rh, false), false)
        uploadCanvas(texReflN, makeRefl(rw, rh, true), false)
      }
      rebuildPads()
      koiCanvas.width = Math.round(innerWidth * 0.75)
      koiCanvas.height = Math.round(innerHeight * 0.75)
      driftCanvas.width = Math.round(innerWidth / 2)
      driftCanvas.height = Math.round(innerHeight / 2)
    }

    function rebuildPads() {
      const pw = Math.min(2200, Math.round(innerWidth * Math.min(devicePixelRatio || 1, 1.5)))
      const ph = Math.round((pw * innerHeight) / innerWidth)
      uploadCanvas(texPads, makePads(pw, ph), true)
    }

    function drop(x, y, radiusPx, strength) {
      queue.push([x / innerWidth, 1 - y / innerHeight, radiusPx / innerHeight, strength])
      for (const k of kois) k.flee(x, y, 220)
    }

    function step() {
      gl.viewport(0, 0, simW, simH)
      // drops
      gl.useProgram(progDrop.p)
      gl.uniform2f(progDrop.u.uAspect, simW / simH, 1)
      while (queue.length) {
        const [cx, cy, rad, s] = queue.shift()
        gl.bindFramebuffer(gl.FRAMEBUFFER, simFb[1 - cur])
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, simTex[cur])
        gl.uniform1i(progDrop.u.uState, 0)
        gl.uniform2f(progDrop.u.uCenter, cx, cy)
        gl.uniform1f(progDrop.u.uRadius, rad)
        gl.uniform1f(progDrop.u.uStrength, s)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        cur = 1 - cur
      }
      // waves
      gl.useProgram(progSim.p)
      gl.uniform2f(progSim.u.uTexel, 1 / simW, 1 / simH)
      gl.uniform1f(progSim.u.uDamp, S.damp)
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, simFb[1 - cur])
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, simTex[cur])
        gl.uniform1i(progSim.u.uState, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        cur = 1 - cur
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    function frame(t, dt) {
      if (api.simOk) step()

      // koi
      koiCtx.clearRect(0, 0, koiCanvas.width, koiCanvas.height)
      for (const k of kois) {
        k.update(dt, t)
        k.draw(koiCtx, 0.75)
      }
      uploadCanvas(texKoi, koiCanvas, true)

      // petals
      driftCtx.clearRect(0, 0, driftCanvas.width, driftCanvas.height)
      floaters.update(dt, t)
      floaters.draw(driftCtx, 0.5)
      uploadCanvas(texDrift, driftCanvas, true)

      gl.viewport(0, 0, W, H)
      gl.useProgram(progPond.p)
      const u = progPond.u
      const bind = (unit, tex, name) => {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(u[name], unit)
      }
      bind(0, simTex[cur], 'uSim')
      bind(1, texBottom, 'uBottom')
      bind(2, texPads, 'uPads')
      bind(3, texKoi, 'uKoi')
      bind(4, texDrift, 'uDrift')
      bind(5, texRefl, 'uRefl')
      bind(6, texReflN, 'uReflN')
      floaters.lanterns.forEach((L, i) => lantData.set([L.x / innerWidth, 1 - L.y / innerHeight, 1], i * 3))
      gl.uniform3fv(u.uLant, lantData)
      gl.uniform2f(u.uSimTexel, 1 / simW, 1 / simH)
      gl.uniform1f(u.uTime, t)
      gl.uniform1f(u.uNight, S.night)
      gl.uniform1f(u.uClarity, S.clarity)
      gl.uniform1f(u.uAspect, innerWidth / innerHeight)
      gl.uniform1f(u.uTempo, S.tempo)
      glassData.fill(0)
      panelRects.slice(0, 4).forEach((r, i) =>
        glassData.set([r.left / innerWidth, 1 - r.bottom / innerHeight, r.right / innerWidth, 1 - r.top / innerHeight], i * 4)
      )
      gl.uniform4fv(u.uGlass, glassData)
      gl.uniform1i(u.uGlassN, Math.min(4, panelRects.length))
      gl.uniform1f(u.uGlassR, (40 * stageScale) / innerHeight)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    Object.assign(api, { ok: true, drop, frame, resize, rebuildPads, setQuality, getQuality: () => quality })
    return api
  })()

  // =========================================================
  // AIR — fireflies at night, a soft flash when a bell rings
  // =========================================================

  const air = (() => {
    const canvas = $('air')
    const x = canvas.getContext('2d')
    let dpr = 1
    const flies = []
    const flashes = []
    const R = rng(5)
    for (let i = 0; i < 26; i++) {
      flies.push({ x: R(), y: R(), a: R() * 6.28, s: 0.006 + R() * 0.012, ph: R() * 10, f: 0.4 + R() * 0.6 })
    }
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = innerWidth * dpr
      canvas.height = innerHeight * dpr
    }
    function flash(px, py, key) {
      flashes.push({ x: px, y: py, t: 0, kind: key })
    }
    function frame(t, dt) {
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
      x.clearRect(0, 0, innerWidth, innerHeight)
      x.globalCompositeOperation = 'lighter'
      const n = S.night
      if (n > 0.02) {
        for (const f of flies) {
          f.a += (Math.sin(t * 0.7 + f.ph) * 0.8) * dt
          f.x += Math.cos(f.a) * f.s * dt
          f.y += Math.sin(f.a) * f.s * dt * 0.7
          if (f.x < -0.02) f.x = 1.02
          if (f.x > 1.02) f.x = -0.02
          if (f.y < -0.02) f.y = 1.02
          if (f.y > 1.02) f.y = -0.02
          const px = f.x * innerWidth
          const py = f.y * innerHeight
          const glow = Math.max(0, Math.sin(t * f.f * 1.6 + f.ph)) ** 2 * n
          if (glow < 0.02) continue
          const rad = 16 + glow * 10
          const g = x.createRadialGradient(px, py, 0, px, py, rad)
          g.addColorStop(0, `rgba(250,255,190,${0.9 * glow})`)
          g.addColorStop(0.18, `rgba(215,255,140,${0.45 * glow})`)
          g.addColorStop(1, 'rgba(160,255,120,0)')
          x.fillStyle = g
          x.fillRect(px - rad, py - rad, rad * 2, rad * 2)
        }
      }
      // lantern glow above the water
      if (n > 0.02) {
        for (const L of floaters.lanterns) {
          const fl = 0.85 + 0.15 * Math.sin(t * 7 + L.ph) * Math.sin(t * 3.1 + L.ph * 2)
          const rad = 70 * fl
          const g = x.createRadialGradient(L.x, L.y, 0, L.x, L.y, rad)
          g.addColorStop(0, `rgba(255,214,150,${0.55 * n * fl})`)
          g.addColorStop(0.3, `rgba(255,170,90,${0.18 * n})`)
          g.addColorStop(1, 'rgba(255,150,80,0)')
          x.fillStyle = g
          x.fillRect(L.x - rad, L.y - rad, rad * 2, rad * 2)
        }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]
        f.t += dt
        const k = f.t / 2.2
        if (k >= 1) {
          flashes.splice(i, 1)
          continue
        }
        const rad = 30 + k * 120
        const a = (1 - k) ** 2 * (0.22 + n * 0.25) * (0.6 + S.chorus)
        const g = x.createRadialGradient(f.x, f.y, rad * 0.2, f.x, f.y, rad)
        // chime = ice, bloom on the water = coral (palette from the moodboard)
        const c = f.kind === 'bloom' ? '254,134,132' : '214,235,242'
        g.addColorStop(0, `rgba(${c},${a})`)
        g.addColorStop(1, `rgba(${c},0)`)
        x.fillStyle = g
        x.fillRect(f.x - rad, f.y - rad, rad * 2, rad * 2)
      }
      x.globalCompositeOperation = 'source-over'
    }
    return { resize, frame, flash }
  })()

  // =========================================================
  // FOG (WebGL2, half resolution, premultiplied alpha)
  // =========================================================

  const FOG_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform vec2 uRes; uniform float uTime, uReveal, uDensity, uNight, uScale;
  uniform vec4 uRect[4]; uniform int uCount;
  ${NOISE}

  float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }

  void main(){
    vec2 px = vUv * uRes;
    vec2 p = px / uRes.y;
    float t = uTime;

    // big rolling banks, domain-warped so they curl
    vec2 q = p * 1.35 + vec2(t * .022, t * .007);
    vec2 w = vec2(fbm(q + vec2(0., t * .03)), fbm(q + vec2(5.2, 1.3) - t * .025));
    float banks = fbm(q * 1.05 + w * 1.9 - vec2(t * .035, 0.));
    // finer wisps stretched along the wind
    float wisps = fbm(vec2(p.x * 2.2, p.y * 5.5) + w * 1.1 - vec2(t * .07, t * .01));
    float f = banks * .72 + wisps * .38;

    // slow arrival: wisps condense from the edges inward
    float edge = 1. - smoothstep(.0, .55, min(min(vUv.x, 1. - vUv.x) * 1.7, min(vUv.y, 1. - vUv.y) * 2.6));
    float th = mix(1.2, .3, uReveal) - edge * .25 * uReveal;
    float a = smoothstep(th, th + .24, f);
    // a soft overall haze under the banks
    a = max(a * .95, uReveal * (.10 + .12 * banks));
    a *= uDensity;

    // thin the fog over the controls so they stay readable
    float inside = 0.;
    for (int i = 0; i < 4; i++){
      if (i >= uCount) break;
      vec4 r = uRect[i];
      vec2 c = (r.xy + r.zw) * .5;
      vec2 b = (r.zw - r.xy) * .5;
      float d = sdBox(px - c, b, 60. * uScale);
      inside = max(inside, smoothstep(60. * uScale, -80. * uScale, d));
    }
    a = min(a * mix(1., .52, inside), mix(.9, .46, inside));

    vec3 lit = mix(vec3(.9, .95, .97), vec3(.55, .63, .78), uNight);
    vec3 shade = mix(vec3(.7, .8, .85), vec3(.26, .32, .45), uNight);
    vec3 col = mix(shade, lit, smoothstep(.35, .8, banks));
    o = vec4(col * a, a);
  }`

  const fog = (() => {
    const canvas = $('fog')
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
    const api = { frame() {}, resize() {} }
    if (!gl) return api
    let prog
    try {
      prog = makeProgram(gl, VS, FOG_FS)
    } catch (err) {
      console.warn('[mist] fog shader failed:', err.message)
      return api
    }
    fullscreenTriangle(gl)
    let W = 0
    let H = 0
    let scale = 0.5
    function resize() {
      scale = 0.5 * Math.min(devicePixelRatio || 1, 2)
      W = Math.round(innerWidth * scale)
      H = Math.round(innerHeight * scale)
      canvas.width = W
      canvas.height = H
    }
    const rectData = new Float32Array(16)
    function frame(t) {
      gl.viewport(0, 0, W, H)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (S.fogReveal < 0.002) return
      gl.useProgram(prog.p)
      const u = prog.u
      let n = 0
      for (const r of panelRects.slice(0, 4)) {
        rectData.set([r.left * scale, (innerHeight - r.bottom) * scale, r.right * scale, (innerHeight - r.top) * scale], n * 4)
        n++
      }
      gl.uniform4fv(u.uRect, rectData)
      gl.uniform1i(u.uCount, n)
      gl.uniform2f(u.uRes, W, H)
      gl.uniform1f(u.uTime, t)
      gl.uniform1f(u.uReveal, S.fogReveal)
      gl.uniform1f(u.uDensity, S.fogDensity)
      gl.uniform1f(u.uNight, S.night)
      gl.uniform1f(u.uScale, scale * stageScale)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    return { frame, resize }
  })()

  // =========================================================
  // Input: every click touches the water
  // =========================================================

  let lastMove = 0
  let lastXY = null
  const hint = document.querySelector('.hint')

  addEventListener('pointerdown', (e) => {
    const onControl = e.target.closest('button, input')
    pond.drop(e.clientX, e.clientY, onControl ? 18 : 26, onControl ? 0.16 : 0.42)
    floaters.push(e.clientX, e.clientY, 160, 1)
    lastXY = [e.clientX, e.clientY]
    if (hint && !hint.classList.contains('is-gone')) setTimeout(() => hint.classList.add('is-gone'), 1800)
  })

  // dragging across the water leaves a wake
  addEventListener('pointermove', (e) => {
    if (!(e.buttons & 1) || e.target.closest('input')) return
    const t = performance.now()
    if (t - lastMove < 40) return
    lastMove = t
    if (lastXY && Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 10) return
    lastXY = [e.clientX, e.clientY]
    pond.drop(e.clientX, e.clientY, 14, 0.12)
    floaters.push(e.clientX, e.clientY, 90, 0.4)
  })

  // =========================================================
  // Resize & main loop
  // =========================================================

  function onResize() {
    fit()
    measurePanels()
    pond.resize()
    air.resize()
    fog.resize()
    floaters.init()
  }

  let resizeTimer = 0
  addEventListener('resize', () => {
    fit()
    measurePanels()
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(onResize, 180)
  })

  onResize()
  // fonts change panel sizes slightly
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measurePanels)

  let last = now()
  let ambient = 2
  let loopErr = false
  let frameAvg = 1 / 60
  let qualityTimer = 0
  function loop() {
    const t = now()
    const realDt = Math.min(0.5, t - last)
    const dt = Math.min(0.05, realDt)
    last = t

    // eased transitions
    S.night += (S.nightTarget - S.night) * (1 - Math.pow(0.5, realDt / 0.9))
    const fogRate = S.fogTarget > S.fogReveal ? 1 / 11 : 1 / 7 // ~11 s to roll in, ~7 s to lift
    S.fogReveal = clamp(S.fogReveal + Math.sign(S.fogTarget - S.fogReveal) * fogRate * realDt, 0, 1)
    if (Math.abs(S.fogTarget - S.fogReveal) < fogRate * realDt) S.fogReveal = S.fogTarget

    // a stray drop now and then keeps the pond alive
    ambient -= dt
    if (ambient < 0) {
      ambient = 3 + Math.random() * 6
      const [x, y] = openWaterSpot((Math.random() - 0.5) * 1.6)
      pond.drop(x, y, 8, 0.08)
    }

    try {
      pond.frame(t, dt)
      air.frame(t, dt)
      fog.frame(t)
    } catch (err) {
      if (!loopErr) console.warn('[mist] frame error:', err)
      loopErr = true
    }

    requestAnimationFrame(loop)
  }

  if (reduceMotion) {
    // still render, just calmer
    S.damp = 0.98
  }
  requestAnimationFrame(loop)
})()
