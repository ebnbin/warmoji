import type Phaser from 'phaser'
import { Transform, Uid } from '../components'
import { cubicEaseOut } from '../utils/ease'
import { charSize } from '../systems/shared/scale'
import { HIT_CUE, HIT_CUE_MS } from '../present/hitCues'
import type { HitCueKind, HitCues } from '../present/hitCues'
import { LayerType, TriBatch } from './layer'
import { ringStrip, segment, tri } from './tri'
import type { Scratch } from './tri'
import { packTint } from './tint'

type Matrix = Phaser.GameObjects.Components.TransformMatrix

/** 盖在立着的身体上面，压在伤害数字下面 */
const DEPTH = 14.5

/** 火花：几道从挨打处顺着来向往外迸，离中心 FROM 像素起、长 LEN 像素，散开的角度 SPREAD */
const SPARK = { from: 8, len: [12, 20, 20, 12], spread: [-0.75, -0.25, 0.25, 0.75], width: 3 } as const
/** 队员身边的一弧：半径是身体尺寸的 R，张角半边 HALF 弧度，外面一个指过去的尖 */
const HURT = { r: 0.6, half: 0.6, width: 5, tip: 9, tipW: 7 } as const

/** 打中时的指示画在一层里，按画面时钟走 */
export class HitCueLayer {
  private readonly batch: TriBatch
  private now = 0

  constructor(scene: Phaser.Scene, private readonly cues: HitCues) {
    this.batch = new TriBatch(scene, LayerType.Shape, DEPTH, (o, m) => this.build(o, m))
  }

  destroy(): void {
    this.batch.destroy()
  }

  step(fxMs: number): void {
    this.now = fxMs
  }

  private build(o: Scratch, m: Matrix): void {
    const c = this.cues
    const cap = c.born.length
    for (let j = 0; j < cap; j++) {
      const i = (c.head + j) % cap
      const kind = c.kind[i]! as HitCueKind
      const t = (this.now - c.born[i]!) / HIT_CUE_MS[kind]
      if (!(t >= 0 && t < 1)) continue
      if (kind === HIT_CUE.trace) trace(o, m, c, i, t)
      else if (kind === HIT_CUE.spark) spark(o, m, c, i, t)
      else hurt(o, m, c, i, t)
    }
  }
}

/** 一道光从出手处窜到挨打处：头先到，尾巴随后跟上收掉 */
function trace(o: Scratch, m: Matrix, c: HitCues, i: number, t: number): void {
  const head = Math.min(1, t / 0.35)
  const tail = Math.max(0, (t - 0.3) / 0.7)
  const fx = c.x1[i]!
  const fy = c.y1[i]!
  const dx = c.x0[i]! - fx
  const dy = c.y0[i]! - fy
  if (dx * dx + dy * dy < 16 * 16) return
  const ax = fx + dx * tail
  const ay = fy + dy * tail
  const bx = fx + dx * head
  const by = fy + dy * head
  const a = 1 - t * 0.6
  segment(o, m, ax, ay, bx, by, 5, packTint(c.color[i]!, 0.75 * a))
  segment(o, m, ax, ay, bx, by, 1.6, packTint(0xffffff, 0.9 * a))
}

/** 挨打处顺着来向往外迸几道 */
function spark(o: Scratch, m: Matrix, c: HitCues, i: number, t: number): void {
  const dx = c.x0[i]! - c.x1[i]!
  const dy = c.y0[i]! - c.y1[i]!
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const base = Math.atan2(dy, dx)
  const e = cubicEaseOut(t)
  const color = packTint(c.color[i]!, 1 - t)
  // 迸发点挪到挨打者朝来处的那一侧
  const cx = c.x0[i]! - (dx / len) * SPARK.from
  const cy = c.y0[i]! - (dy / len) * SPARK.from
  for (let k = 0; k < SPARK.spread.length; k++) {
    const a = base + SPARK.spread[k]!
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const r0 = SPARK.from + 16 * e
    const r1 = r0 + SPARK.len[k]! * (1 - e)
    segment(o, m, cx + ca * r0, cy + sa * r0, cx + ca * r1, cy + sa * r1, SPARK.width, color)
  }
}

/** 队员身边朝来处的一弧，外面一个尖指过去；身体还是那个人就跟着它走 */
function hurt(o: Scratch, m: Matrix, c: HitCues, i: number, t: number): void {
  const who = c.who[i]!
  const alive = who >= 0 && Uid.v[who] === c.whoUid[i]
  const x = alive ? Transform.x[who]! : c.x0[i]!
  const y = alive ? Transform.y[who]! : c.y0[i]!
  const a = Math.atan2(c.y1[i]! - y, c.x1[i]! - x)
  const r = (alive ? charSize(who) || Transform.w[who]! : 0) * HURT.r || 40
  const alpha = 1 - t * t
  const color = packTint(c.color[i]!, 0.95 * alpha)
  ringStrip(o, m, x, y, r, HURT.width, color, a - HURT.half, a + HURT.half)
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const bx = x + ca * (r + HURT.width)
  const by = y + sa * (r + HURT.width)
  tri(o, m, bx + ca * HURT.tip, by + sa * HURT.tip, bx - sa * HURT.tipW, by + ca * HURT.tipW, bx + sa * HURT.tipW, by - ca * HURT.tipW, color)
}
