import { hasComponent } from 'bitecs'
import type { Effect } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { Enemy, CharAtkSlow, Morph, Poison, Slow } from '../../components'
import { applyMorph } from '../../entities/enemy'
import { spawnEnemyProjectileEcs } from '../../entities/projectile'
import { spawnZone } from '../../entities/zone'
import { } from '../../store'
import { damageTarget } from './damage'
import { FACTION } from '../../components'
import { healEnemies, healCharacters } from './heal'
import { nearestAngle, targetsOf } from '../../utils/targets'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import { spawnFxRing } from '../../entities/fx'

// 命中效果层（阵营中立）：「投送方式」与「命中后做什么」正交——任何投送都经此施加
// 同一套效果。落点归属（暴击/击退倍率/战报分账/该打哪一侧）由施放者本身决定，
// 效果只描述做什么。
//
// **状态类效果按「目标有没有这个机制」施加，不按阵营判。** 减速/中毒/变形的状态位
// 只挂在敌人身上，攻速罚只挂在队员身上——所以「队员不会被减速」不该写成
// `if (!team) continue`（那是把阵营知识塞进效果层），而该是「目标没有 Slow 组件，
// 这条效果对它无从落地」。同一条效果碰上没有该机制的目标自然滑过，将来加中立单位
// 也不用回来改这里。
//
// 每种效果一个处理器，收在 EFFECT_KINDS 一张表里：新增一种 = 加一行。
// 表是**全映射**（`Record<Effect['kind'], …>`），漏掉一种编译期就红——
// 从前那条 else-if 链漏一种是静默什么都不做。

/** 一次触发的落点：锚点类效果（blast/ground/spawnProjectile/heal）作用于 (x,y)；
 * 逐目标类效果（damage/slow/poison/morph/attackSlow）作用于 targets（本次直接命中的真身） */
export interface HitCtx {
  readonly x: number
  readonly y: number
  readonly baseDamage: number
  readonly targets?: readonly number[]
  /** blast 跳过的目标（主目标 / 已命中） */
  readonly exclude?: ReadonlySet<number>
  /** 触发者自身（死亡触发时 heal 排除正在死亡的自己） */
  readonly source?: number
}

/** 锚点圆内各造成一次伤害（击退方向从锚点指向目标）；溅射/终点震波/连环刃/轰炸共用 */
export function applyBlast(
  sim: Sim,
  src: Source,
  x: number,
  y: number,
  damage: number,
  radius: number,
  knockback: number,
  exclude?: ReadonlySet<number>,
): void {
  const list = targetsOf(sim, src)
  for (const i of circleHitIndices({ x, y }, radius, list)) {
    const t = list[i]!
    if (exclude?.has(t.eid)) continue
    damageTarget(sim, src, t.eid, damage, knockback, x, y)
  }
}

/** 逐个施加到本次命中的目标上，并先滤掉「没有这套机制」的目标 */
function eachCapable(sim: Sim, hit: HitCtx, comp: object, apply: (t: number) => void): void {
  for (const t of hit.targets ?? []) {
    if (hasComponent(sim.world, t, comp)) apply(t)
  }
}

type Handler<K extends Effect['kind']> = (
  sim: Sim,
  src: Source,
  fx: Extract<Effect, { kind: K }>,
  hit: HitCtx,
) => void

