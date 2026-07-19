import { COIN } from '../items/registry'
import { KNOCKBACK } from '../abilities/registry'
import { memberMaxHp } from '../characters/stats'
import { CHARACTERS, MEMBER, TEAM, loadoutFor } from '../characters/registry'
import type { CaptainDef, CharacterId } from '../characters/registry'
import {
  upgradeTiers,
  aggregateCharacterEffects,
  aggregateTeamEffects,
  resolveAbilityDef,
} from '../items/registry'
import type { ItemId } from '../items/registry'
import type { AbilityDef } from '../abilities/defs'

// 角色属性面板的展示模型：把异构的角色/能力参数组织成统一的「属性组」。
// 距离统一换算为「格」（1 格 = 1 单位 = 地图网格边长），时间换算为秒。
// 未来道具系统在此挂修正器：groups 由 def + 已购道具共同计算。
export interface StatGroup {
  readonly icon: string
  readonly title: string
  readonly lines: readonly string[]
}

export const ABILITY_KIND_LABEL: Record<AbilityDef['kind'], string> = {
  projectile: '投掷',
  thrust: '突刺',
  sweep: '横扫',
  areaBlast: '轰炸',
  boomerang: '回旋',
  laser: '激光',
  slowAura: '光环',
  assassinate: '瞬袭',
  turret: '装置',
  summon: '召唤',
  heal: '治疗',
  chainArc: '连锁',
}

/** px → 格 */
function grid(units: number): string {
  return `${+units.toFixed(1)}格`
}

function sec(ms: number): string {
  return `${+(ms / 1000).toFixed(2)}秒`
}

export function abilityStatLines(w: AbilityDef): string[] {
  // slowAura/heal/summon/turret 无常规「伤害·冷却」首行语义，各自定制
  if (w.kind === 'slowAura') {
    return [
      `减速 ${Math.round((1 - w.slowFactor) * 100)}% · 范围 ${grid(w.radius)}`,
      '以队伍中心为圆心持续生效',
    ]
  }
  if (w.kind === 'heal') {
    return [
      `治疗 ${w.amount} · 间隔 ${sec(w.cooldownMs)} · 范围 ${grid(w.range)}`,
      w.aoe ? `范围内全体回复 ${Math.round(w.aoe.ratio * 100)}% 治疗量` : '优先血量比例最低的队友',
    ]
  }
  if (w.kind === 'summon') {
    return [
      `蜂群 ${w.count} 只 · 每击 ${w.damage} 伤害`,
      `蜂速 ${grid(w.minion.speed)}/秒 · 再攻间隔 ${sec(w.hitCooldownMs)}`,
    ]
  }
  if (w.kind === 'turret') {
    return [
      `弩塔 ${w.maxTurrets} 座 · 每 ${sec(w.placeIntervalMs)} 架设一座`,
      `塔伤害 ${w.damage} · 射速 ${sec(w.fireIntervalMs)} · 射程 ${grid(w.range)}`,
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
      return [base, `半径 ${grid(w.radius)} · 弧宽 ${w.arcDeg}°`]
    case 'areaBlast':
      return [base, `侦测 ${grid(w.detectRange)} · 爆炸半径 ${grid(w.blastRadius)}`]
    case 'boomerang':
      return [base, `射程 ${grid(w.range)} · 判定 ${grid(w.hitRadius)} · 回收 ${grid(w.returnSpeed)}/秒`]
    case 'laser':
      return [base, `射程 ${grid(w.range)} · 束宽 ${grid(w.beamRadius * 2)} · 贯穿直线全部敌人`]
    case 'assassinate':
      return [base, `索敌 ${grid(w.range)} · 瞬移背刺血最厚的敌人 · 出手 ${sec(w.strikeMs)} 无敌`]
    case 'chainArc':
      return [base, `首跳 ${grid(w.range)} · 传导 ${grid(w.arcRange)} · 弹跳 ${w.bounces} 次（每跳 ${Math.round(w.decay * 100)}%）`]
  }
}

/** 角色面板：数值为道具修正后的生效值（伤害/冷却在展示层套倍率），
 * 能力行数取「能力注入后」的生效 def（如全周横扫的 360° 弧宽）+ 专属升级组 */
export function characterStatGroups(id: CharacterId, items: readonly ItemId[] = []): StatGroup[] {
  const def = CHARACTERS[id]
  const fx = aggregateCharacterEffects(items)
  const tiers = upgradeTiers(id, items)
  const dmgMul = fx.damageMul
  const cdMul = fx.cooldownMul
  const baseLines = [
    `生命上限 ${memberMaxHp(fx.hpAdd)} · 受击无敌 ${sec(MEMBER.iframesMs + fx.iframesAddMs)}`,
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
      title: '基础',
      lines: baseLines,
    },
    {
      icon: '⭐',
      title: '专属升级（商店专属卡解锁）',
      lines: def.upgrades.map((a, i) => {
        const unlocked = i === 0 ? tiers.u1 : tiers.u2
        return `${a.icon}「${a.name}」${a.desc}${unlocked ? '' : '（未解锁）'}`
      }),
    },
    ...loadoutFor(def, tiers).map((w) => {
      const display = displayDef(resolveAbilityDef(w, fx), dmgMul, cdMul, fx.knockbackMul)
      return {
        icon: w.icon,
        title: `${w.name}（${ABILITY_KIND_LABEL[w.kind]}）`,
        lines: abilityStatLines(display),
      }
    }),
  ]
}

