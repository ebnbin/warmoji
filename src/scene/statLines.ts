import { KNOCKBACK_TAU_MS } from '../data/abilities'
import { memberMaxHp } from '../data/stats'
import { CHARACTERS, MEMBER, TEAM, loadoutFor, upgradeCardsFor } from '../data/characters'
import { ENEMIES } from '../data/enemies'
import type { ResourceDef } from '../types/enemies'
import type { CharacterId } from '../types/characters'
import { aggregateCharacterEffects, resolveAbilityDef } from '../data/items'
import { tiersForLevel } from '../data/charLevel'
import { levelStatsFor } from '../data/levels'
import type { ItemId } from '../types/items'
import type { AbilityDef, Cond, Effect, MarkName, Shape, ShapeKind } from '../types/abilityDefs'
import type { ZoneRules } from '../types/groundEffects'
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
  world: '施放',
}

export function abilityLabel(w: AbilityDef): string {
  const s = w.shape
  if (s.kind === 'segment' && s.beam) return '激光'
  if (s.kind === 'disc') return s.at === 'target' ? '轰炸' : s.of === 'hurt' ? '治疗' : '爆发'
  if (s.kind === 'zone' && s.follow) return '光环'
  if (s.kind === 'world' && w.onHit?.some((e) => e.kind === 'timeStop')) return '时停'
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

/** 接在中文后面：以数字开头时隔一个空格 */
function lead(head: string, body: string): string {
  return head && /^\d/.test(body) ? `${head} ${body}` : head + body
}

function joinFx(effects: readonly Effect[], self = false): string {
  return effects.map((e) => effectLine(e, self)).join('、')
}

/** self：这组效果施于出手者自己 */
export function effectLine(e: Effect, self = false): string {
  switch (e.kind) {
    case 'blast':
      return `命中处爆开 ${grid(e.radius)}，波及 ${pct(e.ratio)} 伤害`
    case 'slow':
      return e.factor === 0 ? `冻结 ${sec(e.durationMs)}` : `减速 ${pct(1 - e.factor)} ${sec(e.durationMs)}`
    case 'poison':
      return `中毒 ${e.damage}/${sec(e.tickMs)}×${sec(e.durationMs)}`
    case 'ground':
      return `留下 ${grid(e.def.radius)} 的${e.def.trap ? '陷阱' : '场地'} ${sec(e.def.durationMs)}${e.def.damage && e.def.tickMs ? `，每 ${sec(e.def.tickMs)} ${e.def.damage} 伤` : ''}${e.def.effects && !e.def.trap ? `，每 ${sec(e.def.tickMs)} ${joinFx(e.def.effects)}` : ''}${zoneRuleLine(e.def, e.def.effects, e.def.damage)}`
    case 'morph':
      return `变羊 ${sec(e.durationMs)}${e.vulnMul ? `，受伤 ×${e.vulnMul}` : ''}`
    case 'spawnProjectile':
      return `射出一发 ${e.damage} 伤的冷枪`
    case 'heal':
      return `${e.scope === 'lowest' ? '治疗血量比例最低的同伴' : e.scope === 'all' ? '治疗全体同伴' : '回复'} ${e.amount}${e.ratio && e.ratio !== 1 ? ` 的 ${pct(e.ratio)}` : ''}`
    case 'attackSlow':
      return `攻击冷却 ×${e.mul} 持续 ${sec(e.durationMs)}`
    case 'buff': {
      const parts = [e.damageMul !== undefined ? `伤害 ×${e.damageMul}` : '', e.speedMul !== undefined ? `移速 ×${e.speedMul}` : ''].filter(Boolean)
      return `${parts.join('、')}${e.durationMs === undefined ? '，永久' : ` 持续 ${sec(e.durationMs)}`}`
    }
    case 'damage':
      return e.ratio === undefined ? `造成 ${e.amount} 点伤害` : `造成${e.amount ? ` ${e.amount} +` : ''} ${pct(e.ratio)} 基础伤害`
    case 'stun':
      return `眩晕 ${sec(e.durationMs)}`
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
    case 'root':
      return `定身 ${sec(e.durationMs)}（不能走，能出手）`
    case 'silence':
      return `沉默 ${sec(e.durationMs)}（放不了技能）`
    case 'disarm':
      return `致盲 ${sec(e.durationMs)}（普通出手与接触都打不出去）`
    case 'grounded':
      return `禁锢 ${sec(e.durationMs)}（不能冲刺、跳跃、闪现）`
    case 'sleep':
      return `催眠 ${sec(e.durationMs)}，挨打即醒，醒来那一下伤害 ×${e.wakeMul}`
    case 'fear':
      return `恐惧 ${sec(e.durationMs)}（背离施加者逃跑）`
    case 'charm':
      return `魅惑 ${sec(e.durationMs)}（朝施加者走来）`
    case 'berserk':
      return `倒戈 ${sec(e.durationMs)}（攻击自己人）`
    case 'stasis':
      return `静止 ${sec(e.durationMs)}（无敌、不可选中、不能行动）`
    case 'untargetable':
      return `不可选中 ${sec(e.durationMs)}`
    case 'unstoppable':
      return `霸体 ${sec(e.durationMs)}（解除并免疫控制与被摆布）`
    case 'cleanse':
      return '解除控制与减速'
    case 'spellShield':
      return `法术护盾：挡下接下来 ${e.count} 次命中，持续 ${sec(e.durationMs)}`
    case 'frontGuard':
      return `正面格挡 ${sec(e.durationMs)}：挡下前方 ${e.arcDeg}° 内来的命中`
    case 'reveal':
      return `揭示 ${sec(e.durationMs)}（隐匿失效）`
    case 'stealth':
      return `潜行${e.durationMs === undefined ? '' : ` ${sec(e.durationMs)}`}，出手即现形`
    case 'undying':
      return `不死 ${sec(e.durationMs)}（生命不低于 1）`
    case 'parry':
      return `招架 ${sec(e.durationMs)}：挡下所有命中，对出手者 ${joinFx(e.then)}`
    case 'pull':
      return `拉到身前${e.heavy === 'self' ? '，拉不动时把自己拽过去' : ''}`
    case 'knockup':
      return `击飞 ${sec(e.durationMs)}${e.onLand ? lead('，落地时', joinFx(e.onLand)) : ''}`
    case 'shove':
      return `推出 ${grid(e.distance)}${e.onWall ? lead('，撞墙时', joinFx(e.onWall)) : ''}`
    case 'throw':
      return `摔向${e.to === 'foe' ? '最近的另一个敌人' : '身后'}${e.onLand ? lead('，落地时', joinFx(e.onLand)) : ''}`
    case 'swap':
      return '与目标互换位置'
    case 'if':
      return `若${self ? '自己' : '目标'}${condLine(e.when)}：${joinFx(e.then, self)}${e.else ? lead('；否则', joinFx(e.else, self)) : ''}`
    case 'stack':
      return `叠一层（${sec(e.durationMs)} 内同一目标叠满 ${e.max} 层：${joinFx(e.then)}）`
    case 'detonate':
      return `立刻引爆自己留下的${e.mark === 'fuse' ? '引信' : '存伤'}`
    case 'fuse':
      return `挂上引信，${lead(`${sec(e.ms)} 后`, joinFx(e.then))}${e.jump ? '；目标先死则跳到最近的敌人' : ''}`
    case 'store':
      return `${sec(e.ms)} 内记下受到的伤害，到时以其 ${pct(e.ratio)} 为基础：${joinFx(e.then)}`
    case 'deathMark':
      return `${sec(e.ms)} 内目标死亡则：${joinFx(e.then)}`
    case 'refresh': {
      const what = e.what === 'this' ? '这条能力' : e.what === 'skill' ? '主动技能' : '全部能力'
      return `${e.who === 'team' ? '全队' : ''}${what}冷却${e.ms === undefined ? '转好（充能的补一次）' : `减 ${sec(e.ms)}`}`
    }
    case 'gain':
      return `资源 ${e.amount >= 0 ? '+' : ''}${e.amount}`
    case 'empower':
      return `接下来 ${e.hits} 次普通出手附带：${joinFx(e.then)}`
    case 'caster':
      return `自身：${joinFx(e.then, true)}`
    case 'area':
      return `${grid(e.radius)} 内：${joinFx(e.then)}`
    case 'form':
      return `${e.to < 0 ? '变回本体' : '变身'}${e.ms === undefined ? '' : ` ${sec(e.ms)}`}${e.onEnd ? lead('，结束时', joinFx(e.onEnd)) : ''}`
    case 'grow':
      return `体型 ×${e.mul}${e.ms === undefined ? `（叠加且不消退${e.max ? `，最多 ×${e.max}` : ''}）` : ` ${sec(e.ms)}`}，受击与接触范围随之变化`
    case 'rewind':
      return `回到 ${sec(e.ms)} 前的位置，生命取那时与现在的较高者`
    case 'steal':
      return `夺取目标的${e.skill ? '主动技能' : '一项能力'}，自己用 ${sec(e.ms)}（每 ${sec(e.cooldownMs)} 一次）${e.skill ? '；原主的冷却重新走，夺取者死了原主立刻转好' : ''}`
    case 'clone':
      return `造出 ${e.count} 个分身 ${sec(e.lifeMs)}：${pct(e.hpRatio)} 生命、${pct(e.dmgRatio)} 伤害${e.onDeath ? lead('，分身死时', joinFx(e.onDeath)) : ''}`
    case 'raise':
      return `死者为你而战 ${sec(e.lifeMs)}（${pct(e.hpRatio)} 生命）`
    case 'devour':
      return `吞下目标最多 ${sec(e.ms)}，每秒消化 ${e.dps}；挨够 ${e.escape} 伤害就吐出来`
    case 'attach':
      return `贴到施法者身上 ${sec(e.ms)}，期间不可选中，照常出手`
    case 'spawn':
      return `召出 ${e.count} 个${e.def.name}`
    case 'teleport':
      return `瞬移到离敌人最近的一个自己召出的${ENEMIES[e.of]?.name ?? e.of}旁${e.then ? lead('，落地时', joinFx(e.then)) : ''}`
    case 'shadow':
      return `${e.dash ? `向前 ${grid(e.dash)} ` : '原地'}留下影子 ${sec(e.lifeMs)}（最多 ${e.max} 个），镜像的出手从影子上再打一遍${e.taunt ? `；影子嘲讽 ${grid(e.taunt.radius)} 内的敌人 ${sec(e.taunt.ms)}` : ''}`
    case 'shadowSwap':
      return '与最新的影子换位'
    case 'undead':
      return `生命回到 ${pct(e.hpRatio)}，之后 ${sec(e.ms)} 内流失殆尽，期间照常行动`
    case 'barrier': {
      const what = [e.bodies === 'all' ? '挡住所有身体' : e.bodies === 'foes' ? '挡住敌人' : '', e.shots ? (e.reflect ? '把敌方弹体反弹回去' : '吞掉敌方弹体') : ''].filter(Boolean).join('、')
      const where = e.shape === 'wall' ? `在前方${e.offset ? ` ${grid(e.offset)} 处` : ''}立起 ${grid(e.length)} 长的墙` : `${e.follow ? '身周' : '落点'}围起半径 ${grid(e.length)} 的一圈`
      return `${where} ${sec(e.durationMs)}${what ? `，${what}` : ''}${e.onCross ? lead('；敌人越过时', joinFx(e.onCross)) : ''}`
    }
    case 'portal':
      return `脚下与前方 ${grid(e.distance)} 处各开一扇门 ${sec(e.durationMs)}，谁踏进一扇就从另一扇出来（敌我都算）`
    case 'tether':
      return `牵住目标 ${sec(e.ms)}${e.onHold ? lead('，撑满时', joinFx(e.onHold)) : ''}${e.onBreak ? lead(`；跑出 ${grid(e.range)} 就断，断时`, joinFx(e.onBreak)) : `；跑出 ${grid(e.range)} 就断`}`
    case 'recall':
      return '把落在地上的弹体全部召回，沿途再打一遍'
    case 'interrupt':
      return '打断蓄力与连发'
    case 'warp':
      return `${e.allies ? '全队' : '目标'}沿出手方向瞬移 ${grid(e.distance)}`
    case 'drag':
      return `拴在身后拖行 ${sec(e.ms)}，期间不能行动`
    case 'realm':
      return `把目标与自己拉进只有彼此的异界 ${sec(e.ms)}，界外谁也插不了手`
  }
}

/** 场的对象与判定 */
function zoneRuleLine(r: ZoneRules, effects: readonly Effect[] | undefined, damage: number): string {
  const parts: string[] = []
  if (r.trap) parts.push(`敌人踏入即触发：${[damage > 0 ? `场内敌人受 ${damage} 伤` : '', ...(effects ?? []).map((e) => effectLine(e))].filter(Boolean).join('、')}，触发后消失`)
  if (r.who === 'allies') parts.push('作用于己方')
  if (r.who === 'all') parts.push('敌我都作用')
  if (r.pull) parts.push(`把场内敌人以每秒 ${grid(r.pull)} 拉向圆心`)
  if (r.traction !== undefined) parts.push(r.traction < 1 ? `地面打滑（抓地 ×${r.traction}）` : `地面抓地 ×${r.traction}`)
  if (r.mist) parts.push('场内同伴只会被同在场内的出手打到')
  if (r.dwell) parts.push(`连续待满 ${sec(r.dwell.ms)}：${joinFx(r.dwell.effects)}`)
  if (r.onExpire) parts.push(`到期时仍在场内：${joinFx(r.onExpire)}`)
  return parts.length > 0 ? `；${parts.join('；')}` : ''
}

function condLine(c: Cond): string {
  switch (c.kind) {
    case 'airborne':
      return '在空中'
    case 'marked':
      return `带着${MARK_LABEL[c.mark]}`
    case 'hpBelow':
      return `生命低于 ${pct(c.ratio)}`
    case 'boss':
      return '是 Boss'
    case 'not':
      return `不${condLine(c.cond)}`
  }
}

const MARK_LABEL: Record<MarkName, string> = {
  stun: '眩晕',
  root: '定身',
  sleep: '睡眠',
  fear: '恐惧',
  charm: '魅惑',
  slow: '减速',
  poison: '中毒',
  silence: '沉默',
  disarm: '致盲',
  stasis: '静止',
  fuse: '你的引信',
  stack: '你的叠层',
  store: '你的存伤',
  deathMark: '你的死亡印记',
}

function shapeLine(w: AbilityDef, s: Shape): string {
  switch (s.kind) {
    case 'bolt':
      return `弹速 ${grid(s.projectile.speed)}/秒 · 弹体 ${grid(s.projectile.radius * 2)}${s.pierce ? ` · 贯穿 ${s.pierce} 名` : ''}${s.projectile.homingDeg ? ` · 追踪（每秒转 ${s.projectile.homingDeg}°）` : ''}${s.projectile.linger ? ` · 飞完落地 ${sec(s.projectile.linger)} 等召回` : ''}`
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
      return `${s.follow ? '以自己为圆心持续生效' : `领域 ${grid(s.radius)} · 持续 ${sec(s.durationMs)}`}${s.tickMs && w.damage ? ` · 每 ${sec(s.tickMs)} ${w.damage} 伤` : ''}${s.mend ? ` · 队友每秒回复 ${s.mend}` : ''}${s.pulse ? ` · 每 ${sec(s.pulse.intervalMs)} 脉冲一次：${s.pulse.onHit.map((e) => effectLine(e)).join('，')}` : ''}${zoneRuleLine(s, w.onHit, w.damage ?? 0)}`
    case 'summon':
      return `每波 ${s.count} 只 · 撞击后自毁 · 存活 ${sec(s.lifeMs)}`
    case 'emplace':
      return `${s.count > 1 ? `一次架起 ${s.count} 座` : `同时最多 ${s.maxAlive} 座`}${s.lifeMs ? ` · 持续 ${sec(s.lifeMs)}` : ''} · 塔伤害 ${s.ability.damage ?? 0} · 射速 ${sec(s.ability.trigger === 'auto' ? s.ability.cooldownMs : 0)} · 射程 ${grid(s.ability.range ?? 0)}`
    case 'world':
      return w.onHit?.some((e) => e.kind === 'timeStop') ? '静止则全场近乎凝固、移动则时间恢复流动' : ''
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
  return `${lead(when, how)}${r.ratio && r.ratio !== 1 ? `，每发 ${pct(r.ratio)} 伤害` : ''}`
}

/** 什么时候能出手：充能、连段、蓄力、弹匣、轮流、资源、以血施法、条件、击杀效果 */
function availLines(w: AbilityDef): string[] {
  const out: string[] = []
  if (w.charges) out.push(`可攒 ${w.charges} 次，冷却按次恢复`)
  if (w.recast) out.push(`出手后 ${sec(w.recast.windowMs)} 内可接下一段：${abilityLabel(w.recast.ability)}${w.recast.ability.onHit ? `，${joinFx(w.recast.ability.onHit)}` : ''}`)
  if (w.hold) out.push(`按住蓄力，蓄满 ${sec(w.hold.maxMs)} 时距离 ×${w.hold.reachMul}、伤害 ×${w.hold.damageMul}`)
  if (w.ammo) out.push(`弹匣 ${w.ammo.count} 发，打空换弹 ${sec(w.ammo.reloadMs)}${w.ammo.last ? lead('；最后一发', joinFx(w.ammo.last)) : ''}`)
  if (w.cycle) {
    const own = (c: AbilityDef): string => selfAndHit(c).join('、')
    const step = (c: AbilityDef): string => {
      const fx = c === w ? '' : own(c)
      return `${abilityLabel(c)}${fx && fx !== own(w) ? `（${fx}）` : ''}`
    }
    out.push(`轮流出手：${[w, ...w.cycle].map(step).join(' → ')}，再从头来`)
  }
  if (w.mirror) out.push('影子也从自己的位置照着出手')
  if (w.anchor) out.push(`从${w.anchor.mode === 'orbit' ? '绕身旋转的' : w.anchor.mode === 'trail' ? '落在一秒半前走过之处的' : '贴着血量最低的队友的'}物件上出手`)
  if (w.cost) out.push(`消耗资源 ${w.cost}`)
  if (w.gain) out.push(`每次出手资源 +${w.gain}`)
  if (w.boost) out.push(`资源到 ${w.boost.at}${w.boost.spend ? ` 时消耗 ${w.boost.spend} ` : ' 以上时'}强化${w.boost.damageMul ? `：伤害 ×${w.boost.damageMul}` : ''}${w.boost.onHit ? `，${joinFx(w.boost.onHit)}` : ''}`)
  if (w.hpCost) out.push(`以血施法：每次扣 ${w.hpCost} 生命`)
  if (w.requires) out.push(`只对${condLine(w.requires)}的目标出手`)
  if (w.onKill) out.push(`打死目标时：${joinFx(w.onKill)}`)
  return out
}

/** 出手前的自身效果、命中效果、出手后的自身效果 */
function selfAndHit(w: AbilityDef): string[] {
  return [...(w.onCast ?? []).map((e) => `出手前自身：${effectLine(e, true)}`), ...(w.onHit ?? []).map((e) => effectLine(e)), ...(w.onSelf ?? []).map((e) => `自身：${effectLine(e, true)}`)]
}

export function abilityStatLines(w: AbilityDef): string[] {
  const base: string[] = []
  if (w.damage) base.push(`伤害 ${w.damage}${w.waveScale ? ' × 当前波次强度' : ''}`)
  if (w.trigger === 'auto' && w.cooldownMs > 0) base.push(`冷却 ${sec(w.cooldownMs)}`)
  if (w.knockback) base.push(`击退 ${kbGrid(w.knockback)}`)
  if (w.bossRatio !== undefined) base.push(`Boss 承伤 ${pct(w.bossRatio)}`)
  const lines: string[] = []
  if (base.length > 0) lines.push(base.join(' · '))
  const shape = shapeLine(w, w.shape)
  if (shape) lines.push(shape)
  const rep = repeatLine(w)
  if (rep) lines.push(rep)
  lines.push(...availLines(w))
  const fx = selfAndHit(w)
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
  if (def.resource) baseLines.push(resourceLine(def.resource))
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
  for (const f of def.forms ?? []) {
    groups.push({
      icon: f.emoji ?? def.emoji,
      title: `形态 · ${f.name ?? def.name}`,
      lines: [
        [f.sizeMul ? `体型 ×${f.sizeMul}` : '', f.speedMul ? `移速 ×${f.speedMul}` : '', '自动能力换成：'].filter(Boolean).join(' · '),
        ...(f.abilities ?? []).flatMap((w) => [`「${abilityLabel(w)}」`, ...abilityStatLines(w)]),
      ],
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

const RES_LABEL: Record<ResourceDef['kind'], string> = { energy: '能量', fury: '怒气', heat: '热量', growth: '成长' }

/** 资源怎么涨怎么落、攒满了会怎样 */
export function resourceLine(r: ResourceDef): string {
  const parts = [`${RES_LABEL[r.kind]} 上限 ${r.max}`]
  if (r.start) parts.push(`开局 ${r.start}`)
  if (r.regen) parts.push(`每秒回复 ${r.regen}`)
  if (r.onHit) parts.push(`打中 +${r.onHit}`)
  if (r.onHurt) parts.push(`挨打 +${r.onHurt}`)
  if (r.onKill) parts.push(`击杀 +${r.onKill}`)
  if (r.decay) parts.push(`${r.decayDelayMs ? `${sec(r.decayDelayMs)} 没涨后` : ''}每秒掉 ${r.decay}`)
  if (r.keep) parts.push('跨波保留')
  const full = r.full
  if (full) {
    const what = [...(full.effects ?? []).map((e) => effectLine(e)), full.lockMs ? `${sec(full.lockMs)} 内耗它的能力出不了手` : '', full.reset ? '随后清零' : ''].filter(Boolean)
    if (what.length > 0) parts.push(lead('攒满时', what.join('，')))
  }
  return parts.join(' · ')
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
