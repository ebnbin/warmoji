import { KNOCKBACK_TAU_MS } from '../data/abilities'
import { memberMaxHp } from '../data/stats'
import { CHARACTERS, MEMBER, TEAM, loadoutFor, upgradeCardsFor } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { aggregateCharacterEffects, resolveAbilityDef } from '../data/items'
import { tiersForLevel } from '../data/charLevel'
import { levelStatsFor } from '../data/levels'
import type { ItemId } from '../types/items'
import type { AbilityDef, Effect, Shape, ShapeKind } from '../types/abilityDefs'
import type { StatGroup } from '../types/statLines'

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  bolt: '投掷',
  segment: '突刺',
  sector: '横扫',
  disc: '爆发',
  chain: '连锁',
  flyer: '回旋',
  drop: '空袭',
  blink: '瞬袭',
  sprint: '冲刺',
  leap: '跳跃',
  all: '全场',
  zone: '领域',
  summon: '召唤',
  emplace: '装置',
  world: '时停',
}

export function abilityLabel(w: AbilityDef): string {
  const s = w.shape
  if (s.kind === 'segment' && s.beam) return '激光'
  if (s.kind === 'disc') return s.at === 'target' ? '轰炸' : s.of === 'hurt' ? '治疗' : '爆发'
  if (s.kind === 'zone' && s.follow) return '光环'
  return SHAPE_LABEL[s.kind]
}

function grid(units: number): string {
  return `${+units.toFixed(1)}格`
}

