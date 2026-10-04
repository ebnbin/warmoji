import Phaser from 'phaser'
import { MAP } from '../data/maps'
import { safeInsets, viewport } from '../util/apply'
import { mainCameraOnly } from '../util/camera'
import { UNIT } from '../util/units'
import { fitAspectRect } from './worlds/torus'
import type { Point } from '../util/vec'

/** 世界里的一块矩形，像素 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * 一张图怎么被拍：map 是地图矩形，玩法都在里面；edge 是它的边，clamp 跟随时镜头停在地图外 cameraMargin 格，open 不设边，
 * wrap 四边回绕、一圈就是地图矩形；fit 的图平时就整张放进一屏、不跟随
 */
export interface Framing {
  readonly map: Rect
  readonly edge: 'clamp' | 'open' | 'wrap'
  readonly fit?: boolean
}

/** follow 跟着锚点走；map 固定拍地图矩形；reach 固定拍跟随时屏幕最远能看到的范围，不设边的图按 openMargin 算 */
export const LENS_MODES = ['follow', 'map', 'reach'] as const
export type LensMode = (typeof LENS_MODES)[number]

/** 环面固定取景时，八台镜像镜头各比主镜头偏几圈 */
const MIRRORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const
/** 盖满屏幕的东西比屏幕多铺一点，取整时不露缝 */
const COVER_SLACK = 1.02
const ZERO: Point = { x: 0, y: 0 }

/** 屏幕上的一块，设备像素 */
interface Port {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

interface Quake {
  elapsed: number
  readonly ms: number
  readonly intensity: number
}

/**
 * 战斗镜头：只有它摆镜头。每帧按模式定下拍哪里、拍多大；环面固定取景时另开八台镜像镜头，把一圈外的东西画回框里。
 * 震屏所有镜头一起震，屏幕上的幅度按跟随时的缩放算；盖满屏幕的底色与遮罩随缩放保持铺满
 */
export class Lens {
  private framing: Framing = { map: { x: 0, y: 0, w: 1, h: 1 }, edge: 'clamp' }
  private mode: LensMode = 'follow'
  private followZoom = 1
  private mirrors: Phaser.Cameras.Scene2D.Camera[] = []
  private readonly covers: Phaser.GameObjects.Rectangle[] = []
  private coverKey = ''
  private quake: Quake | null = null
  private port: Port = { x: 0, y: 0, w: 1, h: 1 }
  private zoom = 1
  private cx = 0
  private cy = 0
  /** 场景关闭时 Phaser 已拆掉镜头，之后不能再碰 */
  private alive = true

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false
      this.mirrors = []
      this.covers.length = 0
    })
  }

  /** 开局或屏幕变了：换上这张图的取景，下一次 step 起生效 */
  frame(framing: Framing): void {
    this.framing = framing
  }

  setMode(mode: LensMode): void {
    this.mode = mode
  }

  /** 跟随时的缩放倍率，1 是标准；固定取景时不起作用 */
  setFollowZoom(k: number): void {
    this.followZoom = k
  }

  /** 每帧：按模式摆好所有镜头，推进震屏，让盖满屏幕的东西跟上缩放 */
  step(anchor: Point, dtMs: number): void {
    if (!this.alive) return
    const W = this.scene.scale.width
    const H = this.scene.scale.height
    const f = this.framing
    const follow = this.mode === 'follow'
    const area: Port = follow ? { x: 0, y: 0, w: W, h: H } : safeArea(W, H)
    const followZoom = viewport.renderScale * this.followZoom
    let port: Port = { x: 0, y: 0, w: W, h: H }
    let zoom: number
    let cx: number
    let cy: number
    let wrap = false
    if (follow && !f.fit) {
      zoom = followZoom
      cx = anchor.x
      cy = anchor.y
      if (f.edge === 'clamp') {
        const b = this.bounds()
        cx = clampSpan(cx, b.x, b.w, W / zoom)
        cy = clampSpan(cy, b.y, b.h, H / zoom)
      }
    } else if (f.edge === 'wrap') {
      const r = cellOf(f.map, anchor)
      port = fitIn(area, r.w, r.h)
      zoom = Math.min(port.w / r.w, port.h / r.h)
      cx = r.x + r.w / 2
      cy = r.y + r.h / 2
      wrap = true
    } else {
      const r = this.target()
      zoom = Math.min(area.w / r.w, area.h / r.h)
      cx = r.x + r.w / 2 - (area.x + area.w / 2 - W / 2) / zoom
      cy = r.y + r.h / 2 - (area.y + area.h / 2 - H / 2) / zoom
    }
    const q = this.tremor(dtMs, port, f.fit ? zoom : followZoom, zoom)
    this.place(port, zoom, cx + q.x, cy + q.y, wrap)
  }

  /** 所有镜头一起震；正在震时再要震就不理，同 Phaser */
  shake(ms: number, intensity: number): void {
    if (this.quake) return
    this.quake = { elapsed: 0, ms, intensity }
  }

  flash(ms: number, r: number, g: number, b: number): void {
    if (this.alive) this.scene.cameras.main.flash(ms, r, g, b)
  }

  /** 盖满屏幕的底色或遮罩：不随镜头走，随缩放保持铺满，只让主镜头画 */
  cover<T extends Phaser.GameObjects.Rectangle>(rect: T): T {
    mainCameraOnly(rect).setScrollFactor(0)
    this.covers.push(rect)
    rect.once(Phaser.GameObjects.Events.DESTROY, () => {
      const i = this.covers.indexOf(rect)
      if (i >= 0) this.covers.splice(i, 1)
    })
    this.fitCover(rect)
    return rect
  }

  /** 只让主镜头画：自己已按周期铺满一圈的东西，镜像镜头不再画一遍 */
  mainOnly<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    return mainCameraOnly(obj)
  }

  /** 主镜头此刻拍到的世界范围 */
  view(): Rect {
    const w = this.port.w / this.zoom
    const h = this.port.h / this.zoom
    return { x: this.cx - w / 2, y: this.cy - h / 2, w, h }
  }

  /** 屏幕上此刻看得到的世界范围：镜像镜头拍到的那几圈也算 */
  visible(): Rect {
    const v = this.view()
    if (this.mirrors.length === 0) return v
    const m = this.framing.map
    return { x: v.x - m.w, y: v.y - m.h, w: v.w + m.w * 2, h: v.h + m.h * 2 }
  }

  /** 跟随时镜头停在哪：地图外 cameraMargin 格，再加上这一边的设备安全区 */
  private bounds(): Rect {
    const m = this.framing.map
    const g = MAP.cameraMargin * UNIT
    const s = safeInsets
    return { x: m.x - g - s.left, y: m.y - g - s.top, w: m.w + g * 2 + s.left + s.right, h: m.h + g * 2 + s.top + s.bottom }
  }

  /** 固定取景时框住的范围 */
  private target(): Rect {
    const f = this.framing
    if (this.mode !== 'reach' || f.fit) return f.map
    return grow(f.map, (f.edge === 'open' ? MAP.openMargin : MAP.cameraMargin) * UNIT)
  }

  /** 这一帧震屏把镜头挪多少，世界像素：屏幕上的幅度按 Phaser 的震法在缩放 base 下算，再换到此刻的缩放 */
  private tremor(dtMs: number, port: Port, base: number, zoom: number): Point {
    const q = this.quake
    if (!q) return ZERO
    q.elapsed += dtMs
    if (q.elapsed >= q.ms) {
      this.quake = null
      return ZERO
    }
    const k = (q.intensity * base * base) / zoom
    return { x: (Math.random() * 2 - 1) * k * port.w, y: (Math.random() * 2 - 1) * k * port.h }
  }

  private place(port: Port, zoom: number, cx: number, cy: number, wrap: boolean): void {
    const main = this.scene.cameras.main
    setPort(main, port)
    main.setZoom(zoom)
    main.setScroll(cx - port.w / 2, cy - port.h / 2)
    if (wrap) {
      const cams = this.scene.cameras
      if (this.mirrors.length === 0) this.mirrors = MIRRORS.map(() => cams.add(port.x, port.y, port.w, port.h))
      const m = this.framing.map
      this.mirrors.forEach((c, i) => {
        const [dx, dy] = MIRRORS[i]!
        setPort(c, port)
        c.setZoom(zoom)
        c.setScroll(cx + dx * m.w - port.w / 2, cy + dy * m.h - port.h / 2)
      })
    } else if (this.mirrors.length > 0) {
      for (const c of this.mirrors) this.scene.cameras.remove(c)
      this.mirrors = []
    }
    this.port = port
    this.zoom = zoom
    this.cx = cx
    this.cy = cy
    const key = `${port.w}x${port.h}@${zoom}`
    if (key === this.coverKey) return
    this.coverKey = key
    for (const r of this.covers) this.fitCover(r)
  }

  /** 卷动系数为 0 的东西按镜头视口的中心缩放：放在视口一半处、边长是视口除以缩放，正好盖满 */
  private fitCover(rect: Phaser.GameObjects.Rectangle): void {
    const s = COVER_SLACK / this.zoom
    rect.setPosition(this.port.w / 2, this.port.h / 2).setSize(this.port.w * s, this.port.h * s)
  }
}

