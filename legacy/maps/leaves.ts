import Phaser from 'phaser'
import { AWAY } from '../data/light'
import { UNIT } from '../util/units'
import { drawLeaf, LEAF_COLORS } from './leaf'
import { canvasTexture } from './textures'

/** 第 i 种叶色的枫叶的正面与背面 */
export const leafKey = (i: number, back: boolean): string => `maple-leaf-${i}${back ? '-back' : ''}`
/** 枫叶多大（格）：最小与最大 */
export const LEAF_U = [0.26, 0.36] as const
const LEAF_PX = 64
/** 树上飘落的枫叶：镜头里同时最多几片、多久飘下一片（秒）、落地后多久淡去（秒） */
const FALLING = 26
const FALL_EVERY_S = 0.2
const LANDED_S = 6
/** 飘落的叶子离地每高一米，画面上往上抬多少格、影子往背光的方向挪开多少格 */
const FALL_LIFT_U = 0.32
const FALL_SHADOW_U = 0.35
/** 飘着的叶子离镜头近，离地每高一米画大这么多 */
const NEARER_PER_M = 0.07
/** 落在地上的叶子与地上的影子画在哪一层；飘着的叶子画在树冠之上 */
const LANDED_DEPTH = 1.2
const SHADOW_DEPTH = 1.25
const FALLING_DEPTH = 21
const SHADOW_TINT = 0x2a0e06

/** 按各叶色占的几成挑一种 */
export function pickLeafColor(r: number): number {
  let acc = 0
  for (let i = 0; i < LEAF_COLORS.length; i++) {
    acc += LEAF_COLORS[i]!.weight
    if (r < acc) return i
  }
  return 0
}

/** 枫叶的贴图只画一次，之后每局都用 */
export function ensureLeaves(scene: Phaser.Scene): void {
  LEAF_COLORS.forEach((c, i) => {
    for (const back of [false, true]) if (!scene.textures.exists(leafKey(i, back))) canvasTexture(scene, leafKey(i, back), LEAF_PX, LEAF_PX, (ctx) => drawLeaf(ctx, LEAF_PX, c.rgb, back))
  })
}

/**
 * 树上飘下的一片枫叶：位置（格）、离地多高与往下落多快（米、米/秒）；左右荡的幅度与相位、在画面上转的角度与转速，
 * 绕自己的中脉翻的角度与翻的快慢（翻过去露出背面）；叶色、多大（格）；落地多久了（没落地是负的），地上的影子
 */
export interface Falling {
  x: number
  y: number
  z: number
  vz: number
  sway: number
  phase: number
  rot: number
  spin: number
  flip: number
  flipRate: number
  color: number
  size: number
  landed: number
  readonly img: Phaser.GameObjects.Image
  readonly shadow: Phaser.GameObjects.Image
}

/** 一片叶子从哪飘下来：位置（格）与离地多高（米） */
export interface Shed {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * 树上飘落的枫叶：一边左右荡、一边在画面上打转、一边绕中脉翻跟头（翻过去露出背面、侧着时看着窄），地上的影子离它越来越近；
 * 落在地上的过一阵淡去
 */
export class FallingLeaves {
  private leaves: Falling[] = []
  private at = 0

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * 推进 dt 秒：到时候就问 source 下一片叶子从哪飘下（没有就这次不飘）；叶子落地时先问 land 接不接走它（接走的就此销毁），不接走的落在地上过一阵淡去
   */
  step(dt: number, source: () => Shed | undefined, land?: (p: Falling) => boolean): void {
    this.at -= dt
    if (this.at <= 0 && this.leaves.length < FALLING) {
      this.at = FALL_EVERY_S
      const s = source()
      if (s) this.shed(s)
    }
    this.leaves = this.leaves.filter((p) => {
      if (p.landed < 0) {
        p.phase += dt
        p.z -= p.vz * dt * (0.75 + 0.5 * Math.abs(Math.cos(p.flip)))
        const sx = Math.sin(p.phase * 2.6) * p.sway
        const sy = Math.cos(p.phase * 1.9) * p.sway * 0.6
        p.x += sx * dt
        p.y += sy * dt
        p.rot += (p.spin + sx * 0.8) * dt
        p.flip += p.flipRate * dt
        if (p.z <= 0) {
          p.shadow.destroy()
          if (land?.(p)) {
            p.img.destroy()
            return false
          }
          p.landed = 0
          p.img.setTexture(leafKey(p.color, false)).setDepth(LANDED_DEPTH).setPosition(p.x * UNIT, p.y * UNIT).setDisplaySize(p.size * UNIT, p.size * UNIT)
          return true
        }
        const face = Math.cos(p.flip)
        const wide = 0.18 + 0.82 * Math.abs(face)
        const tex = leafKey(p.color, face < 0)
        if (p.img.texture.key !== tex) p.img.setTexture(tex)
        const near = p.size * (1 + NEARER_PER_M * p.z)
        p.img.setPosition(p.x * UNIT, (p.y - p.z * FALL_LIFT_U) * UNIT).setRotation(p.rot).setDisplaySize(near * UNIT, near * UNIT * wide)
        const off = p.z * FALL_SHADOW_U
        p.shadow
          .setPosition((p.x + AWAY.x * off) * UNIT, (p.y + AWAY.y * off) * UNIT)
          .setRotation(p.rot)
          .setDisplaySize(p.size * UNIT, p.size * UNIT * wide)
          .setAlpha(0.28 * Math.max(0.25, 1 - p.z / 6))
        return true
      }
      p.landed += dt
      p.img.setAlpha(Math.max(0, 1 - Math.max(0, p.landed - LANDED_S * 0.6) / (LANDED_S * 0.4)))
      if (p.landed < LANDED_S) return true
      p.img.destroy()
      return false
    })
  }

  /** 从 s 处飘下一片叶子，地上跟着它的影子 */
  private shed(s: Shed): void {
    const color = pickLeafColor(Math.random())
    const shadow = this.scene.add.image(0, 0, leafKey(color, false)).setDepth(SHADOW_DEPTH).setTint(SHADOW_TINT)
    const img = this.scene.add.image(0, 0, leafKey(color, false)).setDepth(FALLING_DEPTH)
    this.leaves.push({
      x: s.x,
      y: s.y,
      z: s.z,
      vz: 0.8 + Math.random() * 0.5,
      sway: 0.35 + Math.random() * 0.35,
      phase: Math.random() * 10,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() * 2 - 1) * 1.6,
      flip: Math.random() * Math.PI * 2,
      flipRate: (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 2.4),
      color,
      size: LEAF_U[0] + (LEAF_U[1] - LEAF_U[0]) * Math.random(),
      landed: -1,
      img,
      shadow,
    })
  }

  destroy(): void {
    for (const p of this.leaves) {
      p.img.destroy()
      p.shadow.destroy()
    }
    this.leaves = []
  }
}