function sec(ms: number): string {
  return `${+(ms / 1000).toFixed(2)}秒`
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function kbGrid(kb: number): string {
  return grid((kb * KNOCKBACK_TAU_MS) / 1000)
}

export function effectLine(e: Effect): string {
  switch (e.kind) {
    case 'blast':
      return `命中处爆开 ${grid(e.radius)}，波及 ${pct(e.ratio)} 伤害`
    case 'slow':
      return e.factor === 0 ? `冻结 ${sec(e.durationMs)}` : `减速 ${pct(1 - e.factor)} ${sec(e.durationMs)}`
    case 'poison':
      return `中毒 ${e.damage}/${sec(e.tickMs)}×${sec(e.durationMs)}`
    case 'ground':
      return `留下 ${grid(e.def.radius)} 的灼地 ${sec(e.def.durationMs)}，每 ${sec(e.def.tickMs)} ${e.def.damage} 伤`
    case 'morph':
      return `变羊 ${sec(e.durationMs)}${e.vulnMul ? `，受伤 ×${e.vulnMul}` : ''}`
    case 'spawnProjectile':
      return `射出一发 ${e.damage} 伤的冷枪`
    case 'heal':
      return `${e.scope === 'lowest' ? '治疗血量比例最低的同伴' : '治疗全体同伴'} ${e.amount}${e.ratio && e.ratio !== 1 ? ` 的 ${pct(e.ratio)}` : ''}`
    case 'attackSlow':
      return `攻击冷却 ×${e.mul} 持续 ${sec(e.durationMs)}`
    case 'buff':
      return `伤害 ×${e.damageMul} 持续 ${sec(e.durationMs)}`
    case 'stun':
      return `定身 ${sec(e.durationMs)}`
    case 'hide':
      return `隐匿 ${sec(e.durationMs)}，敌人失去目标只会乱走`
    case 'taunt':
      return `嘲讽 ${sec(e.durationMs)}，只追施法者`
    case 'guard':
      return `受到的伤害 ×${e.mul} 持续 ${sec(e.durationMs)}`
    case 'revive':
      return '阵亡者满血复活'
    case 'healRatio':
      return `回复 ${pct(e.ratio)} 生命上限`
    case 'invuln':
      return `无敌 ${sec(e.ms)}`
    case 'reviveCut':
      return `阵亡同伴的复活倒计时减 ${sec(e.ms)}`
    case 'timeStop':
      return `时停 ${sec(e.durationMs)}（按世界时长计，静止时同步放慢）`
    case 'vanish':
      return '自身消散'
    case 'coins':
      return `每次命中掉 ${e.count} 枚金币`
  }
}

function shapeLine(w: AbilityDef, s: Shape): string {
  switch (s.kind) {
    case 'bolt':
      return `弹速 ${grid(s.projectile.speed)}/秒 · 弹体 ${grid(s.projectile.radius * 2)}${s.pierce ? ` · 贯穿 ${s.pierce} 名` : ''}`
    case 'segment':
      return s.beam
        ? `射程 ${grid(s.reach)} · 束宽 ${grid(s.radius * 2)} · 贯穿直线全部敌人`
        : `触及 ${grid(s.reach)} · 判定 ${grid(s.radius)}${s.lungeDist ? ` · 前冲 ${grid(s.lungeDist)}` : ''}`
    case 'sector':
      return `半径 ${grid(s.radius)} · 弧宽 ${s.arcDeg}°`
    case 'disc':
      return s.at === 'target'
        ? `侦测 ${grid(w.range ?? 0)} · 爆炸半径 ${grid(s.radius)}`
        : `以自己为中心 ${grid(s.radius)}${s.of === 'hurt' ? ' · 只对受伤的同伴' : ''}`
    case 'chain':
      return `首跳 ${grid(w.range ?? 0)} · 传导 ${grid(s.hopRange)} · 弹跳 ${s.hops} 次（每跳 ${pct(s.decay)}）`
    case 'flyer':
      return `射程 ${grid(s.range)} · 判定 ${grid(s.radius)} · 回收 ${grid(s.returnSpeed)}/秒${s.coinMagnetRadius ? ' · 沿途吸取金币' : ''}`
    case 'drop':
      return `砸向最近 ${s.targets} 个目标`
    case 'blink':
      return `索敌 ${grid(w.range ?? 0)} · 瞬移背刺血最厚的敌人 · 出手 ${sec(s.strikeMs)} 无敌${s.execute ? ` · 目标血量低于 ${pct(s.execute.hpRatio)} 时伤害 ×${s.execute.mul}` : ''}`
    case 'sprint':
      return `朝瞄准方向冲刺 ${grid(s.distance)} · 用时 ${sec(s.ms)}${s.radius ? ` · 判定 ${grid(s.radius)}` : ''}`
    case 'leap':
      return `朝瞄准方向跃出 ${grid(s.distance)} · 用时 ${sec(s.ms)} · 落地范围 ${grid(s.radius)}`
    case 'all':
      return s.of === 'foes' ? '全场敌人（含 Boss）' : '全队'
    case 'zone':
      return `${s.follow ? '以自己为圆心持续生效' : `领域 ${grid(s.radius)} · 持续 ${sec(s.durationMs)}`}${s.tickMs && w.damage ? ` · 每 ${sec(s.tickMs)} ${w.damage} 伤` : ''}${s.mend ? ` · 队友每秒回复 ${s.mend}` : ''}${s.pulse ? ` · 每 ${sec(s.pulse.intervalMs)} 脉冲一次：${s.pulse.onHit.map(effectLine).join('，')}` : ''}${s.follow ? '' : ''}`
    case 'summon':
      return `每波 ${s.count} 只 · 撞击后自毁 · 存活 ${sec(s.lifeMs)}`
    case 'emplace':
      return `${s.count > 1 ? `一次架起 ${s.count} 座` : `同时最多 ${s.maxAlive} 座`}${s.lifeMs ? ` · 持续 ${sec(s.lifeMs)}` : ''} · 塔伤害 ${s.ability.damage ?? 0} · 射速 ${sec(s.ability.trigger === 'auto' ? s.ability.cooldownMs : 0)} · 射程 ${grid(s.ability.range ?? 0)}`
    case 'world':
      return '静止则全场近乎凝固、移动则时间恢复流动'
  }
}

function repeatLine(w: AbilityDef): string | null {
  const r = w.repeat
  if (!r) return null
  const ring = (r.spreadDeg ?? 0) >= 360
  const when = r.everyN ? `每第 ${r.everyN} 次出手` : ''
  const how = r.delayMs
    ? `${r.reaim === 'nearest' ? '重新索敌' : r.reaim === 'random' ? '随机敌人' : ring ? '绕身一周' : '同一方向'}追加 ${r.count - 1} 发，间隔 ${sec(r.delayMs)}`
    : ring
      ? `${r.count} 发环形散开`
      : `${r.count} 发扇形散开 ${r.spreadDeg ?? 0}°`
  return `${when}${how}${r.ratio && r.ratio !== 1 ? `，每发 ${pct(r.ratio)} 伤害` : ''}`
}

function abilityStatLines(w: AbilityDef): string[] {
  const base: string[] = []
  if (w.damage) base.push(`伤害 ${w.damage}${w.waveScale ? ' × 当前波次强度' : ''}`)
  if (w.trigger === 'auto' && w.cooldownMs > 0) base.push(`冷却 ${sec(w.cooldownMs)}`)
  if (w.knockback) base.push(`击退 ${kbGrid(w.knockback)}`)
  if (w.bossRatio !== undefined) base.push(`Boss 承伤 ${pct(w.bossRatio)}`)
  const lines: string[] = []
  if (base.length > 0) lines.push(base.join(' · '))
  lines.push(shapeLine(w, w.shape))
  const rep = repeatLine(w)
  if (rep) lines.push(rep)
  const fx = [...(w.onHit ?? []).map(effectLine), ...(w.onSelf ?? []).map((e) => `自身：${effectLine(e)}`)]
  if (fx.length > 0) lines.push(fx.join(' · '))
  return lines
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
      title: `主动技能 · ${def.skill.name}（${abilityLabel(def.skill.ability)}）`,
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
    const display = displayDef(resolveAbilityDef(loadout[i]!, fx), fx.damageMul, fx.cooldownMul, fx.knockbackMul)
    const traits: string[] = []
    for (let k = 0; k < tier; k += 1) {
      const card = carrier.cards[k]
      if (card) traits.push(`「${card.name}」${card.desc}`)
    }
    groups.push({
      icon: carrier.icon,
      title: `${carrier.name}（${abilityLabel(display)}）`,
      lines: [...traits, ...abilityStatLines(display)],
    })
  }
  return groups
}

/** 图鉴显示时把运行时倍率折进数值 */
function displayDef(w: AbilityDef, dmgMul: number, cdMul: number, kbMul: number): AbilityDef {
  const scaled = {
    ...w,
    ...(w.damage === undefined ? {} : { damage: Math.round(w.damage * dmgMul) }),
    ...(w.knockback === undefined ? {} : { knockback: w.knockback * kbMul }),
  }
  return scaled.trigger === 'auto' ? { ...scaled, cooldownMs: scaled.cooldownMs * cdMul } : scaled
}
