import Phaser from 'phaser'
import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { AWAY } from '../../data/light'
import { MAPS } from '../../data/maps'
import { playSfx } from '../../audio/sfx'
import { Due, Telegraph, Transform } from '../../ecs/components'
import { telegraphDef } from '../../ecs/store'
import { viewport } from '../../util/apply'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { ART_PPU, drawFinger, drawNib, drawNibShadow, drawRub, FINGER, NIB, RUB, clipHalf, turnOf } from './art'
import { FADE, INK, lookOf, SKETCH } from './author'
import { baseSize, pageSize } from './ground'
import { ringAt } from './layout'
import { TalePainter } from './painter'
import { encodeState, PAGE_FRAG } from './shader'
import { talePlanFor } from './world'
import type { Look } from './author'
import type { PaintScene, PixelRect } from './ground'
import type { Work } from './painter'
import type { Patch, TalePlan } from './layout'
import type { TaleState } from './world'
import type { TaleConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：桌面的暗处 */
const BG = 0x5b3e27
const KEY = { base: 'tale-base', id: 'tale-id', line: 'tale-line', pencil: 'tale-pencil', ink: 'tale-ink', state: 'tale-state', nib: 'tale-nib', nibShadow: 'tale-nib-shadow', finger: 'tale-finger', rub: 'tale-rub' } as const
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 各层的深浅：底图、这一页、聚成怪物的墨迹、纸上的影子（笔尖与橡皮）、翻过去的纸、笔尖、指尖 */
const DEPTH = { base: -1, page: -0.5, form: 1.6, shade: 2.6, turn: 75, nib: 78, finger: 80 } as const
/** 笔尖的手势：从块边绕到哪个方向朝着笔杆（屏幕上的单位向量，右下方是握笔的手）；抬笔时走多快（格/秒），抬多高算看不见了 */
const BODY = { x: 0.55, y: 0.84 } as const
/** 指尖从哪个方向伸过来（屏幕上的单位向量，从页角往手那边） */
const REACH = { x: 0.8, y: 0.6 } as const
const PEN_SPEED_U = 60
const PEN_GONE = 1.6
/** 上色时笔尖在块里绕几圈 */
const FILL_TURNS = 2.5
/** 橡皮的影子：来回擦几下每秒，擦多宽（占块心离边的比例），落下前多淡 */
const RUB_HZ = 2.4
const RUB_SWING = 0.55
/** 墨迹聚成怪物：几笔从多远（格）卷进来，每笔多粗（像素） */
const FORM = { strokes: 5, bossStrokes: 14, fromU: 1.15, bossFromU: 3, width: 3, bossWidth: 5.5 } as const
const INK_COLOR = 0x241c18
/** 开局翻书：翻过几张、每张隔多久、一张翻多久；之后笔尖落下描头一块，描线、上色各多久，描完抬笔多久，毫秒 */
const OPEN = { leaves: 3, gapMs: 230, leafMs: 640, pauseMs: 250, lineMs: 1500, fillMs: 750, liftMs: 350 } as const
/** 赢了翻页：镜头拉远、指尖伸过来捏住页角、把这一页翻过去，各多久；拉远到几倍 */
const CLOSE = { zoomMs: 700, reachMs: 600, turnMs: 1700, holdMs: 400, leftU: 4 } as const
/** 纸的正面、背面、翻起时的影子 */
const LEAF_FRONT = 0xf6efdd
const LEAF_BACK = [0xd6ccb5, 0xe2d9c3, 0xebe3cf, 0xf1eadb, 0xf5efe2] as const
const LEAF_EDGE = 0xb4a78c

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (t: number): number => t * t * (3 - 2 * t)

/** 沿多边形描一圈路径，接着填或描 */
function tracePoly(g: Phaser.GameObjects.Graphics, pts: readonly Point[]): Phaser.GameObjects.Graphics {
  g.beginPath()
  pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
  g.closePath()
  return g
}

/** 把画布传上显卡：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture, mode: Phaser.Textures.FilterMode): void {
  tex.refresh()
  tex.setFilter(mode)
}

/** 笔尖此刻：在哪（像素），抬多高（0 是落在纸上），往哪走 */
interface Pen {
  x: number
  y: number
  h: number
}

/**
 * 童话书：桌面、书与纸是开局在后台线程画好的底图；这一页的每一块按块编号、墨线、四季的铅笔稿与色块画成几张图，由着色器按每块此刻的样子合成在纸上。
 * 画面里只看得见作者的笔尖和它的影子：笔尖沿着铅笔线把块边描深，再在块里绕着把色块填上；橡皮看不见，只看得见它的影子在旧地面上来回擦。
 * 怪物由几笔墨迹卷进来聚成，头目要聚好几秒。开局书翻到这一页，笔尖当着队伍的面描出头一块；赢了以后一截指尖捏住页角，把这一页翻过去
 */
export class TaleView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: TalePlan
  private painter?: TalePainter
  private state?: { readonly tex: Phaser.Textures.CanvasTexture; readonly img: ImageData; readonly looks: Look[] }
  private nib?: Phaser.GameObjects.Image
  private nibShadow?: Phaser.GameObjects.Image
  private finger?: Phaser.GameObjects.Image
  private forms?: Phaser.GameObjects.Graphics
  private turn?: Phaser.GameObjects.Graphics
  private rubs: Phaser.GameObjects.Image[] = []
  private pen: Pen = { x: 0, y: 0, h: PEN_GONE }
  /** 开局翻书描头一块的那一阵：从几时起（场景的毫秒）；描头一块时它的样子由这里给 */
  private opening?: { readonly t0: number; first: Look }
  /** 赢了以后翻页的那一阵：从几时起 */
  private closing?: { t: number }
  private zoom = 1

  private planOf(v: ViewCtx): TalePlan {
    if (!this.plan) this.plan = talePlanFor(v.def.tale!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    const f = p.patches[p.first]!
    return { w: FRAME.w, h: FRAME.h, origin: { x: f.cx * UNIT, y: f.cy * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  followZoom(): number {
    return this.zoom
  }

  /** 收尾时镜头从队长挪到整页的正中，连书脊那边一起看见 */
  aim(_v: ViewCtx, from: Point): Point {
    const c = this.closing
    const pg = this.plan?.page
    if (!c || !pg) return from
    const k = ease(clamp01(c.t / CLOSE.zoomMs))
    const x = ((pg.x0 + pg.x1) / 2 - CLOSE.leftU / 2) * UNIT
    const y = ((pg.y0 + pg.y1) / 2) * UNIT
    return { x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k }
  }

  /** 纸上不撒 emoji：这一页上的一切都是画出来的 */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.tale
    if (!st) return
    const scene = v.scene
    const cfg = v.def.tale!
    const plan = this.planOf(v)
    const sc: PaintScene = { cfg, plan }
    const bs = baseSize()
    const ps = pageSize(cfg)
    const base = canvasTexture(scene, KEY.base, bs.w, bs.h)
    const idTex = canvasTexture(scene, KEY.id, ps.w, ps.h)
    const lineTex = canvasTexture(scene, KEY.line, ps.w, ps.h)
    const pencilTex = canvasTexture(scene, KEY.pencil, ps.w * 2, ps.h * 2)
    const inkTex = canvasTexture(scene, KEY.ink, ps.w * 2, ps.h * 2)
    const painter = new TalePainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const jobs: Work[] = []
    for (let y = 0; y < ps.h; y += STRIP_PX) jobs.push({ layer: 'page', rect: { x0: 0, y0: y, x1: ps.w, y1: Math.min(ps.h, y + STRIP_PX) } })
    for (let y = 0; y < bs.h; y += STRIP_PX) jobs.push({ layer: 'base', rect: { x0: 0, y0: y, x1: bs.w, y1: Math.min(bs.h, y + STRIP_PX) } })
    const put = (tex: Phaser.Textures.CanvasTexture, px: Uint8ClampedArray<ArrayBuffer>, r: PixelRect, dx: number, dy: number): void => {
      tex.getContext().putImageData(new ImageData(px, r.x1 - r.x0, r.y1 - r.y0), r.x0 + dx, r.y0 + dy)
    }
    await painter.paint(jobs, (p) => {
      if (p.base) return put(base, p.base, p.rect, 0, 0)
      put(idTex, p.id!, p.rect, 0, 0)
      put(lineTex, p.line!, p.rect, 0, 0)
      for (let s = 0; s < 4; s++) {
        put(pencilTex, p.pencil![s]!, p.rect, (s % 2) * ps.w, Math.floor(s / 2) * ps.h)
        put(inkTex, p.ink![s]!, p.rect, (s % 2) * ps.w, Math.floor(s / 2) * ps.h)
      }
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    const LINEAR = Phaser.Textures.FilterMode.LINEAR
    const NEAREST = Phaser.Textures.FilterMode.NEAREST
    upload(base, LINEAR)
    upload(idTex, NEAREST)
    upload(lineTex, LINEAR)
    upload(pencilTex, LINEAR)
    upload(inkTex, LINEAR)
    this.visuals.push(scene.add.image(0, 0, KEY.base).setOrigin(0, 0).setDisplaySize(FRAME.w, FRAME.h).setDepth(DEPTH.base))
    this.pageLayer(v, st, ps)
    this.sprites(v)
    v.lens.screen.vignette(0.85, 0.12, 0x2a1a0e)
    await this.open(v, sim, st)
  }

  /** 这一页的合成层：每块的样子编成状态图，着色器铺满页面画 */
  private pageLayer(v: ViewCtx, st: TaleState, ps: { w: number; h: number }): void {
    const scene = v.scene
    const n = st.plan.patches.length
    const tex = canvasTexture(scene, KEY.state, n, 2)
    const img = tex.getContext().createImageData(n, 2)
    this.state = { tex, img, looks: st.plan.patches.map(() => ({ pencil: 0, line: 0, fill: 0, fade: 0 })) }
    const pg = st.plan.page
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'TalePage',
            fragmentSource: PAGE_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uId', 0)
              set('uLine', 1)
              set('uPencil', 2)
              set('uInk', 3)
              set('uState', 4)
              set('uCount', n)
              set('uSize', [ps.w, ps.h])
            },
          },
          pg.x0 * UNIT,
          pg.y0 * UNIT,
          (pg.x1 - pg.x0) * UNIT,
          (pg.y1 - pg.y0) * UNIT,
          [KEY.id, KEY.line, KEY.pencil, KEY.ink, KEY.state],
        )
        .setOrigin(0, 0)
        .setDepth(DEPTH.page),
    )
  }

  /** 笔尖、它的影子、指尖与橡皮影子的贴图，墨迹与翻页的画板 */
  private sprites(v: ViewCtx): void {
    const scene = v.scene
    const art = (key: string, lenU: number, widthU: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void => {
      const w = Math.round(lenU * ART_PPU)
      const h = Math.round(widthU * ART_PPU)
      canvasTexture(scene, key, w, h, (ctx) => draw(ctx, w, h))
    }
    art(KEY.nib, NIB.lenU, NIB.widthU, drawNib)
    art(KEY.nibShadow, NIB.lenU, NIB.widthU, drawNibShadow)
    art(KEY.finger, FINGER.lenU, FINGER.widthU, drawFinger)
    art(KEY.rub, RUB.lenU, RUB.widthU, drawRub)
    const k = UNIT / ART_PPU
    const rot = Math.atan2(BODY.y, BODY.x)
    this.nibShadow = scene.add.image(0, 0, KEY.nibShadow).setOrigin(0.02, 0.5).setScale(k).setDepth(DEPTH.shade).setAlpha(0)
    this.nib = scene.add.image(0, 0, KEY.nib).setOrigin(0.02, 0.5).setScale(k).setRotation(rot).setDepth(DEPTH.nib).setAlpha(0)
    this.finger = scene.add.image(0, 0, KEY.finger).setOrigin(0.97, 0.5).setScale(k).setDepth(DEPTH.finger).setVisible(false)
    this.forms = scene.add.graphics().setDepth(DEPTH.form)
    this.turn = scene.add.graphics().setDepth(DEPTH.turn)
    this.visuals.push(this.nib, this.nibShadow, this.finger, this.forms, this.turn)
  }

  /**
   * 开局：书翻到这一页（几张纸从右往左翻过去，盖着的队伍随之露出来，脚下只有铅笔稿），笔尖落下把头一块描深、填上颜色，抬起笔，战斗才开始
   */
  private open(v: ViewCtx, sim: Sim, st: TaleState): Promise<void> {
    const scene = v.scene
    const first: Look = { pencil: 1, line: 0, fill: 0, fade: 0 }
    this.opening = { t0: scene.time.now, first }
    const flip = OPEN.gapMs * (OPEN.leaves - 1) + OPEN.leafMs
    const drawFrom = flip + OPEN.pauseMs
    const end = drawFrom + OPEN.lineMs + OPEN.fillMs + OPEN.liftMs
    const p = st.plan.patches[st.plan.first]!
    const start = ringAt(p, 0)
    this.pen = { x: start.x * UNIT, y: start.y * UNIT, h: PEN_GONE }
    return new Promise((resolve) => {
      const tick = (_t: number, delta: number): void => {
        const o = this.opening
        if (!o) return
        const t = scene.time.now - o.t0
        const d = t - drawFrom
        first.line = clamp01(d / OPEN.lineMs)
        first.fill = clamp01((d - OPEN.lineMs) / OPEN.fillMs)
        first.pencil = 1 - first.fill
        const leaves: number[] = []
        for (let k = 0; k < OPEN.leaves; k++) leaves.push(clamp01((t - k * OPEN.gapMs) / OPEN.leafMs))
        this.drawLeaves(st.plan, leaves)
        const goal = d < 0 ? { x: start.x, y: start.y, h: d < -OPEN.pauseMs ? PEN_GONE : 0.8 } : d < OPEN.lineMs + OPEN.fillMs ? { ...this.penOn(p, first.line, first.fill, d < OPEN.lineMs), h: 0 } : { x: p.cx, y: p.cy, h: PEN_GONE }
        this.movePen(goal, delta)
        if (d > 0 && d < OPEN.lineMs + OPEN.fillMs) playSfx('scribble')
        this.paintState(v, sim, st)
        if (t < end) return
        scene.events.off(Phaser.Scenes.Events.UPDATE, tick)
        this.turn?.clear()
        this.opening = undefined
        resolve()
      }
      scene.events.on(Phaser.Scenes.Events.UPDATE, tick)
      playSfx('leaf')
    })
  }

  /** 笔尖描一块时落在哪，格：描线时沿着轮廓走，上色时在块里一圈圈往块心绕 */
  private penOn(p: Patch, line: number, fill: number, tracing: boolean): Point {
    if (tracing) return ringAt(p, line)
    const r = p.inner * 0.85 * (1 - fill)
    const a = p.a0 + fill * FILL_TURNS * Math.PI * 2
    return { x: p.cx + Math.cos(a) * r, y: p.cy + Math.sin(a) * r }
  }

  /** 笔尖往 goal（格）挪：离得远就抬起来快快飞过去，到了再落下；抬得越高越大、影子离得越远，抬到看不见就淡没了 */
  private movePen(goal: { x: number; y: number; h: number }, delta: number): void {
    const pen = this.pen
    const gx = goal.x * UNIT
    const gy = goal.y * UNIT
    const dist = Math.hypot(gx - pen.x, gy - pen.y)
    const step = (PEN_SPEED_U * UNIT * delta) / 1000
    const far = dist > 0.35 * UNIT
    const wantH = far ? Math.max(goal.h, 0.7) : goal.h
    pen.h += (wantH - pen.h) * Math.min(1, delta / 90)
    if (dist <= step || !far) {
      pen.x = gx
      pen.y = gy
    } else {
      pen.x += ((gx - pen.x) / dist) * step
      pen.y += ((gy - pen.y) / dist) * step
    }
    const nib = this.nib
    const shadow = this.nibShadow
    if (!nib || !shadow) return
    const h = pen.h
    const shown = 1 - clamp01((h - 1) / (PEN_GONE - 1))
    const k = UNIT / ART_PPU
    nib.setPosition(pen.x, pen.y - h * 0.35 * UNIT).setScale(k * (1 + 0.16 * h)).setAlpha(shown)
    const sx = BODY.x + AWAY.x * 0.6
    const sy = BODY.y + AWAY.y * 0.6
    shadow
      .setPosition(pen.x + AWAY.x * h * 1.3 * UNIT, pen.y + AWAY.y * h * 1.3 * UNIT)
      .setRotation(Math.atan2(sy, sx))
      .setScale(k * 1.3 * (1 + 0.3 * h), k * (1 + 0.5 * h))
      .setAlpha(shown * 0.3 * (1 - 0.55 * clamp01(h)))
  }

  /** 每块此刻的样子编进状态图、传上显卡：开局描头一块的那一阵，头一块按开局的动画画 */
  private paintState(_v: ViewCtx, sim: Sim, st: TaleState): void {
    const s = this.state
    if (!s) return
    const cfg = MAPS[sim.mapId].tale!
    const a = st.author
    for (let i = 0; i < s.looks.length; i++) lookOf(a, cfg, i, sim.elapsedMs, s.looks[i]!)
    if (this.opening) Object.assign(s.looks[st.plan.first]!, this.opening.first)
    encodeState(s.looks, a.season, a.scrub, s.img.data)
    s.tex.getContext().putImageData(s.img, 0, 0)
    upload(s.tex, Phaser.Textures.FilterMode.NEAREST)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const st = sim.worldState.tale
    if (!st || !this.state) return
    this.paintState(v, sim, st)
    this.drivePen(sim, st, delta)
    this.drawRubs(v, sim, st)
    this.drawForms(sim)
  }

  /** 平时的笔尖：有块正在描就落在那里；有铅笔稿等着描就悬在它的起笔处；都没有就抬走 */
  private drivePen(sim: Sim, st: TaleState, delta: number): void {
    const a = st.author
    const now = sim.elapsedMs
    const i = a.phase.indexOf(INK)
    if (i >= 0) {
      const p = st.plan.patches[i]!
      const t = now - a.at[i]!
      const line = clamp01(t / a.line[i]!)
      const fill = clamp01((t - a.line[i]!) / a.fill[i]!)
      this.movePen({ ...this.penOn(p, line, fill, t < a.line[i]!), h: 0 }, delta)
      playSfx('scribble')
      return
    }
    if (a.next >= 0 && a.phase[a.next] === SKETCH) {
      const q = ringAt(st.plan.patches[a.next]!, 0)
      const wait = a.draw - now
      this.movePen({ x: q.x, y: q.y, h: wait < 1500 ? 0.7 : PEN_GONE }, delta)
      return
    }
    this.movePen({ x: this.pen.x / UNIT, y: this.pen.y / UNIT, h: PEN_GONE }, delta)
  }

  /** 橡皮的影子：先从高处落下来（又大又淡），落到纸上就顺着一个方向来回擦，一边擦一边往前挪，擦完抬走 */
  private drawRubs(v: ViewCtx, sim: Sim, st: TaleState): void {
    const a = st.author
    const c = (v.def.tale as TaleConfig).author
    const now = sim.elapsedMs
    let used = 0
    a.phase.forEach((ph, i) => {
      if (ph !== FADE) return
      const p = st.plan.patches[i]!
      const t = now - a.at[i]!
      const total = c.warnMs + c.fadeMs
      const land = clamp01(t / c.warnMs)
      const leave = clamp01((t - total + 400) / 400)
      const dir = a.scrub[i]!
      const dx = Math.cos(dir)
      const dy = Math.sin(dir)
      const swing = Math.sin((t / 1000) * RUB_HZ * Math.PI * 2) * p.inner * RUB_SWING * land
      const sweep = (clamp01(t / total) - 0.5) * p.inner * 0.9
      const x = p.cx + dx * swing - dy * sweep
      const y = p.cy + dy * swing + dx * sweep
      const lift = 1 - land + leave
      let img = this.rubs[used]
      if (!img) {
        img = v.scene.add.image(0, 0, KEY.rub).setDepth(DEPTH.shade)
        this.rubs.push(img)
        this.visuals.push(img)
      }
      used++
      const k = (UNIT / ART_PPU) * (1 + lift * 0.7)
      img
        .setVisible(true)
        .setPosition((x + AWAY.x * lift * 1.6) * UNIT, (y + AWAY.y * lift * 1.6) * UNIT)
        .setRotation(dir)
        .setScale(k)
        .setAlpha(0.42 * (1 - 0.75 * clamp01(lift)))
      if (land >= 1 && leave <= 0) playSfx('rub')
    })
    for (let k = used; k < this.rubs.length; k++) this.rubs[k]!.setVisible(false)
  }

  /** 正在聚成的怪物：几笔墨迹从四周卷进来，越卷越粗，最后在中间洇成一团；头目的笔多、卷得远，墨团一直在涨 */
  private drawForms(sim: Sim): void {
    const g = this.forms
    if (!g) return
    g.clear()
    const now = sim.elapsedMs
    for (const t of query(sim.world, [Telegraph, Due, Transform])) {
      const def = telegraphDef[t]
      if (!def) continue
      const boss = Telegraph.boss[t] === 1
      const born = Telegraph.bornMs[t]!
      const k = clamp01((now - born) / Math.max(1, Due.at[t]! - born))
      const x = Transform.x[t]!
      const y = Transform.y[t]!
      const n = boss ? FORM.bossStrokes : FORM.strokes
      const from = (boss ? FORM.bossFromU : FORM.fromU) * UNIT
      const width = boss ? FORM.bossWidth : FORM.width
      const seed = (t * 2654435761) >>> 0
      for (let s = 0; s < n; s++) {
        const h = (((seed + s * 40503) * 2246822519) >>> 0) / 4294967296
        const a0 = (s / n) * Math.PI * 2 + h * 1.3
        const turn = (1.1 + h * 0.8) * (s % 2 === 0 ? 1 : -1)
        const r0 = from * (0.75 + 0.5 * h)
        const head = clamp01(k * 1.5 - (s / n) * 0.5)
        const tail = clamp01(k * 1.5 - 0.45 - (s / n) * 0.5)
        if (head <= tail) continue
        g.lineStyle(width * (0.55 + 0.7 * k), INK_COLOR, 0.85)
        g.beginPath()
        const seg = 14
        for (let j = 0; j <= seg; j++) {
          const u = tail + ((head - tail) * j) / seg
          const r = r0 * (1 - u) + def.radius * 0.25 * u
          const ang = a0 + turn * u
          const px = x + Math.cos(ang) * r
          const py = y + Math.sin(ang) * r
          if (j === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
        g.strokePath()
      }
      const blot = def.radius * (boss ? 1.25 : 0.95) * ease(clamp01((k - 0.35) / 0.65))
      if (blot <= 0) continue
      g.fillStyle(INK_COLOR, 0.9)
      g.beginPath()
      const m = 20
      for (let j = 0; j <= m; j++) {
        const ang = (j / m) * Math.PI * 2
        const wob = 1 + 0.12 * Math.sin(ang * 5 + seed + now / (boss ? 260 : 120)) + 0.07 * Math.sin(ang * 3 - now / 400)
        const px = x + Math.cos(ang) * blot * wob
        const py = y + Math.sin(ang) * blot * wob
        if (j === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.closePath()
      g.fillPath()
    }
  }

  /** 开局翻过去的几张纸：还没开始翻的整张盖着，正在翻的盖着没翻起的那部分、翻过来的背面压在折线另一侧 */
  private drawLeaves(plan: TalePlan, leaves: readonly number[]): void {
    const g = this.turn
    if (!g) return
    g.clear()
    const page = this.pagePoly(plan)
    if (leaves.some((s) => s <= 0)) {
      g.fillStyle(LEAF_FRONT, 1)
      tracePoly(g, page).fillPath()
    }
    for (let k = leaves.length - 1; k >= 0; k--) {
      const s = leaves[k]!
      if (s <= 0 || s >= 1) continue
      this.drawTurn(plan, page, ease(s), false)
    }
  }

  /** 页面的四个角，像素 */
  private pagePoly(plan: TalePlan): Point[] {
    const { x0, y0, x1, y1 } = plan.page
    return [
      { x: x0 * UNIT, y: y0 * UNIT },
      { x: x1 * UNIT, y: y0 * UNIT },
      { x: x1 * UNIT, y: y1 * UNIT },
      { x: x0 * UNIT, y: y1 * UNIT },
    ]
  }

  /**
   * 翻到 s（0 到 1）时的这一页：右下的页角沿一道弧拉到书脊另一侧；离开纸面的那部分露出下一页（reveal 时画成空白的下一页，不然那里本来就是露着的），
   * 翻过来的背面从折线往外由暗到亮，折线这一侧的下一页上落一道影子；返回页角此刻在哪（像素）
   */
  private drawTurn(plan: TalePlan, page: readonly Point[], s: number, reveal: boolean): Point {
    const g = this.turn!
    const { x0, x1, y1, y0 } = plan.page
    const c = { x: x1 * UNIT, y: y1 * UNIT }
    const end = { x: (2 * x0 - x1) * UNIT, y: y1 * UNIT }
    const lift = Math.sin(Math.PI * s) * (y1 - y0) * 0.3 * UNIT
    const p = { x: c.x + (end.x - c.x) * s, y: c.y + (end.y - c.y) * s - lift }
    const tn = turnOf(page, c, p)
    if (tn.lifted.length < 3) return p
    const front = clipHalf(page, tn.m, { x: -tn.n.x, y: -tn.n.y })
    if (!reveal && front.length >= 3) {
      g.fillStyle(LEAF_FRONT, 1)
      tracePoly(g, front).fillPath()
    }
    if (reveal) {
      g.fillStyle(LEAF_FRONT, 1)
      tracePoly(g, tn.lifted).fillPath()
    }
    for (let b = 0; b < 4; b++) {
      const band = clipHalf(clipHalf(tn.lifted, tn.m, tn.n, b * 0.25 * UNIT), tn.m, { x: -tn.n.x, y: -tn.n.y }, -(b + 1) * 0.25 * UNIT)
      if (band.length < 3) continue
      g.fillStyle(0x3a2a18, 0.16 * (1 - b / 4))
      tracePoly(g, band).fillPath()
    }
    const flapN = { x: -tn.n.x, y: -tn.n.y }
    LEAF_BACK.forEach((color, b) => {
      const last = b === LEAF_BACK.length - 1
      let band = clipHalf(tn.flap, tn.m, flapN, b * 0.6 * UNIT)
      if (!last) band = clipHalf(band, tn.m, tn.n, -(b + 1) * 0.6 * UNIT)
      if (band.length < 3) return
      g.fillStyle(color, 1)
      tracePoly(g, band).fillPath()
    })
    g.lineStyle(1.5, LEAF_EDGE, 0.9)
    tracePoly(g, tn.flap).strokePath()
    return p
  }

  /** 赢了：镜头拉远看见整页，一截指尖从右下伸过来捏住页角，把这一页翻过去；返回要演多久 */
  won(v: ViewCtx, sim: Sim): number {
    if (!sim.worldState.tale || !this.state) return 0
    this.closing = { t: 0 }
    this.nib?.setAlpha(0)
    this.nibShadow?.setAlpha(0)
    this.forms?.clear()
    playSfx('leaf')
    void v
    return CLOSE.zoomMs + CLOSE.reachMs + CLOSE.turnMs + CLOSE.holdMs
  }

  ending(v: ViewCtx, sim: Sim, delta: number): void {
    const c = this.closing
    const st = sim.worldState.tale
    if (!c || !st) return
    c.t += delta
    const plan = st.plan
    // 拉远到整页放得进屏幕：页面连书脊那边与上下一点桌面
    const rs = viewport.renderScale
    const fit = Math.min(1, v.scene.scale.width / (rs * (plan.page.x1 - plan.page.x0 + CLOSE.leftU + 1) * UNIT), v.scene.scale.height / (rs * (plan.page.y1 - plan.page.y0 + 2) * UNIT))
    this.zoom = 1 + (fit - 1) * ease(clamp01(c.t / CLOSE.zoomMs))
    const reach = clamp01((c.t - CLOSE.zoomMs) / CLOSE.reachMs)
    const s = clamp01((c.t - CLOSE.zoomMs - CLOSE.reachMs) / CLOSE.turnMs)
    const g = this.turn!
    g.clear()
    const corner = { x: plan.page.x1 * UNIT, y: plan.page.y1 * UNIT }
    let at = corner
    if (s > 0) at = this.drawTurn(plan, this.pagePoly(plan), ease(s), true)
    const f = this.finger!
    if (reach <= 0) return void f.setVisible(false)
    // 指尖从右下方伸过来，按住页角时微微一压，翻的时候捏着页角走
    const away = (1 - ease(reach)) * 7 * UNIT
    const press = reach >= 1 && s <= 0.05 ? 0.96 : 1
    f.setVisible(true)
      .setPosition(at.x + REACH.x * away, at.y + REACH.y * away)
      .setRotation(Math.atan2(-REACH.y, -REACH.x))
      .setScale((UNIT / ART_PPU) * press)
    void v
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    this.opening = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.rubs = []
    this.state = undefined
    for (const key of Object.values(KEY)) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
