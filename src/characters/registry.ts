import { hydrate } from '../lib/hydrate'
import { UNIT } from '../lib/units'
import { WEAPONS } from '../weapons/registry'
import type { WeaponId } from '../weapons/registry'
import type { WeaponSpec } from '../weapons/spec'
import captainsJson from './captains.json'
import charactersJson from './characters.json'

// 花名册数据在 characters.json / captains.json；角色 → 武器按 ID 引用
//（加载时解析成 spec 引用；未知 ID 直接抛错，配错在启动/单测即死）。
// 角色 → 武器为单向绑定：角色配装固定，武器可被复用。

export interface CharacterSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly weapons: readonly WeaponSpec[]
  /** 环形阵移动秉性：>0 沿环迎敌滑动，<0 避敌滑动，0 安分（被推才动）；见 battle/orbit.ts */
  readonly orbit: number
}

export type CharacterId = keyof typeof charactersJson

function resolveWeapon(id: string): WeaponSpec {
  const spec = WEAPONS[id as WeaponId]
  if (!spec) throw new Error(`未知武器 ID: ${id}`)
  return spec
}

export const CHARACTERS: Record<CharacterId, CharacterSpec> = Object.fromEntries(
  Object.entries(hydrate<Record<string, Omit<CharacterSpec, 'weapons'> & { weapons: string[] }>>(charactersJson)).map(
    ([id, row]) => [id, { ...row, weapons: row.weapons.map(resolveWeapon) }],
  ),
) as unknown as Record<CharacterId, CharacterSpec>

export const ROSTER_IDS = Object.keys(CHARACTERS) as readonly CharacterId[]

// 队长主动技能：每位队长一个，跨波 CD——剩余冷却存在 run 上、只按战斗
// 时钟推进（商店/整编不走表），上一波攒的进度带进下一波。左下角按钮或
// E 键释放；效果逻辑按队长 id 在 battle/skills.ts 分派，效果参数在
// characters/skill.ts 的 SKILL 常量（与「能力先直接建模为字段」同一约定）
export interface CaptainSkill {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
}

// 队长：不登场、无实体的团队增益提供者（emotion 表情形象）。
// 能力先直接建模为字段，需要通用效果系统时再抽象；编制上限/经验相关能力由队长决定。
export interface CaptainSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 主动技能（战斗内左下角按钮释放） */
  readonly skill: CaptainSkill
  /** 编制上限：可招募的角色总数 */
  readonly teamSize: number
  /** 开局波次（通常 1）；>1 时跳过之前的波次，难度时钟按被跳过的
   * 波次时长预推进——敌人配比与强度都是该波的真实水平，且能量豆拉满；
   * 阵容仍从零起步，由玩家在整编页逐个自选招满（run/state.ts beginRun） */
  readonly startWave: number
  /** 开局金币 */
  readonly startCoins: number
  /** 全队经验获取倍率 */
  readonly xpGainMul: number
  /** 每次进商店全员复活并恢复满血（默认规则：存活者血量保留、阵亡者 30% 血复活） */
  readonly reviveInShop: boolean
  /** 每次进商店的免费道具刷新次数 */
  readonly freeRefreshes: number
  /** 开局整编结束后是否先进商店再开战（自带开局金币的队长用） */
  readonly firstWaveShop: boolean
}

export type CaptainId = keyof typeof captainsJson

export const CAPTAINS = hydrate<Record<CaptainId, CaptainSpec>>(captainsJson)

export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]

// 队伍：玩家操控队伍中心点，角色按队形岗位随行；除此之外角色是完全独立的单位。
// 队形几何在 battle/formation.ts；满员后可在整编页切换队形与互换站位。
export const TEAM = {
  ringRadius: 0.8 * UNIT,
  /** 3 人环收紧的小半径（人少时更像一个整体）；≥4 人用 ringRadius */
  smallRingRadius: 0.58 * UNIT,
  /** 2 人阵的左右圆心距（紧凑贴身，允许轻微视觉重叠）；1~2 人不环绕 */
  pairGap: 1.1 * UNIT,
  moveSpeed: 5.5 * UNIT,
  reviveMs: 10_000,
  /** N 保 1 中心的受击判定半径系数：被保护的实际收益（碰撞圆减半更难被摸到） */
  guardCenterHurtboxMul: 0.5,
} as const

export const MEMBER = {
  size: 1.2 * UNIT,
  radius: 0.45 * UNIT,
  maxHp: 100,
  // 波次制要求整波存活，受击间隔放宽让「蹭到怪」是磨损而非速死
  iframesMs: 700,
} as const
