import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { FACTION, Faction, Projectile } from '../components'
import type { EcsWorld } from '../world'

/** 画面上各方的颜色：我方的圈黄、精英与头目的圈红、打得到队伍的弹体描红橙边，其余描黑 */
export const SIDE = {
  team: 0xffd54f,
  strong: 0xe53935,
  foe: 0xff3d00,
  ink: 0x14171a,
} as const

/** 一种描边：颜色与粗细；粗细按 1280×720 的设计尺寸量，像素，不随单位大小与镜头缩放变 */
export interface RimStyle {
  readonly color: number
  readonly px: number
}

/** 黑边：画出来的东西除了布景和打得到队伍的弹体，都描它 */
export const INK_RIM: RimStyle = { color: SIDE.ink, px: 2 }

/** 弹体画成什么样：大小与透明度的倍率、至少画多大（像素）、描边、垫在下面的光晕（size 是相对弹体的倍率） */
export interface ShotLook {
  readonly size: number
  readonly min: number
  readonly alpha: number
  readonly rim: RimStyle | null
  readonly glow: { readonly color: number; readonly size: number; readonly alpha: number } | null
}

/** 打得到队伍的要躲：放大一点、不小于这么大、描红边、垫一团橙红的光晕 */
const FOE_SHOT: ShotLook = { size: 1.1, min: 0.45 * UNIT, alpha: 1, rim: { color: SIDE.foe, px: 2 }, glow: { color: 0xff6e40, size: 2, alpha: 0.7 } }
/** 队伍自己的不用看：缩小、变淡、描黑边 */
const TEAM_SHOT: ShotLook = { size: 0.85, min: 0, alpha: 0.55, rim: INK_RIM, glow: null }

/** 弹体按此刻的阵营画（反弹会换边）；不是弹体的是 null */
export function shotOf(world: EcsWorld, eid: number): ShotLook | null {
  if (!hasComponent(world, eid, Projectile)) return null
  return Faction.v[eid] === FACTION.team ? TEAM_SHOT : FOE_SHOT
}