/** 展示用生效值：把伤害/冷却/击退倍率套进各 kind 自己的对应字段 */
function displayDef(w: AbilityDef, dmgMul: number, cdMul: number, kbMul: number): AbilityDef {
  switch (w.kind) {
    case 'slowAura':
      return w
    case 'heal':
      return { ...w, amount: Math.round(w.amount * dmgMul), cooldownMs: w.cooldownMs * cdMul }
    case 'turret':
      return {
        ...w,
        damage: Math.round(w.damage * dmgMul),
        placeIntervalMs: w.placeIntervalMs * cdMul,
        fireIntervalMs: w.fireIntervalMs * cdMul,
        knockback: w.knockback * kbMul,
      }
    case 'summon':
      return {
        ...w,
        damage: Math.round(w.damage * dmgMul),
        hitCooldownMs: w.hitCooldownMs * cdMul,
        knockback: w.knockback * kbMul,
      }
    default:
      return {
        ...w,
        damage: Math.round(w.damage * dmgMul),
        cooldownMs: w.cooldownMs * cdMul,
        knockback: w.knockback * kbMul,
      }
  }
}

/** 队长面板：能力描述 + 团队属性（移速/金币拾取/经验等团队级数值都归队长，含道具修正） */
export function captainStatGroups(def: CaptainDef, items: readonly ItemId[] = []): StatGroup[] {
  const fx = aggregateTeamEffects(items)
  const lines = [
    `编制上限 ${def.teamSize} 人 · 每波结束固定招募 1 人` +
      (def.startWave > 1 ? ` · 从第 ${def.startWave} 波开始` : '') +
      (def.startCoins > 0 ? ` · 开局 ${def.startCoins} 金币` : ''),
    `移速 ${grid(TEAM.moveSpeed * fx.moveSpeedMul)}/秒 · 金币拾取 ${grid(COIN.magnetRadius * fx.magnetMul)}`,
  ]
  const xpMul = def.xpGainMul * fx.xpGainMul
  if (xpMul !== 1) lines.push(`经验获取 ×${+xpMul.toFixed(2)}`)
  if (fx.teamDamageMul !== 1) lines.push(`全队伤害 ×${+fx.teamDamageMul.toFixed(2)}`)
  if (fx.doubleCoinChance > 0) lines.push(`双倍金币概率 ${Math.round(fx.doubleCoinChance * 100)}%`)
  if (fx.enemySlowMul < 1) lines.push(`全体敌人减速 ${Math.round((1 - fx.enemySlowMul) * 100)}%`)
  if (fx.waveHealRatio > 0) lines.push(`波末全队回复 ${Math.round(fx.waveHealRatio * 100)}% 生命`)
  if (fx.waveCoins > 0) lines.push(`波末分红 +${fx.waveCoins} 金币`)
  return [
    { icon: '👑', title: '队长能力', lines: [def.desc] },
    {
      icon: '⚡',
      title: `主动技能 · ${def.skill.name}`,
      lines: [`${def.skill.desc}（冷却 ${Math.round(def.skill.cdMs / 1000)} 秒，跨波累计）`],
    },
    { icon: '👟', title: '团队', lines: [...lines, '经验每升一级 = 1 颗能量豆（技能弹药，上限 3）'] },
  ]
}
