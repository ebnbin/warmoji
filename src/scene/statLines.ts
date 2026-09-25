import { KNOCKBACK } from '../data/abilities'
import { memberMaxHp } from '../data/stats'
import { CHARACTERS, MEMBER, TEAM, loadoutFor, upgradeCardsFor } from '../data/characters'
import type { CaptainDef } from '../types/captains'
import type { CharacterId } from '../types/characters'
import { aggregateCharacterEffects, resolveAbilityDef } from '../data/items'
import { tiersForLevel } from '../data/charLevel'
import { levelStatsFor } from '../data/levels'
import type { ItemId } from '../types/items'
import type { AbilityDef } from '../types/abilityDefs'
import type { StatGroup } from '../types/statLines'

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
  rally: '集结',
  strike: '空袭',
  dance: '跳舞',
  buff: '鼓舞',
  nuke: '天罚',
  timeStop: '时停',
}

function grid(units: number): string {
  return `${+units.toFixed(1)}格`
}

function sec(ms: number): string {
  return `${+(ms / 1000).toFixed(2)}秒`
}

function abilityStatLines(w: AbilityDef): string[] {
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
    let poison = ''
    for (const e of w.onHit ?? []) if (e.kind === 'poison') poison = ` · 毒 ${e.damage}/秒×${sec(e.durationMs)}`
    return [
      `每波 ${w.count} 只 · 每隔 ${sec(w.intervalMs)} 放一波`,
      `撞击 ${w.damage}，蜇中自毁${poison}`,
    ]
  }
  if (w.kind === 'turret') {
    return [
      `弩塔 ${w.maxTurrets} 座 · 每 ${sec(w.placeIntervalMs)} 架设一座`,
      `塔伤害 ${w.damage} · 射速 ${sec(w.fireIntervalMs)} · 射程 ${grid(w.range)}`,
    ]
  }
  if (w.kind === 'rally') {
    return [
      `阵亡队员满血复活 · 存活队员回复 ${Math.round(w.healRatio * 100)}%`,
      `全队无敌 ${sec(w.invulnMs)}`,
    ]
  }
  if (w.kind === 'strike') {
    return [
      `伤害 ${w.damage} · 击退 ${grid((w.knockback * KNOCKBACK.tauMs) / 1000)} · 砸向最近 ${w.targets} 个敌人`,
      w.coinsPerHit ? `每次命中落地掉 ${w.coinsPerHit} 枚金币` : '被砸死的照常掉落',
    ]
  }
  if (w.kind === 'dance') {
    return [`全场敌人（含 Boss）跳舞定身 ${sec(w.durationMs)}`]
  }
  if (w.kind === 'buff') {
    return [`全队伤害 ×${w.damageMul} · 持续 ${sec(w.durationMs)}`]
  }
  if (w.kind === 'nuke') {
    return [
      `基准伤害 ${w.damage} × 当前波次强度`,
      `全场生效 · Boss 承伤 ${Math.round(w.bossRatio * 100)}%`,
    ]
  }
  if (w.kind === 'timeStop') {
    return [`时停领域 ${sec(w.durationMs)}（按世界时长计，静止时同步放慢）`, '静止则全场近乎凝固、移动则时间恢复流动']
  }
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

export function characterStatGroups(
  id: CharacterId,
  items: readonly ItemId[] = [],
  level = 1,
  opts: { path?: boolean } = {},
): StatGroup[] {
  const def = CHARACTERS[id]
  const fx = aggregateCharacterEffects(items, levelStatsFor(id, level))
  const tiers = tiersForLevel(level)
  const loadout = loadoutFor(def, tiers)
  const dmgMul = fx.damageMul
  const cdMul = fx.cooldownMul
  const baseLines = [
    `生命上限 ${memberMaxHp(fx.hpAdd)} · 受击无敌 ${sec(MEMBER.iframesMs + fx.iframesAddMs)}`,
    `复活 ${sec(Math.max(1000, TEAM.reviveMs + fx.reviveAddMs))}`,
  ]
  if (fx.regenPerSec > 0) baseLines.push(`每秒回复 ${fx.regenPerSec} 生命`)
  if (fx.killHeal > 0) baseLines.push(`击杀回复 ${fx.killHeal} 生命`)
  if (fx.thorns > 0) baseLines.push(`敌人接触反伤 ${fx.thorns}`)
  if (fx.critChance > 0) baseLines.push(`暴击率 ${Math.round(fx.critChance * 100)}%（伤害 ×2）`)
  const groups: StatGroup[] = [{ icon: '2764', title: '基础', lines: baseLines }]
  if (opts.path !== false) {
    groups.push({
      icon: '2b50',
      title: `升级路径（当前 ${level} 级 · 角色经验自动解锁）`,
      lines: upgradeCardsFor(def).map((card, i) => {
        const atLevel = i + 2
        const reached = level >= atLevel
        return `Lv${atLevel}「${card.name}」${card.desc}${reached ? ' ✓已获得' : `（Lv${atLevel} 解锁）`}`
      }),
    })
  }
  const tier = tiers.u2 ? 2 : tiers.u1 ? 1 : 0
  for (const [i, carrier] of def.carriers.entries()) {
    const display = displayDef(resolveAbilityDef(loadout[i]!, fx), dmgMul, cdMul, fx.knockbackMul)
    const traits: string[] = []
    for (let k = 0; k < tier; k += 1) {
      const card = carrier.cards[k]
      if (card) traits.push(`「${card.name}」${card.desc}`)
    }
    groups.push({
      icon: carrier.icon,
      title: `${carrier.name}（${ABILITY_KIND_LABEL[display.kind]}）`,
      lines: [...traits, ...abilityStatLines(display)],
    })
  }
  return groups
}

function displayDef(w: AbilityDef, dmgMul: number, cdMul: number, kbMul: number): AbilityDef {
  switch (w.kind) {
    case 'slowAura':
    case 'rally':
    case 'dance':
    case 'buff':
    case 'timeStop':
      return w
    case 'nuke':
      return { ...w, damage: Math.round(w.damage * dmgMul), cooldownMs: w.cooldownMs * cdMul }
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
        intervalMs: w.intervalMs * cdMul,
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

export function captainStatGroups(def: CaptainDef): StatGroup[] {
  const lines = [
    `编制上限 ${def.teamSize} 人 · 每波结束固定招募 1 人` +
      (def.startWave > 1 ? ` · 从第 ${def.startWave} 波开始` : '') +
      (def.startCoins > 0 ? ` · 开局 ${def.startCoins} 金币` : ''),
    `移速 ${grid(def.moveSpeed)}/秒 · 金币拾取 ${grid(def.coinMagnet)}`,
  ]
  if (def.hpMul !== 1) lines.push(`全队生命 ×${+def.hpMul.toFixed(2)}`)
  if (def.reviveMul !== 1) lines.push(`复活时间 ×${+def.reviveMul.toFixed(2)}`)
  if (def.xpGainMul !== 1) lines.push(`经验获取 ×${+def.xpGainMul.toFixed(2)}`)
  return [
    { icon: '1f451', title: '队长能力', lines: [def.desc] },
    {
      icon: '26a1',
      title: `主动技能 · ${def.skill.name}`,
      lines: [
        `${def.skill.desc}（冷却 ${Math.round(def.skill.cdMs / 1000)} 秒，仅 CD 门槛）`,
        ...def.skill.abilities.flatMap((w) => abilityStatLines(w)),
      ],
    },
    { icon: '1f45f', title: '团队', lines: [...lines, '团队增益来自战斗后的经验升级卡（三选一）'] },
  ]
}