/** 每种效果一个处理器。全映射：新增一种 Effect 而不在此登记 = 编译不过 */
const EFFECT_KINDS: { [K in Effect['kind']]: Handler<K> } = {
  blast: (sim, src, fx, hit) => {
    const dmg = Math.max(1, Math.round(hit.baseDamage * fx.ratio))
    applyBlast(sim, src, hit.x, hit.y, dmg, fx.radius, fx.knockback, hit.exclude)
    if (fx.ring) spawnFxRing(sim, hit.x, hit.y, fx.radius, fx.ring)
  },

  damage: (sim, src, fx, hit) => {
    const dmg = Math.max(1, Math.round(hit.baseDamage * (fx.ratio ?? 1)))
    for (const t of hit.targets ?? []) damageTarget(sim, src, t, dmg)
  },

  // 减速位只挂在敌人身上：队员身上没有 Slow，这条效果碰到他们自然滑过
  slow: (sim, _src, fx, hit) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, hit, Slow, (t) => {
      Slow.until[t] = until
      Slow.mul[t] = fx.factor
    })
  },

  poison: (sim, src, fx, hit) => {
    const now = sim.elapsedMs
    eachCapable(sim, hit, Poison, (t) => {
      Poison.until[t] = now + fx.durationMs
      Poison.nextTick[t] = now + fx.tickMs
      Poison.dmg[t] = fx.damage
      Poison.tickMs[t] = fx.tickMs
      Poison.slot[t] = src.slot
    })
  },

  // 这一帧刚死的不变形
  morph: (sim, _src, fx, hit) => {
    eachCapable(sim, hit, Morph, (t) => {
      if (hasComponent(sim.world, t, Enemy)) applyMorph(sim, sim.frames, t, fx)
    })
  },

  // 攻速罚只挂在队员身上，同理
  attackSlow: (sim, _src, fx, hit) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, hit, CharAtkSlow, (t) => {
      CharAtkSlow.until[t] = until
      CharAtkSlow.mul[t] = fx.mul
    })
  },

  // 铺一块地面区：它属于施放的那一侧（伤害只落在对面），故要带上阵营。
  // 铺完就与施放者无关了——毒圈活过放它的人是常态，故不挂 Owner
  ground: (sim, src, fx, hit) => {
    spawnZone(sim, {
      x: hit.x,
      y: hit.y,
      radius: fx.def.radius,
      faction: src.faction,
      durationMs: fx.def.durationMs,
      enterMs: fx.def.enterMs,
      color: fx.def.color,
      fillAlpha: fx.def.fillAlpha,
      lineAlpha: fx.def.lineAlpha,
      lineWidth: 2,
      burn: {
        damage: fx.def.damage,
        tickMs: fx.def.tickMs,
        srcSlot: src.slot,
        srcName: src.faction === FACTION.team ? '' : (src.name ?? ''),
      },
    })
  },

  // 治疗的是自己这一侧：这里的阵营判断是「找哪一批人」，与上面的机制判断不同
  heal: (sim, src, fx, hit) => {
    const all = fx.all ?? true
    if (src.faction === FACTION.team) healCharacters(sim, hit.x, hit.y, fx.range, fx.amount, all)
    else healEnemies(sim, hit.x, hit.y, fx.range, fx.amount, all, hit.source)
  },

  // 亡语冷枪：发的是敌弹，故只对敌方侧成立（gen 只允许它出现在敌人亡语里）
  spawnProjectile: (sim, src, fx, hit) => {
    if (src.faction === FACTION.team) return
    const angle = nearestAngle(hit.x, hit.y, targetsOf(sim, src), Infinity)
    if (angle === null) return
    spawnEnemyProjectileEcs(sim, hit.x, hit.y, angle, {
      frame: sim.frames.index(fx.projectile.emoji, 'enemyProjectile'),
      size: fx.projectile.size,
      radius: fx.projectile.radius,
      speed: fx.projectile.speed,
      damage: Math.round(fx.damage * src.dmgMul),
      lifeMs: fx.lifeMs,
      srcName: src.name,
    })
  },
}

/** 求值一串效果（命中触发 onHit 与亡语共用） */
export function applyAbilityEffects(
  sim: Sim,
  src: Source,
  effects: readonly Effect[] | undefined,
  hit: HitCtx,
): void {
  if (!effects) return
  for (const fx of effects) {
    ;(EFFECT_KINDS[fx.kind] as Handler<Effect['kind']>)(sim, src, fx, hit)
  }
}
