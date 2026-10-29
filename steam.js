// ========================================
// THE STEAM
// ========================================
// Cold, heavy vapour, like the real device makes: it pushes up
// out of the hole, rolls over, settles on the lid, spills over
// its rim, slides down the front and spreads low across the table.
// The mist voice sets how much there is; a bell strike makes the
// plume heave up; water notes glint inside it. The lamp lights it.
// ========================================

;(() => {
  const canvas = document.getElementById('steam')
  const ctx = canvas.getContext('2d')

  const W = 1536
  const H = 1024

  // geometry of the render
  const HOLE_X = 759
  const HOLE_Y = 382
  const LID_L = 660 // lid spans these x at its rim
  const LID_R = 1205
  const LID_Y = 386 // the plane the vapour settles on
  const LID_FRONT = 402 // past this it spills over the front rim
  const BODY_L = 575 // the body bulges wider than the lid
  const BODY_R = 1268
  const TABLE_Y = 728 // where the device meets the table
  const CENTRE_X = 933

  let dpr = 1
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  addEventListener('resize', resize)

  // ----------------------------------------
  // cloud textures: soft discs carved with fractal noise, so every
  // puff has its own lumps and wisps instead of a plain blur
  // ----------------------------------------

  const TEX = 128
  const VARIANTS = 6

  function noiseField(seed) {
    // value noise, four octaves, tileable enough for a single sprite
    const rnd = (x, y, o) => {
      const n = Math.sin(x * 127.1 + y * 311.7 + o * 74.7 + seed * 19.3) * 43758.5453
      return n - Math.floor(n)
    }
    const smooth = (t) => t * t * (3 - 2 * t)
    const sample = (x, y, o) => {
      const xi = Math.floor(x)
      const yi = Math.floor(y)
      const xf = smooth(x - xi)
      const yf = smooth(y - yi)
      const a = rnd(xi, yi, o)
      const b = rnd(xi + 1, yi, o)
      const c = rnd(xi, yi + 1, o)
      const d = rnd(xi + 1, yi + 1, o)
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
    }
    return (x, y) => {
      let v = 0
      let amp = 0.55
      let f = 3.2
      for (let o = 0; o < 4; o++) {
        v += sample(x * f, y * f, o) * amp
        amp *= 0.5
        f *= 2.1
      }
      return v
    }
  }

  const masks = []
  for (let v = 0; v < VARIANTS; v++) {
    const c = document.createElement('canvas')
    c.width = TEX
    c.height = TEX
    const cx = c.getContext('2d')
    const img = cx.createImageData(TEX, TEX)
    const n = noiseField(v * 3.7 + 1)
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        const dx = x / TEX - 0.5
        const dy = y / TEX - 0.5
        const r = Math.sqrt(dx * dx + dy * dy) * 2
        const fall = Math.max(0, 1 - r)
        const k = n(x / TEX, y / TEX)
        // lumpy edge: the noise eats into the disc from outside in
        let a = fall * fall * (0.35 + 1.25 * k) - (1 - fall) * 0.25
        a = Math.max(0, Math.min(1, a))
        const i = (y * TEX + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
        img.data[i + 3] = Math.round(a * 255)
      }
    }
    cx.putImageData(img, 0, 0)
    masks.push(c)
  }

  // tinted copies, rebuilt only when the lamp colour changes
  function tinted() {
    return masks.map(() => {
      const c = document.createElement('canvas')
      c.width = TEX
      c.height = TEX
      return c
    })
  }
  const warm = tinted()
  const cool = tinted()
  const keys = new Map()

  function tint(set, r, g, b) {
    const key = `${r},${g},${b}`
    if (keys.get(set) === key) return
    keys.set(set, key)
    set.forEach((c, i) => {
      const cx = c.getContext('2d')
      cx.globalCompositeOperation = 'copy'
      cx.drawImage(masks[i], 0, 0)
      cx.globalCompositeOperation = 'source-in'
      cx.fillStyle = `rgb(${r},${g},${b})`
      cx.fillRect(0, 0, TEX, TEX)
    })
  }

  const S = { level: 0, colour: [240, 242, 248], lit: 0 }

  const puffs = []
  const sparks = []
  let heave = 0
  let debt = 0
  let last = performance.now()
  let clock = 0

  const RISE = 0
  const LID = 1
  const FALL = 2
  const TABLE = 3

  // curl of a slowly moving stream function: a divergence-free swirl
  function psi(x, y, t) {
    return (
      Math.sin(x * 0.011 + t * 0.35) * Math.cos(y * 0.013 - t * 0.27) * 1.0 +
      Math.sin(x * 0.023 - y * 0.019 + t * 0.6) * 0.5 +
      Math.cos(x * 0.041 + y * 0.037 - t * 0.9) * 0.22
    )
  }
  function swirlAt(x, y, t) {
    const e = 2
    return [
      (psi(x, y + e, t) - psi(x, y - e, t)) / (2 * e),
      -(psi(x + e, y, t) - psi(x - e, y, t)) / (2 * e)
    ]
  }

  function spawn(kick) {
    const a = Math.random() * Math.PI * 2
    const rr = Math.sqrt(Math.random()) * 14
    puffs.push({
      x: HOLE_X + Math.cos(a) * rr,
      y: HOLE_Y + Math.sin(a) * rr * 0.3,
      vx: (Math.random() - 0.5) * 40,
      vy: -(70 + Math.random() * 60) - (kick || 0),
      r: 9 + Math.random() * 9,
      grow: 6 + Math.random() * 7,
      age: 0,
      life: 10 + Math.random() * 6,
      seed: Math.random() * 100,
      phase: RISE,
      tableY: TABLE_Y + (Math.random() - 0.3) * 26,
      alpha: 0,
      tex: Math.floor(Math.random() * VARIANTS),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.5
    })
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    clock += dt

    debt += S.level * 105 * dt
    while (debt >= 1) {
      debt -= 1
      spawn(0)
    }
    heave *= Math.pow(0.15, dt)

    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]
      p.age += dt
      if (p.age >= p.life || p.y > H + 80 || p.x < -150 || p.x > W + 150) {
        puffs.splice(i, 1)
        continue
      }

      const swirl = Math.sin(p.y * 0.02 + p.seed + clock * 0.6) * 8

      if (p.phase === RISE) {
        // heavy vapour: the push runs out quickly and it rolls back
        p.vy += (75 - heave * 45) * dt
        p.vx += (swirl - p.vx * 0.3) * dt
        if (p.vy > 0 && p.y >= LID_Y) {
          if (p.x > LID_L && p.x < LID_R) {
            p.phase = LID
            p.y = LID_Y
            p.vy = 0
            p.vx = Math.sign(p.x - HOLE_X || 1) * (10 + Math.random() * 30) + (Math.random() - 0.5) * 40
            p.drift = 3 + Math.random() * 9
          } else {
            p.phase = FALL
          }
        }
      } else if (p.phase === LID) {
        // spreads out over the flat lid, drifting to its front rim
        p.vx *= 1 - 0.25 * dt
        p.y += p.drift * dt
        p.grow = 9
        if (p.x < LID_L || p.x > LID_R || p.y > LID_FRONT) {
          p.phase = FALL
          p.vy = 6
        }
      } else if (p.phase === FALL) {
        // slides down the front and sides of the body
        p.vy += 70 * dt
        p.vy = Math.min(p.vy, 95)
        p.vx *= 1 - 0.8 * dt
        // the body is wider than the lid, push out round its shoulders
        if (p.x < CENTRE_X && p.x > BODY_L - 10 && p.y < 560) p.vx -= 10 * dt
        if (p.x > CENTRE_X && p.x < BODY_R + 10 && p.y < 560) p.vx += 10 * dt
        if (p.y >= p.tableY) {
          p.phase = TABLE
          p.y = p.tableY
          p.vy = 4 + Math.random() * 6
          p.vx += Math.sign(p.x - CENTRE_X || 1) * (12 + Math.random() * 22)
        }
      } else {
        // lies low on the table and creeps outward and toward us
        p.vx *= 1 - 0.12 * dt
        p.vx += Math.sign(p.x - CENTRE_X || 1) * 3 * dt
        p.vy *= 1 - 0.05 * dt
        p.grow = Math.max(p.grow, 9)
      }

      // ride the swirl; stronger as the cloud climbs and spreads
      const [sx, sy] = swirlAt(p.x, p.y, clock)
      const amt = p.phase === RISE ? 900 + Math.max(0, HOLE_Y - p.y) * 9 : p.phase === FALL ? 380 : 650
      const lie = p.phase === TABLE || p.phase === LID ? 0.35 : 1

      p.x += (p.vx + sx * amt) * dt
      p.y += (p.vy + sy * amt * lie) * dt
      p.r += p.grow * dt
      p.rot += p.spin * dt

      const t = p.age / p.life
      p.alpha = Math.min(1, p.age * 2.5) * Math.pow(1 - t, 1.3)
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]
      s.age += dt
      if (s.age >= s.life) {
        sparks.splice(i, 1)
        continue
      }
      s.x += s.vx * dt
      s.y += s.vy * dt
    }

    draw()
    requestAnimationFrame(frame)
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)

    const base = [226, 230, 238]
    const k = Math.min(1, S.lit)
    const lamp = (i, w) => Math.round(base[i] + (Math.min(255, S.colour[i] * w + 255 * (1 - w)) - base[i]) * k)
    tint(warm, lamp(0, 0.62), lamp(1, 0.62), lamp(2, 0.62))
    tint(cool, lamp(0, 0.22), lamp(1, 0.22), lamp(2, 0.22))

    // how dense each stage reads: thick near the mouth, a thin veil down
    // the front of the body, a low blanket on the table
    const DENSITY = [0.28, 0.22, 0.09, 0.2]

    ctx.globalCompositeOperation = 'source-over'
    for (const p of puffs) {
      if (p.alpha <= 0.004) continue
      ctx.globalAlpha = p.alpha * DENSITY[p.phase]
      const flat = p.phase === TABLE ? 0.5 : p.phase === LID ? 0.7 : 1
      const d = p.r * 2
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.scale(1, flat)
      ctx.rotate(p.rot)
      ctx.drawImage((p.phase >= FALL ? cool : warm)[p.tex], -p.r, -p.r, d, d)
      ctx.restore()
    }

    ctx.globalCompositeOperation = 'lighter'
    for (const s of sparks) {
      const f = 1 - s.age / s.life
      ctx.globalAlpha = f * f * 0.75
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r * f + 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  requestAnimationFrame((t) => {
    last = t
    frame(t)
  })

  window.Steam = {
    set(level) {
      S.level = level
    },
    colour(r, g, b, lit) {
      S.colour = [r, g, b]
      S.lit = lit
    },
    // a bell strike: the plume heaves up for a moment
    ring(strength) {
      if (S.level <= 0) return
      heave = Math.min(1.5, heave + strength)
      const n = Math.round(3 + strength * 6)
      for (let i = 0; i < n; i++) spawn(30 * strength)
    },
    glint() {
      return
      const n = 1 + Math.round(strength * 3)
      for (let i = 0; i < n; i++) {
        const p = puffs[Math.floor(Math.random() * puffs.length)]
        sparks.push({
          x: p.x + (Math.random() - 0.5) * p.r,
          y: p.y + (Math.random() - 0.5) * p.r * 0.6,
          vx: (Math.random() - 0.5) * 14,
          vy: -6 - Math.random() * 10,
          r: 0.9 + Math.random() * 1.2,
          age: 0,
          life: 0.7 + Math.random() * 0.8
        })
      }
    }
  }
})()
