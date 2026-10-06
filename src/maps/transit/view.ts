import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY } from '../../data/light'
import { playSfx } from '../../audio/sfx'
import { browserStorage } from '../../util/storage'
import { loadSettings } from '../../save/settings'
import { FONT_FAMILY } from '../../ui/theme'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { EXPRESS_COLOR, doorOffsets, toWorld } from './layout'
import { textureSize } from './ground'
import { TransitPainter } from './painter'
import { drawBeam, drawCabin, drawGlow, drawRoof, drawTrainShadow, trainFrame } from './sprites'
import { scheduleOf, transitOf, transitPlanFor } from './world'
import type { PaintTask } from './painter'
import type { PaintScene } from './ground'
import type { Fixture, Track, TransitPlan } from './layout'
import type { TrainNow, TrainPhase } from './timetable'
import type { TransitState } from './world'
import type { TrainSpec, TransitConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：站房外墙的浅灰 */
const BG = 0xc6ced6
const GROUND_KEY = 'transit-ground'
const COVER_KEY = 'transit-cover'
const GLOW_KEY = 'transit-glow'
const BEAM_KEY = 'transit-beam'
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 列车贴图每格多少像素 */
const TRAIN_PPU = 48
/** 深度：车影、车厢、站台边的灯、车灯打在地上的光压在躺着的东西下面；车顶盖在身体上面，站房顶再盖住车顶，车灯与隧道里的光在最上面 */
const SHADOW_DEPTH = 0.55
const CABIN_DEPTH = 0.62
const LIGHTS_DEPTH = 0.7
const BEAM_DEPTH = 0.75
const ROOF_DEPTH = 20
const COVER_DEPTH = 21
const GLOW_DEPTH = 22
const HOLO_DEPTH = 24
/** 站台边的灯隔多远一盏、多长多宽（格） */
const LAMP_STEP_U = 0.5
const LAMP_LEN_U = 0.42
const LAMP_W_U = 0.09
/** 灯光晕在站台面上往外铺多宽（格） */
const HALO_U = 0.34
/** 灯槽中线离道床边多远（格），与地面上画的灯槽对齐 */
const SLOT_AT_U = 0.12
/** 预警时流过站台边的光：一串隔多远（格），起头与最后流得多快（格/秒） */
const CHASE_GAP_U = 2.6
const CHASE_SPEED = [5, 22] as const
/** 颜色：平时的灯、预警与行车的琥珀、开门的绿、关门的红、全息的青 */
const IDLE = 0x8fdcff
const AMBER = 0xffaa2c
const GREEN = 0x4dea8a
const RED = 0xff4d4d
const HOLO = 0x7ff3ff
/** 车影往背着太阳的方向偏多远（格） */
const SHADOW_OFF_U = 0.55
/** 撞车时镜头震多久、多狠 */
const KNOCK_SHAKE = { ms: 180, intensity: 0.006 } as const

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 一条轨道上那列车的画面：车影、车厢、车顶，车头两盏灯、车尾两盏灯、车灯往前打的光，隧道口透出来的光；上一帧在哪一段 */
interface TrainArt {
  readonly track: Track
  readonly shadow: Phaser.GameObjects.Image
  readonly cabin: Phaser.GameObjects.Image
  readonly roof: Phaser.GameObjects.Image
  readonly heads: Phaser.GameObjects.Image[]
  readonly tails: Phaser.GameObjects.Image[]
  readonly beam: Phaser.GameObjects.Image
  readonly portal: Phaser.GameObjects.Image
  readonly spill: Phaser.GameObjects.Image
  express: boolean | null
  phase: TrainPhase | 'none'
  closing: boolean
}

/** 岛式站台上的全息时刻表：浮在底座上方的一块青色的牌子，写着两边轨道的下一班 */
interface Holo {
  readonly f: Extract<Fixture, { kind: 'kiosk' }>
  readonly panel: Phaser.GameObjects.Graphics
  readonly text: Phaser.GameObjects.Text
  shown: string
}

/**
 * 磁浮站：站台、道床与站厅边是开局在后台线程画好的地面，两头的站房顶与隧道口是盖在列车上面的另一层；
 * 列车按时刻表画在轨道上：车影与开门时露出来的车厢压在身体下面，车顶盖在身体上面，门开着时车顶淡下去、看得见车厢里；
 * 站台边的灯按每条轨道此刻在哪一段亮——预警时琥珀色的光朝来车方向一串串流过去、越流越急，隧道口透出越来越亮的车头光，
 * 进站与出站时整条琥珀色，停靠时门边亮绿，快关门时门边闪红；车头的灯往前打在道床上。岛式站台上浮着全息时刻表
 */
export class TransitView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: TransitPlan
  private painter?: TransitPainter
  private trains: TrainArt[] = []
  private holos: Holo[] = []
  private lights?: Phaser.GameObjects.Graphics
  private shake = true
  private ready = false

  private planOf(v: ViewCtx): TransitPlan {
    if (!this.plan) this.plan = transitPlanFor(v.def.transit!, v.run.decorSeed, v.portrait)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    const scene = v.scene
    const cfg = v.def.transit!
    const plan = this.planOf(v)
    const art = (key: string, spec: TrainSpec, draw: (ctx: CanvasRenderingContext2D) => void): void => {
      const f = trainFrame(spec)
      if (!scene.textures.exists(key)) canvasTexture(scene, key, Math.ceil(f.w * TRAIN_PPU), Math.ceil(f.h * TRAIN_PPU), draw)
    }
    for (const t of plan.tracks) {
      art(`transit-roof-${t.color}`, cfg.train, (ctx) => drawRoof(ctx, cfg.train, t.color, TRAIN_PPU, false))
      art(`transit-cabin-${t.color}`, cfg.train, (ctx) => drawCabin(ctx, cfg.train, t.color, TRAIN_PPU))
    }
    art('transit-roof-express', cfg.express, (ctx) => drawRoof(ctx, cfg.express, EXPRESS_COLOR, TRAIN_PPU, true))
    art('transit-cabin-express', cfg.express, (ctx) => drawCabin(ctx, cfg.express, EXPRESS_COLOR, TRAIN_PPU))
    art('transit-shadow', cfg.train, (ctx) => drawTrainShadow(ctx, cfg.train, TRAIN_PPU))
    art('transit-shadow-express', cfg.express, (ctx) => drawTrainShadow(ctx, cfg.express, TRAIN_PPU))
    if (!scene.textures.exists(GLOW_KEY)) canvasTexture(scene, GLOW_KEY, 64, 64, (ctx) => drawGlow(ctx, 64))
    if (!scene.textures.exists(BEAM_KEY)) canvasTexture(scene, BEAM_KEY, 128, 64, (ctx) => drawBeam(ctx, 128, 64))
    this.shake = loadSettings(browserStorage()).hitShake
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 站台上不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.transit
    if (!st) return
    const scene = v.scene
    const sc: PaintScene = { cfg: v.def.transit!, plan: st.plan }
    const size = textureSize()
    const ground = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const cover = canvasTexture(scene, COVER_KEY, size.w, size.h)
    const painter = new TransitPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (const layer of ['ground', 'cover'] as const) for (let y = 0; y < size.h; y += STRIP_PX) tasks.push({ layer, rect: { x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) } })
    await painter.paint(tasks, (p) => {
      const tex = p.layer === 'ground' ? ground : cover
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(ground)
    upload(cover)
    const span = (size.w / GROUND_PPU) * UNIT
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize(span, span).setDepth(-1))
    this.visuals.push(scene.add.image(0, 0, COVER_KEY).setOrigin(0, 0).setDisplaySize(span, span).setDepth(COVER_DEPTH))
    this.lights = scene.add.graphics().setDepth(LIGHTS_DEPTH)
    this.visuals.push(this.lights)
    for (const t of st.plan.tracks) this.trains.push(this.trainArt(v, t))
    for (const f of st.plan.fixtures) if (f.kind === 'kiosk') this.holos.push(this.holo(v, st.plan, f))
    v.lens.screen.vignette(0.82, 0.14, 0x3a4654)
    this.ready = true
  }

  private trainArt(v: ViewCtx, track: Track): TrainArt {
    const scene = v.scene
    const img = (key: string, depth: number): Phaser.GameObjects.Image => {
      const o = scene.add.image(0, 0, key).setDepth(depth).setVisible(false)
      this.visuals.push(o)
      return o
    }
    const glow = (depth: number, tint: number): Phaser.GameObjects.Image => img(GLOW_KEY, depth).setBlendMode(Phaser.BlendModes.ADD).setTint(tint)
    return {
      track,
      shadow: img('transit-shadow', SHADOW_DEPTH),
      cabin: img(`transit-cabin-${track.color}`, CABIN_DEPTH),
      roof: img(`transit-roof-${track.color}`, ROOF_DEPTH),
      heads: [glow(ROOF_DEPTH + 0.1, 0xfff6e0), glow(ROOF_DEPTH + 0.1, 0xfff6e0)],
      tails: [glow(ROOF_DEPTH + 0.1, 0xff3b30), glow(ROOF_DEPTH + 0.1, 0xff3b30)],
      beam: img(BEAM_KEY, BEAM_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff3d6),
      portal: glow(GLOW_DEPTH, 0xfff1d0),
      spill: img(BEAM_KEY, BEAM_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1d0),
      express: null,
      phase: 'none',
      closing: false,
    }
  }

  private holo(v: ViewCtx, plan: TransitPlan, f: Extract<Fixture, { kind: 'kiosk' }>): Holo {
    const w = toWorld(plan, f.u, f.v)
    const panel = v.scene.add.graphics().setDepth(HOLO_DEPTH).setBlendMode(Phaser.BlendModes.ADD)
    const text = v.scene.add
      .text(w.x * UNIT, w.y * UNIT - 1.55 * UNIT, '', { fontFamily: FONT_FAMILY, fontSize: `${Math.round(0.34 * UNIT)}px`, fontStyle: 'bold', color: '#c8fbff', align: 'center', lineSpacing: 2 })
      .setOrigin(0.5, 0.5)
      .setDepth(HOLO_DEPTH + 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(panel, text)
    return { f, panel, text, shown: '' }
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.transit
    if (!st || !this.ready) return
    const cfg = v.def.transit!
    const now = sim.elapsedMs
    const sched = scheduleOf(sim)
    this.lights!.clear()
    this.trains.forEach((a, i) => {
      const tr = sched[i] ?? null
      this.drawTrain(st.plan, cfg, a, tr, now)
      this.drawEdge(st.plan, cfg, a.track, tr, now)
      this.sounds(v, st.plan, cfg, a, tr)
    })
    this.drawHolos(st, cfg, sched, now)
    this.knocks(v, transitOf(sim))
  }

  /** 列车的车影、车厢与车顶：门开到几成车顶就淡下去几成；车头的灯往前打，进站、出站时亮，停着时暗一点；预警时隧道口透出越来越亮的光 */
  private drawTrain(plan: TransitPlan, cfg: TransitConfig, a: TrainArt, tr: TrainNow | null, now: number): void {
    const parts = [a.shadow, a.cabin, a.roof, a.beam, ...a.heads, ...a.tails]
    const d = a.track.dir
    const mouth = toWorld(plan, d > 0 ? plan.u0 - 0.35 : plan.u1 + 0.35, a.track.v)
    const toward = toWorld(plan, d, 0)
    const ang = Math.atan2(toward.y, toward.x)
    if (!tr || tr.phase === 'warn') {
      for (const o of parts) o.setVisible(false)
      const k = tr ? clamp01(tr.into / tr.shape.ms.warn) : 0
      const flick = 0.92 + 0.08 * Math.sin(now / 37)
      a.portal.setVisible(k > 0).setPosition(mouth.x * UNIT, mouth.y * UNIT).setScale(((1.6 + 2.6 * k * k) * UNIT) / 64).setAlpha((0.15 + 0.85 * k * k) * flick)
      const spill = toWorld(plan, d > 0 ? plan.u0 : plan.u1, a.track.v)
      a.spill
        .setVisible(k > 0)
        .setPosition(spill.x * UNIT, spill.y * UNIT)
        .setOrigin(0, 0.5)
        .setRotation(ang)
        .setDisplaySize((3 + 7 * k * k) * UNIT, cfg.tracks.bedU * 1.2 * UNIT)
        .setAlpha(0.35 * k * k * flick)
      return
    }
    a.portal.setVisible(tr.phase === 'arrive' && tr.into < 600).setAlpha(1 - tr.into / 600)
    a.spill.setVisible(false)
    if (a.express !== tr.express) {
      a.express = tr.express
      const suffix = tr.express ? 'express' : `${a.track.color}`
      a.roof.setTexture(`transit-roof-${suffix}`)
      a.cabin.setTexture(`transit-cabin-${suffix}`)
      a.shadow.setTexture(tr.express ? 'transit-shadow-express' : 'transit-shadow')
    }
    const spec = tr.shape.spec
    const mid = toWorld(plan, tr.mid, a.track.v)
    const x = mid.x * UNIT
    const y = mid.y * UNIT
    const s = UNIT / TRAIN_PPU
    a.shadow.setVisible(true).setPosition(x + AWAY.x * SHADOW_OFF_U * UNIT, y + AWAY.y * SHADOW_OFF_U * UNIT).setRotation(ang).setScale(s)
    a.cabin.setVisible(tr.doors > 0).setPosition(x, y).setRotation(ang).setScale(s)
    a.roof.setVisible(true).setPosition(x, y).setRotation(ang).setScale(s).setAlpha(1 - 0.88 * clamp01(tr.doors * 1.15))
    const moving = tr.phase === 'arrive' || tr.phase === 'depart'
    const bright = moving ? 1 : 0.45
    const hw = spec.widthU / 2
    const len = tr.shape.len / 2
    a.heads.forEach((g, k) => {
      const p = toWorld(plan, tr.mid + d * (len - 0.25), a.track.v + (k === 0 ? -1 : 1) * hw * 0.55)
      g.setVisible(true).setPosition(p.x * UNIT, p.y * UNIT).setScale((0.9 * UNIT) / 64).setAlpha(0.85 * bright)
    })
    a.tails.forEach((g, k) => {
      const p = toWorld(plan, tr.mid - d * (len - 0.2), a.track.v + (k === 0 ? -1 : 1) * hw * 0.55)
      g.setVisible(true).setPosition(p.x * UNIT, p.y * UNIT).setScale((0.55 * UNIT) / 64).setAlpha(0.7 * bright)
    })
    const nose = toWorld(plan, tr.mid + d * len, a.track.v)
    const reach = moving ? 3 + tr.speed * 0.35 : 2
    a.beam.setVisible(true).setPosition(nose.x * UNIT, nose.y * UNIT).setOrigin(0, 0.5).setRotation(ang).setDisplaySize(reach * UNIT, spec.widthU * 1.6 * UNIT).setAlpha(0.32 * bright)
  }

  /**
   * 一条轨道两侧站台边的灯：没车时淡淡的白；预警时琥珀色的光一串串朝来车方向流过去、越流越急、越来越亮，最后一刻整条亮起；
   * 进站与出站时整条琥珀色；停靠时一条柔和的白，门边亮一段绿；快关门时门边闪红
   */
  private drawEdge(plan: TransitPlan, cfg: TransitConfig, t: Track, tr: TrainNow | null, now: number): void {
    const g = this.lights!
    const half = cfg.tracks.bedU / 2 + SLOT_AT_U
    const close = cfg.timetable.closeWarnMs
    const phase = tr?.phase ?? 'none'
    const closing = tr !== null && (tr.phase === 'close' || (tr.phase === 'dwell' && tr.left < close))
    const blink = Math.floor(now / 220) % 2 === 0
    const doors = tr ? doorOffsets(tr.shape.spec).map((o) => tr.mid + o) : []
    const doorHalf = tr ? tr.shape.spec.doorU / 2 + 0.15 : 0
    const k = tr && phase === 'warn' ? clamp01(tr.into / tr.shape.ms.warn) : 0
    const speed = CHASE_SPEED[0] + (CHASE_SPEED[1] - CHASE_SPEED[0]) * k
    const run = (now / 1000) * speed
    for (let u = plan.u0 + LAMP_STEP_U / 2; u < plan.u1; u += LAMP_STEP_U) {
      let color = IDLE
      let alpha = 0.22
      if (phase === 'warn' && tr) {
        const along = u * t.dir - run
        const f = ((along % CHASE_GAP_U) + CHASE_GAP_U) % CHASE_GAP_U
        const pulse = Math.exp(-(((f - CHASE_GAP_U / 2) / 0.45) ** 2))
        color = AMBER
        alpha = tr.left < 600 ? 1 : 0.16 + 0.3 * k + 0.75 * pulse
      } else if (phase === 'arrive' || phase === 'depart') {
        color = AMBER
        alpha = 0.85 + 0.15 * Math.sin(now / 60 + u)
      } else if (tr && (phase === 'open' || phase === 'dwell' || phase === 'close')) {
        const atDoor = doors.some((dd) => Math.abs(u - dd) < doorHalf)
        if (atDoor && tr.doors > 0.3) {
          color = closing ? RED : GREEN
          alpha = closing ? (blink ? 1 : 0.15) : 0.9
        } else {
          color = closing ? AMBER : IDLE
          alpha = closing ? 0.45 : 0.4
        }
      }
      for (const side of [-1, 1]) {
        g.fillStyle(color, alpha * 0.22)
        this.lamp(plan, u, t.v + side * (half + HALO_U / 2), LAMP_STEP_U, HALO_U)
        g.fillStyle(color, Math.min(1, 0.35 + alpha))
        this.lamp(plan, u, t.v + side * half, LAMP_LEN_U, LAMP_W_U)
      }
    }
  }

  /** 站台边的一盏灯：沿着轨道 len 格长、横过 wide 格宽的一小段亮条 */
  private lamp(plan: TransitPlan, u: number, v: number, len: number, wide: number): void {
    const c = toWorld(plan, u, v)
    const w = (plan.horiz ? len : wide) * UNIT
    const h = (plan.horiz ? wide : len) * UNIT
    this.lights!.fillRect(c.x * UNIT - w / 2, c.y * UNIT - h / 2, w, h)
  }

  /** 每进一段响一声：预警时站台广播的提示音，进站与出站时磁浮的呼啸，开门、关门的气声，快关门时嘀嘀响；看得见那条轨道才响 */
  private sounds(v: ViewCtx, plan: TransitPlan, cfg: TransitConfig, a: TrainArt, tr: TrainNow | null): void {
    const phase = tr?.phase ?? 'none'
    const closing = tr !== null && (tr.phase === 'close' || (tr.phase === 'dwell' && tr.left < cfg.timetable.closeWarnMs))
    const seen = (): boolean => {
      const p = toWorld(plan, tr ? Math.min(plan.u1, Math.max(plan.u0, tr.mid)) : (plan.u0 + plan.u1) / 2, a.track.v)
      return v.lens.screen.sees(p.x * UNIT, p.y * UNIT, 6 * UNIT)
    }
    if (phase !== a.phase) {
      a.phase = phase
      if (phase === 'warn' && seen()) playSfx('chime')
      else if ((phase === 'arrive' || phase === 'depart') && seen()) playSfx('glide')
      else if ((phase === 'open' || phase === 'close') && seen()) playSfx('doors')
    }
    if (closing !== a.closing) {
      a.closing = closing
      if (closing && seen()) playSfx('beep')
    }
  }

  /** 全息时刻表：底座上方浮着的一块青色的牌子，按两边轨道写下一班几秒进站、停着还有几秒，一闪一闪 */
  private drawHolos(st: TransitState, cfg: TransitConfig, sched: readonly (TrainNow | null)[], now: number): void {
    const plan = st.plan
    for (const h of this.holos) {
      const lines = h.f.tracks.map((i) => {
        const t = plan.tracks[i]!
        const tr = sched[i] ?? null
        const dir = toWorld(plan, t.dir, 0)
        const arrow = dir.x > 0 ? '→' : dir.x < 0 ? '←' : dir.y > 0 ? '↓' : '↑'
        if (!tr) return `${t.label}  ${arrow}  待发`
        if (tr.phase === 'warn') return `${t.label}  ${arrow}  ${Math.ceil(tr.left / 1000)} 秒进站`
        if (tr.phase === 'arrive') return `${t.label}  ${arrow}  进站`
        if (tr.phase === 'depart') return `${t.label}  ${arrow}  出站`
        const left = tr.phase === 'open' ? tr.left + tr.shape.ms.dwell : tr.phase === 'dwell' ? tr.left : 0
        return left > cfg.timetable.closeWarnMs ? `${t.label}  ${arrow}  停 ${Math.ceil(left / 1000)} 秒` : `${t.label}  ${arrow}  关门`
      })
      const text = lines.join('\n')
      if (text !== h.shown) {
        h.text.setText(text)
        h.shown = text
      }
      const flick = 0.82 + 0.1 * Math.sin(now / 90 + h.f.u) + (Math.sin(now / 1300 + h.f.v) > 0.97 ? -0.3 : 0)
      h.text.setAlpha(flick)
      const w = h.text.width + 0.4 * UNIT
      const hh = h.text.height + 0.25 * UNIT
      const p = toWorld(plan, h.f.u, h.f.v)
      const cx = p.x * UNIT
      const cy = p.y * UNIT - 1.55 * UNIT
      const g = h.panel.clear()
      g.fillStyle(HOLO, 0.1 * flick).fillRect(cx - w / 2, cy - hh / 2, w, hh)
      g.lineStyle(2, HOLO, 0.55 * flick).strokeRect(cx - w / 2, cy - hh / 2, w, hh)
      for (let k = 0; k < 6; k++) g.fillStyle(HOLO, 0.05 * flick).fillRect(cx - w / 2, cy - hh / 2 + ((k + ((now / 900) % 1)) / 6) * hh, w, 2)
      g.fillStyle(HOLO, 0.12 * flick).fillTriangle(cx - h.f.r * UNIT * 0.5, cy + hh / 2 + 1.55 * UNIT - hh / 2, cx + h.f.r * UNIT * 0.5, cy + hh / 2 + 1.55 * UNIT - hh / 2, cx, cy + hh / 2)
    }
  }

  /** 撞车：看得见就砰的一声；撞到队员时镜头震一下 */
  private knocks(v: ViewCtx, st: TransitState): void {
    for (const k of st.knocks) {
      if (!v.lens.screen.sees(k.x, k.y, UNIT)) continue
      playSfx('thud')
      if (k.team) {
        playSfx('boom')
        if (this.shake) v.lens.screen.shake(KNOCK_SHAKE.ms, KNOCK_SHAKE.intensity)
      }
    }
    st.knocks.length = 0
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.trains = []
    this.holos = []
    this.lights = undefined
    this.ready = false
    for (const key of [GROUND_KEY, COVER_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
