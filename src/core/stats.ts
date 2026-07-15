import type { CaptainSpec, CharacterSpec } from './config'
import { COIN, KNOCKBACK, LEVELS, MEMBER, TEAM, UNIT } from './config'
import { aggregateCharacterEffects, aggregateTeamEffects, resolveWeaponSpec } from './items'
import type { ItemId } from './items'
import { levelDamageMul, memberMaxHp } from './levels'
import type { WeaponSpec } from './weapons'

// 角色属性面板的展示模型：把异构的角色/武器参数组织成统一的「属性组」。
// 距离统一换算为「格」（1 格 = 1 单位 = 地图网格边长），时间换算为秒。
// 未来道具系统在此挂修正器：groups 由 spec + 已购道具共同计算。
export interface StatGroup {
  readonly icon: string
  readonly title: string
  readonly lines: readonly string[]
}

export const WEAPON_KIND_LABEL: Record<WeaponSpec['kind'], string> = {
  projectile: '投掷',
  thrust: '突刺',
  sweep: '横扫',
  areaBlast: '轰炸',
  boomerang: '回旋',
  laser: '激光',
  slowAura: '光环',
}

/** px → 格 */
function grid(px: number): string {
  return `${+(px / UNIT).toFixed(1)}格`
}

function sec(ms: number): string {
  return `${+(ms / 1000).toFixed(2)}秒`
}

export function weaponStatLines(w: WeaponSpec): string[] {
  // slowAura 无伤害无冷却，其余 kind 首行统一为 伤害·冷却
  if (w.kind === 'slowAura') {
    return [
      `减速 ${Math.round((1 - w.slowFactor) * 100)}% · 范围 ${grid(w.radius)}`,
      '以队伍中心为圆心持续生效',
    ]
  }
  // 击退展示为大致位移距离（冲量 × 衰减时间常数）
  const base = `伤害 ${w.damage} · 冷却 ${sec(w.cooldownMs)} · 击退 ${grid((w.knockback * KNOCKBACK.tauMs) / 1000)}`
  switch (w.kind) {
    case 'projectile':
      return [base, `弹速 ${grid(w.projectile.speed)}/秒 · 弹体 ${grid(w.projectile.radius * 2)}`]
    case 'thrust':
      return [base, `触及 ${grid(w.reach)} · 判定 ${grid(w.hitRadius)} · 前冲 ${grid(w.lungeDist)}`]
    case 'sweep':
      return [base, `半径 ${grid(w.radius)} · 弧宽 ${Math.round((w.arcRad * 180) / Math.PI)}°`]
    case 'areaBlast':
      return [base, `侦测 ${grid(w.detectRange)} · 爆炸半径 ${grid(w.blastRadius)}`]
    case 'boomerang':
      return [base, `射程 ${grid(w.range)} · 判定 ${grid(w.hitRadius)} · 回收 ${grid(w.returnSpeed)}/秒`]
    case 'laser':
      return [base, `射程 ${grid(w.range)} · 束宽 ${grid(w.beamRadius * 2)} · 贯穿直线全部敌人`]
  }
}

/** 角色面板：数值为 等级 × 道具 修正后的生效值（伤害/冷却在展示层套倍率） */
export function characterStatGroups(
  spec: CharacterSpec,
  items: readonly ItemId[] = [],
  level = 1,
): StatGroup[] {
  const fx = aggregateCharacterEffects(items)
  const dmgMul = fx.damageMul * levelDamageMul(level)
  const baseLines = [
    `生命上限 ${memberMaxHp(level, fx.hpAdd)} · 受击无敌 ${sec(MEMBER.iframesMs + fx.iframesAddMs)}`,
    `复活 ${sec(Math.max(1000, TEAM.reviveMs + fx.reviveAddMs))}`,
  ]
  // 稀有道具带来的触发式属性：有才显示，避免面板常年一排 0
  if (fx.regenPerSec > 0) baseLines.push(`每秒回复 ${fx.regenPerSec} 生命`)
  if (fx.killHeal > 0) baseLines.push(`击杀回复 ${fx.killHeal} 生命`)
  if (fx.thorns > 0) baseLines.push(`敌人接触反伤 ${fx.thorns}`)
  if (fx.critChance > 0) baseLines.push(`暴击率 ${Math.round(fx.critChance * 100)}%（伤害 ×2）`)
  return [
    {
      icon: '❤️',
      title: level > 1 ? `基础（Lv.${level}）` : '基础',
      lines: baseLines,
    },
    ...spec.weapons.map((w) => {
      const resolved = resolveWeaponSpec(w, fx)
      const display =
        resolved.kind === 'slowAura'
          ? resolved
          : {
              ...resolved,
              damage: Math.round(resolved.damage * dmgMul),
              cooldownMs: resolved.cooldownMs * fx.cooldownMul,
              knockback: resolved.knockback * fx.knockbackMul,
            }
      return {
        icon: w.icon,
        title: `${w.name}（${WEAPON_KIND_LABEL[w.kind]}）`,
        lines: weaponStatLines(display),
      }
    }),
  ]
}

/** 队长面板：能力描述 + 团队属性（移速/金币拾取/经验等团队级数值都归队长，含道具修正） */
export function captainStatGroups(spec: CaptainSpec, items: readonly ItemId[] = []): StatGroup[] {
  const fx = aggregateTeamEffects(items)
  const lines = [
    `编制上限 ${spec.teamSize} 人 · 开局等级 ${spec.startLevel}`,
    `移速 ${grid(TEAM.moveSpeed * fx.moveSpeedMul)}/秒 · 金币拾取 ${grid(COIN.magnetRadius * fx.magnetMul)}`,
  ]
  const xpMul = spec.xpGainMul * fx.xpGainMul
  if (xpMul !== 1) lines.push(`经验获取 ×${+xpMul.toFixed(2)}`)
  if (fx.teamDamageMul !== 1) lines.push(`全队伤害 ×${+fx.teamDamageMul.toFixed(2)}`)
  if (fx.doubleCoinChance > 0) lines.push(`双倍金币概率 ${Math.round(fx.doubleCoinChance * 100)}%`)
  if (fx.enemySlowMul < 1) lines.push(`全体敌人减速 ${Math.round((1 - fx.enemySlowMul) * 100)}%`)
  if (fx.waveHealRatio > 0) lines.push(`波末全队回复 ${Math.round(fx.waveHealRatio * 100)}% 生命`)
  if (fx.waveCoins > 0) lines.push(`波末分红 +${fx.waveCoins} 金币`)
  return [
    { icon: '👑', title: '队长能力', lines: [spec.desc] },
    { icon: '👟', title: '团队', lines: [...lines, `角色满级 Lv.${LEVELS.max}（升级/招募各花 1 点）`] },
  ]
}
