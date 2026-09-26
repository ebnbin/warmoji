import { KNOCKBACK } from '../data/abilities'
import { memberMaxHp } from '../data/stats'
import { CHARACTERS, MEMBER, TEAM, loadoutFor, upgradeCardsFor } from '../data/characters'
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
  rush: '冲刺',
  leap: '跳跃',
  taunt: '嘲讽',
  stealth: '隐匿',
  field: '领域',
  deploy: '速建',
  nova: '爆发',
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
      '以自己为圆心持续生效',
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
  if (w.kind === 'rush') {
    return [
      `朝瞄准方向冲刺 ${grid(w.distance)} · 用时 ${sec(w.ms)} · 沿途伤害 ${w.damage}`,
      `撞开 ${grid((w.knockback * KNOCKBACK.tauMs) / 1000)} · 判定 ${grid(w.hitRadius)}`,
    ]
  }
  if (w.kind === 'leap') {
    return [
      `朝瞄准方向跃出 ${grid(w.distance)} · 用时 ${sec(w.ms)} · 落地伤害 ${w.damage}`,
      `落地范围 ${grid(w.radius)} · 击退 ${grid((w.knockback * KNOCKBACK.tauMs) / 1000)}`,
    ]
  }
  if (w.kind === 'taunt') {
    return [`嘲讽范围 ${grid(w.radius)} · 持续 ${sec(w.durationMs)}`, `期间自己受到的伤害 ×${w.damageTakenMul}`]
  }
  if (w.kind === 'stealth') {
    return [`全队隐匿 ${sec(w.durationMs)}，敌人失去目标只会乱走`]
  }
  if (w.kind === 'field') {
    return [
      `领域 ${grid(w.radius)} · 持续 ${sec(w.durationMs)}`,
      `队友每秒回复 ${w.healPerSec} · 敌人每 ${sec(w.poison.tickMs)} 受 ${w.poison.damage} 伤`,
    ]
  }
  if (w.kind === 'deploy') {
    return [
      `一次架起 ${w.count} 座弩塔 · 持续 ${sec(w.lifeMs)}`,
      `塔伤害 ${w.damage} · 射速 ${sec(w.fireIntervalMs)} · 射程 ${grid(w.range)}`,
    ]
  }
  if (w.kind === 'nova') {
    const fx = (w.onHit ?? [])
      .map((e) => (e.kind === 'morph' ? `变羊 ${sec(e.durationMs)}` : e.kind === 'slow' ? `减速 ${Math.round((1 - e.factor) * 100)}% ${sec(e.durationMs)}` : ''))
      .filter((s) => s !== '')
    return [`以自己为中心 ${grid(w.radius)}${w.damage > 0 ? ` · 伤害 ${w.damage}` : ''}`, fx.length > 0 ? fx.join(' · ') : '范围内全体生效']
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
    `极速 ${grid(def.body.thrust / def.body.drag)}/秒 · 质量 ${def.body.mass} · 复活 ${sec(Math.max(1000, TEAM.reviveMs + fx.reviveAddMs))}`,
  ]
  if (fx.regenPerSec > 0) baseLines.push(`每秒回复 ${fx.regenPerSec} 生命`)
  if (fx.killHeal > 0) baseLines.push(`击杀回复 ${fx.killHeal} 生命`)
  if (fx.thorns > 0) baseLines.push(`敌人接触反伤 ${fx.thorns}`)
  if (fx.critChance > 0) baseLines.push(`暴击率 ${Math.round(fx.critChance * 100)}%（伤害 ×2）`)
  const groups: StatGroup[] = [
    { icon: '2764', title: '基础', lines: baseLines },
    {
      icon: def.skill.icon,
      title: `主动技能 · ${def.skill.name}（${ABILITY_KIND_LABEL[def.skill.ability.kind]}）`,
      lines: [def.skill.desc, `冷却 ${sec(def.skill.cdMs)} · 只有队长能放，当队员时冷却照走`, ...abilityStatLines(def.skill.ability)],
    },
  ]
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
    case 'rush':
    case 'leap':
    case 'taunt':
    case 'stealth':
    case 'field':
    case 'deploy':
    case 'nova':
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
