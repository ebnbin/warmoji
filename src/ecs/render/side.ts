import { hasComponent } from 'bitecs'
import { FACTION, Faction, Projectile, RIM, Tint } from '../components'
import type { Rim } from '../components'
import type { EcsWorld } from '../world'

/** 敌我的颜色：我方冷、敌方暖，红绿色弱也分得开；队长另用金色 */
export const SIDE = {
  team: 0x40c4ff,
  lead: 0xffd54f,
  elite: 0xffab00,
  foe: 0xff3d00,
  ink: 0x14171a,
} as const

/** 一种描边：颜色与粗细；粗细按 1280×720 的设计尺寸量，像素，不随单位大小与镜头缩放变 */
export interface RimStyle {
  readonly color: number
  readonly px: number
}

export const RIMS: Readonly<Record<Rim, RimStyle | null>> = {
  [RIM.none]: null,
  [RIM.team]: { color: SIDE.team, px: 2.5 },
  [RIM.elite]: { color: SIDE.elite, px: 2.5 },
  [RIM.item]: { color: SIDE.ink, px: 1.5 },
}

const LEAD_RIM: RimStyle = { color: 0xffffff, px: 3 }
const FOE_SHOT_RIM: RimStyle = { color: SIDE.foe, px: 2 }

/** 实体此刻的描边：弹体按此刻的阵营（反弹会换边），队伍里的队长换成白边 */
export function rimOf(world: EcsWorld, eid: number, leader: number): RimStyle | null {
  if (hasComponent(world, eid, Projectile)) return Faction.v[eid] === FACTION.enemy ? FOE_SHOT_RIM : null
  const rim = Tint.rim[eid] as Rim
  return rim === RIM.team && eid === leader ? LEAD_RIM : RIMS[rim]
}