function setPort(cam: Phaser.Cameras.Scene2D.Camera, p: Port): void {
  if (cam.x !== p.x || cam.y !== p.y || cam.width !== p.w || cam.height !== p.h) cam.setViewport(p.x, p.y, p.w, p.h)
}

/** 镜头中心在一个方向上能到哪：看到的不出 [lo, lo + len]，看到的比它宽时贴着 lo，同 Phaser 的 setBounds */
function clampSpan(c: number, lo: number, len: number, seen: number): number {
  const min = lo + seen / 2
  return Math.min(Math.max(c, min), Math.max(min, lo + len - seen / 2))
}

/** 屏幕让出刘海与圆角之后的那块，设备像素 */
function safeArea(w: number, h: number): Port {
  const k = viewport.renderScale
  const s = safeInsets
  return { x: s.left * k, y: s.top * k, w: w - (s.left + s.right) * k, h: h - (s.top + s.bottom) * k }
}

function grow(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 }
}

/** 环面上 p 落在哪一圈 */
function cellOf(map: Rect, p: Point): Rect {
  return {
    x: map.x + Math.floor((p.x - map.x) / map.w) * map.w,
    y: map.y + Math.floor((p.y - map.y) / map.h) * map.h,
    w: map.w,
    h: map.h,
  }
}

/** area 里放得下的最大的 w:h 一块，居中，取整到设备像素 */
function fitIn(area: Port, w: number, h: number): Port {
  const r = fitAspectRect(area.w, area.h, w, h)
  return { x: Math.round(area.x + r.x), y: Math.round(area.y + r.y), w: Math.round(r.w), h: Math.round(r.h) }
}
