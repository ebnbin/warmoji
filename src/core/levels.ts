import type { CharacterId } from './config'
import { LEVELS, MEMBER } from './config'

// 角色等级（普通模式 1..LEVELS.max=6；无尽模式后续放开 7+，只涨无上限数值）：
//   1 级 拥有 · 2 级 维度A · 3 级 能力① · 4 级 维度B · 5 级 双维齐升 · 6 级 能力②
// 维度按角色差异化（伤害/攻速/生命/范围），数值升级与能力升级（core/abilities.ts）
// 泾渭分明：3/6 级不带任何数值成长。

/** 一次维度升级的效果（乘法轴；hpMul 作用于基础生命） */
export interface LevelDim {
  /** 整编页/面板的展示文案，如「伤害 +25%」 */
  readonly label: string
  readonly damageMul?: number
  readonly cooldownMul?: number
  readonly rangeMul?: number
  readonly hpMul?: number
}

/** 每个角色的两条成长轴：A 走 2/5 级，B 走 4/5 级 */
export const LEVEL_DIMS: Record<CharacterId, { readonly a: LevelDim; readonly b: LevelDim }> = {
  juggler: {
    a: { label: '攻速 +19%', cooldownMul: 0.84 },
    b: { label: '伤害 +25%', damageMul: 1.25 },
  },
  unicorn: {
    a: { label: '伤害 +25%', damageMul: 1.25 },
    b: { label: '触及 +18%', rangeMul: 1.18 },
  },
  troll: {
    a: { label: '伤害 +30%', damageMul: 1.3 },
    b: { label: '生命 +25%', hpMul: 1.25 },
  },
  cowboy: {
    a: { label: '攻速 +18%', cooldownMul: 0.85 },
    b: { label: '伤害 +22%', damageMul: 1.22 },
  },
  mage: {
    a: { label: '轰炸范围 +20%', rangeMul: 1.2 },
    b: { label: '伤害 +25%', damageMul: 1.25 },
  },
  kangaroo: {
    a: { label: '伤害 +22%', damageMul: 1.22 },
    b: { label: '射程 +18%', rangeMul: 1.18 },
  },
  robot: {
    a: { label: '攻速 +18%', cooldownMul: 0.85 },
    b: { label: '射程 +20%', rangeMul: 1.2 },
  },
  snowman: {
    a: { label: '光环范围 +22%', rangeMul: 1.22 },
    b: { label: '生命 +30%', hpMul: 1.3 },
  },
} as const

/** 等级累计的维度效果（各轴叠乘） */
export interface LevelEffects {
  damageMul: number
  cooldownMul: number
  rangeMul: number
  hpMul: number
}

/** 各维度在该等级的已获得次数：A 在 2/5 级、B 在 4/5 级 */
export function dimBumps(level: number): { a: number; b: number } {
  return {
    a: (level >= 2 ? 1 : 0) + (level >= 5 ? 1 : 0),
    b: (level >= 4 ? 1 : 0) + (level >= 5 ? 1 : 0),
  }
}

export function levelEffects(id: CharacterId, level: number): LevelEffects {
  const fx: LevelEffects = { damageMul: 1, cooldownMul: 1, rangeMul: 1, hpMul: 1 }
  const dims = LEVEL_DIMS[id]
  const bumps = dimBumps(level)
  const apply = (dim: LevelDim, times: number): void => {
    for (let i = 0; i < times; i++) {
      fx.damageMul *= dim.damageMul ?? 1
      fx.cooldownMul *= dim.cooldownMul ?? 1
      fx.rangeMul *= dim.rangeMul ?? 1
      fx.hpMul *= dim.hpMul ?? 1
    }
  }
  apply(dims.a, bumps.a)
  apply(dims.b, bumps.b)
  return fx
}

/** 角色生效生命上限 = 基础 × 等级维度 hpMul + 道具加成（下限保护） */
export function memberMaxHp(id: CharacterId, level: number, itemHpAdd: number): number {
  return Math.max(10, Math.round(MEMBER.maxHp * levelEffects(id, level).hpMul) + itemHpAdd)
}

/** 下一级的升级类型：数值（2/4/5）或能力（3/6）；已满级返回 null */
export function nextLevelKind(level: number): 'stats' | 'ability' | null {
  const next = level + 1
  if (next > LEVELS.max) return null
  return next === 3 || next === 6 ? 'ability' : 'stats'
}

/** 数值级的升级文案：2 级 → A，4 级 → B，5 级 → A+B */
export function statUpgradeLabel(id: CharacterId, nextLevel: number): string {
  const dims = LEVEL_DIMS[id]
  if (nextLevel === 2) return dims.a.label
  if (nextLevel === 4) return dims.b.label
  if (nextLevel === 5) return `${dims.a.label} · ${dims.b.label}`
  return ''
}
