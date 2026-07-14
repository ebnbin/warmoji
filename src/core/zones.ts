// 经验领域（图腾）：升级瞬间在队伍中心种下图腾，周围一圈地面成为增益领域，
// 持续到本波结束（与「未拾取金币波末消失」同一条世界规则）。
// 类型按等级固定轮换，HUD 预告下一座——玩家可据此规划种在哪。
// 同类型领域不叠加；队员增益离域后有短暂余温（见 config.ZONES.lingerMs）。

export type ZoneKind = 'war' | 'heal' | 'chill'

export interface ZoneSpec {
  readonly emoji: string
  readonly name: string
  /** 圈内效果的一句话说明（预留给帮助/图鉴） */
  readonly desc: string
  readonly color: number
}

export const ZONE_SPECS: Record<ZoneKind, ZoneSpec> = {
  war: { emoji: '⚔️', name: '战意', desc: '圈内队员攻速提升', color: 0xff7043 },
  heal: { emoji: '💚', name: '治愈', desc: '圈内队员持续回血', color: 0x66bb6a },
  chill: { emoji: '❄️', name: '迟滞', desc: '圈内敌人减速', color: 0x4fc3f7 },
}

export const ZONE_ROTATION: readonly ZoneKind[] = ['war', 'heal', 'chill']

/** 升到 level 时种下的类型（首次升级 = 2 级 = 战意，之后依序轮换） */
export function zoneKindForLevel(level: number): ZoneKind {
  const i = (((level - 2) % ZONE_ROTATION.length) + ZONE_ROTATION.length) % ZONE_ROTATION.length
  return ZONE_ROTATION[i]!
}

/** 当前 level 下，下一次升级会种什么（HUD 预告用） */
export function nextZoneKind(level: number): ZoneKind {
  return zoneKindForLevel(level + 1)
}

export function inZone(zoneX: number, zoneY: number, radius: number, x: number, y: number): boolean {
  const dx = x - zoneX
  const dy = y - zoneY
  return dx * dx + dy * dy <= radius * radius
}
