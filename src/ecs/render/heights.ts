import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { MATERIALS } from '../../data/obstacles'
import { UNIT } from '../../util/units'
import { Alive, Pickup, Proj, Projectile, Radius, Shard, Span, Transform, VisOff } from '../components'
import { boltZ, hiOf, layerAt, layersOf, loOf, overOf } from '../utils/pass'
import { roomAt } from '../worlds/basin'
import type { Lens, Rect } from '../lens'
import type { Sim } from '../sim'

/** 一层一种颜色，从贴地的一层往上：绿、黄、橙，再往上都是红；地形按它挡到的最高一层取色 */
const LAYER_COLORS = [0x43a047, 0xfdd835, 0xfb8c00, 0xe53935] as const
/** 一直高上去的地形 */
const ENDLESS = 0x8e24aa
/** 不是地面、也没有高度的硬边界 */
const VOID = 0x9e9e9e
const FILL_ALPHA = 0.5

const KEY = 'dev-heights'
/** 地形每隔多远取一个点，格；镜头拉远时按 2 的倍数放稀，一次最多取这么多点 */
const STEP_U = 0.1
const MAX_SAMPLES = 40_000
/** 取样的范围比镜头每边多出这么宽（格），隔这么久（毫秒）重取一次；镜头出了取样范围立刻重取 */
const PAD_U = 2
const REFRESH_MS = 300
/** 身体旁的标尺一层一格：格子多大、隔多宽（格） */
const BOX_U = 0.17
const GAP_U = 0.035

function colorOf(layer: number): number {
  return LAYER_COLORS[Math.min(layer, LAYER_COLORS.length - 1)]!
}

/** 开发面板的「显示高度」：地形按挡到第几层上色，身体旁画出它占的层与跨得过的高度，弹体按此刻在哪一层画圈 */
export class HeightOverlay {
  private readonly terrainImg: Phaser.GameObjects.Image
  private readonly marks: Phaser.GameObjects.Graphics
  private tex: Phaser.Textures.CanvasTexture | null = null
  private sampledAt = -Infinity
  private window: Rect = { x: 0, y: 0, w: 0, h: 0 }

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lens: Lens,
  ) {
    this.terrainImg = lens.mainOnly(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(999).setVisible(false))
    this.marks = lens.mainOnly(scene.add.graphics().setDepth(1003))
  }

  hide(): void {
    this.terrainImg.setVisible(false)
    this.marks.setVisible(false)
    this.sampledAt = -Infinity
  }

  draw(sim: Sim, now: number): void {
    const v = this.lens.screen.view()
    const w = this.window
    if (now - this.sampledAt >= REFRESH_MS || v.x < w.x || v.y < w.y || v.x + v.w > w.x + w.w || v.y + v.h > w.y + w.h) {
      this.sampledAt = now
      this.sample(sim, v)
    }
    this.marks.setVisible(true)
    this.drawMarks(sim)
  }

  /** 镜头四周的地形取样画进一张一点一像素的贴图：挡弹体的实心填满，只挡身体的按棋盘格，没有高度的硬边界画灰色斜纹 */
  private sample(sim: Sim, v: Rect): void {
    const pad = PAD_U * UNIT
    const w = v.w + 2 * pad
    const h = v.h + 2 * pad
    let step = STEP_U * UNIT
    while ((w / step) * (h / step) > MAX_SAMPLES) step *= 2
    const i0 = Math.floor((v.x - pad) / step)
    const j0 = Math.floor((v.y - pad) / step)
    const cols = Math.ceil(w / step) + 1
    const rows = Math.ceil(h / step) + 1
    this.window = { x: i0 * step, y: j0 * step, w: cols * step, h: rows * step }
    const tex = this.canvas(cols, rows)
    const ctx = tex.getContext()
    const img = ctx.createImageData(cols, rows)
    const px = img.data
    const basin = sim.hooks.basin(sim)
    const solidAt = sim.hooks.solidAt
    for (let j = 0; j < rows; j++) {
      const gj = j0 + j
      const y = (gj + 0.5) * step
      for (let i = 0; i < cols; i++) {
        const gi = i0 + i
        const x = (gi + 0.5) * step
        const s = solidAt ? solidAt(sim, x, y) : null
        let color: number
        if (s) {
          if (MATERIALS[s.material].pierce === 0 && ((gi + gj) & 1) === 1) continue
          color = s.topM === Infinity ? ENDLESS : colorOf(layersOf(s.topM) - 1)
        } else if (basin && (((gi + gj) % 4) + 4) % 4 === 0 && roomAt(basin, x, y) < 0) color = VOID
        else continue
        const k = (j * cols + i) * 4
        px[k] = (color >> 16) & 255
        px[k + 1] = (color >> 8) & 255
        px[k + 2] = color & 255
        px[k + 3] = Math.round(FILL_ALPHA * 255)
      }
    }
    ctx.putImageData(img, 0, 0)
    tex.refresh()
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST)
    this.terrainImg.setTexture(KEY).setPosition(i0 * step, j0 * step).setScale(step).setVisible(true)
  }

  /** cols × rows 的画布：大小没变就接着用 */
  private canvas(cols: number, rows: number): Phaser.Textures.CanvasTexture {
    const t = this.tex
    if (t && t.width === cols && t.height === rows) return t
    const textures = this.scene.textures
    if (textures.exists(KEY)) textures.remove(KEY)
    const made = textures.createCanvas(KEY, cols, rows)!
    this.tex = made
    return made
  }

  /** 身体旁从地面往上一层一格：占着的层上色、底下空着的只描框，白线以下的高度跨得过；弹体按此刻在哪一层画圈 */
  private drawMarks(sim: Sim): void {
    const g = this.marks
    const world = sim.world
    const box = BOX_U * UNIT
    const pitch = box + GAP_U * UNIT
    const line = 0.02 * UNIT
    g.clear()
    for (const eid of query(world, [Span, Transform, Radius, Alive])) {
      if (!Alive.v[eid] || hasComponent(world, eid, Pickup) || hasComponent(world, eid, Shard)) continue
      const lo = loOf(world, eid)
      const hi = hiOf(world, eid)
      const x = Transform.x[eid]! + Radius.v[eid]! + 0.06 * UNIT
      const foot = Transform.y[eid]! + Radius.v[eid]! * 0.5
      for (let k = 0; k <= hi; k++) {
        const top = foot - (k + 1) * pitch + GAP_U * UNIT
        if (k >= lo) {
          g.fillStyle(colorOf(k), 0.95)
          g.fillRect(x, top, box, box)
        }
        g.lineStyle(line, 0x000000, 0.7)
        g.strokeRect(x, top, box, box)
      }
      const over = foot - overOf(Span.lo[eid]!, Span.hi[eid]!) * pitch + (GAP_U * UNIT) / 2
      g.lineStyle(line * 4, 0x000000, 0.8)
      g.lineBetween(x - 0.07 * UNIT, over, x + box + 0.07 * UNIT, over)
      g.lineStyle(line * 2, 0xffffff, 1)
      g.lineBetween(x - 0.06 * UNIT, over, x + box + 0.06 * UNIT, over)
    }
    for (const eid of query(world, [Projectile, Proj, Transform, VisOff])) {
      g.lineStyle(0.035 * UNIT, colorOf(layerAt(boltZ(eid))), 1)
      g.strokeCircle(Transform.x[eid]! + VisOff.x[eid]!, Transform.y[eid]! + VisOff.y[eid]!, Math.max(0.1 * UNIT, Proj.radius[eid]! + 0.04 * UNIT))
    }
  }
}
