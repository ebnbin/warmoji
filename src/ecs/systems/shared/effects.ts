import type { Cond, Effect, MarkName } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { hasComponent, query } from 'bitecs'
import { Ability, Alive, Anchored, Boss, Cd, Charges, Enemy, FACTION, Faction, Grow, History, Hp, Manual, MARK, MARK_SLOTS, Mark, Owner, Radius, Revive, TAG, Transform, Uid } from '../../components'
import { addCc, addMark, CC_MARKS, hasMark, isAirborne, markSlot } from '../../utils/marks'
import { Interned } from '../../utils/intern'
import { displace } from './displace'
import { gainRes } from './resource'
import { markSrcs, poisonSrc } from '../../store'
import { applyMorph } from '../../entities/enemy'
import { applyForm } from '../../entities/form'
import { nearestSummoned, raiseDead, spawnAround, spawnClones } from '../../entities/summon'
import { spawnShadow, swapShadow } from '../../entities/shadow'
import { spawnBarrier } from '../../entities/barrier'
import { spawnTether } from '../../entities/tether'
import { recallShots } from './projectile'
import { rescale } from './scale'
import { historyAt } from './history'
import { devour } from './gut'
import { stealAbility } from './steal'
import { spawnBolt } from '../../entities/projectile'
import { openPortals, spawnZone } from '../../entities/zone'
import { spawnCoins } from '../../entities/pickup'
import { hit } from './damage'
import { despawnEnemy, grantIframe, reviveCharacter } from './combat'
import { interrupt } from './ability'
import { healAllies } from './heal'
import { eachAlly, nearestAngle, nearestTarget, targetsWithin } from '../../utils/targets'
import { flying } from '../../utils/source'
import { isSameEntity } from '../../utils/identity'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import type { ByKind } from '../../../util/record'
import { spawnFxCircle, spawnFxRing } from '../../entities/fx'

interface HitCtx {
  readonly x: number
  readonly y: number
  readonly baseDamage: number
  readonly targets?: readonly number[]
  readonly exclude?: ReadonlySet<number>
  readonly source?: number
  /** 死亡印记结算时的死者 */
  readonly victim?: number
  /** 出手的方向 */
  readonly angle?: number
}

export function applyBlast(
  sim: Sim,
  src: Source,
  x: number,
  y: number,
  damage: number,
  radius: number,
  knockback: number,
  exclude?: ReadonlySet<number>,
): Struck[] {
  const list = targetsWithin(sim, src, x, y, radius)
  const struck: Struck[] = []
  for (const i of circleHitIndices({ x, y }, radius, list)) {
    const t = list[i]!
    if (exclude?.has(t.eid)) continue
    const s = struckOf(t.eid)
    if (hit(sim, src, t.eid, damage, { knockback, from: { x, y } })) struck.push(s)
  }
  return struck
}

/** 打中的身体：eid 被击杀后会立刻复用，靠 Uid 认出还是不是它 */
export interface Struck {
  readonly eid: number
  readonly uid: number
}

export function struckOf(eid: number): Struck {
  return { eid, uid: Uid.v[eid]! }
}

/** 标记里按号存的定义：招架反制、叠层、引信、存伤、死亡印记、强化下一击 */
export const PARRY_FX = new Interned<readonly Effect[]>()
type EffectOfKind<K extends Effect['kind']> = Extract<Effect, { readonly kind: K }>
export const STACK_DEF = new Interned<EffectOfKind<'stack'>>()
export const FUSE_DEF = new Interned<EffectOfKind<'fuse'>>()
export const STORE_DEF = new Interned<EffectOfKind<'store'>>()
export const DEATH_DEF = new Interned<EffectOfKind<'deathMark'>>()
export const EMPOWER_DEF = new Interned<EffectOfKind<'empower'>>()

const MARK_OF: Record<MarkName, number> = {
  stun: MARK.stun,
  root: MARK.root,
  sleep: MARK.sleep,
  fear: MARK.fear,
  charm: MARK.charm,
  slow: MARK.slow,
  poison: MARK.poison,
  silence: MARK.silence,
  disarm: MARK.disarm,
  stasis: MARK.stasis,
  fuse: MARK.fuse,
  stack: MARK.stack,
  store: MARK.store,
  deathMark: MARK.deathMark,
}

/** 加一条记着来源的标记：按来源分开记的以来源身体的编号为 ref */
export function markFrom(t: number, kind: number, until: number, a: number, b: number, src: Source): number {
  const s = addMark(t, kind, TAG.effect, until, a, b, 0, src.bodyUid ?? 0)
  if (s >= 0) (markSrcs[t] ??= [])[s - t * MARK_SLOTS] = src
  return s
}

export function markSource(t: number, s: number): Source | undefined {
  return markSrcs[t]?.[s - t * MARK_SLOTS]
}

/** 条件：对目标判断；叠层、引信、存伤、死亡印记只认这个来源的 */
export function test(sim: Sim, src: Source, t: number, cond: Cond): boolean {
  switch (cond.kind) {
    case 'airborne':
      return isAirborne(t)
    case 'marked': {
      const kind = MARK_OF[cond.mark]
      const keyed = kind === MARK.fuse || kind === MARK.stack || kind === MARK.store || kind === MARK.deathMark
      return markSlot(sim, t, kind, keyed ? (src.bodyUid ?? 0) : 0) >= 0
    }
    case 'hpBelow':
      return Hp.max[t]! > 0 && Hp.v[t]! / Hp.max[t]! < cond.ratio
    case 'boss':
      return Boss.v[t] === 1
    case 'not':
      return !test(sim, src, t, cond.cond)
  }
}

/** 冷却：转好或减少；充能的补一次 */
function refreshOne(sim: Sim, e: number, ms: number | undefined): void {
  if (hasComponent(sim.world, e, Charges)) {
    if (ms === undefined) {
      Charges.n[e] = Math.min(Charges.max[e]!, Charges.n[e]! + 1)
      if (Charges.n[e]! >= Charges.max[e]!) Cd.left[e] = 0
      return
    }
  }
  Cd.left[e] = ms === undefined ? 0 : Math.max(0, Cd.left[e]! - ms)
}

/** 出手的身体还在就返回它，否则 -1 */
export function casterOf(sim: Sim, src: Source): number {
  const b = src.body
  return b !== undefined && isSameEntity(sim.world, b, src.bodyUid ?? 0) && Alive.v[b] ? b : -1
}

/** 让一组控制在这一帧到期：到期反应照常执行 */
export function expireMarks(sim: Sim, eid: number, kinds: readonly number[]): void {
  for (const kind of kinds) {
    for (let s = markSlot(sim, eid, kind); s >= 0; s = markSlot(sim, eid, kind)) Mark.until[s] = sim.elapsedMs
  }
}

/** 被施加者牵着走的控制（恐惧、魅惑）：记下施加者与它此刻的位置，施加者没了就对着这个位置 */
function addLed(sim: Sim, src: Source, t: number, kind: number, until: number, at: HitCtx): void {
  const by = casterOf(sim, src)
  const x = by >= 0 ? Transform.x[by]! : at.x
  const y = by >= 0 ? Transform.y[by]! : at.y
  if (addCc(sim, t, kind, until, by, x, y, by >= 0 ? Uid.v[by]! : 0)) interrupt(sim, t)
}

/** 命中后的效果：施于这次真正打中且编号未变的身体，溅射不再打它们；谁也没打中就没有效果 */
export function applyOnHit(sim: Sim, src: Source, effects: readonly Effect[] | undefined, x: number, y: number, baseDamage: number, struck: readonly Struck[], angle?: number): void {
  if (!effects || struck.length === 0) return
  const live = struck.filter((s) => isSameEntity(sim.world, s.eid, s.uid)).map((s) => s.eid)
  applyAbilityEffects(sim, src, effects, { x, y, baseDamage, targets: live, exclude: new Set(live), angle })
}

function eachCapable(sim: Sim, at: HitCtx, comp: object, apply: (t: number) => void): void {
  for (const t of at.targets ?? []) {
    if (hasComponent(sim.world, t, comp)) apply(t)
  }
}

type EffectOf = ByKind<Effect>

type Handler<K extends keyof EffectOf> = (sim: Sim, src: Source, fx: EffectOf[K], at: HitCtx) => void

/** 效果只看目标有没有对应的组件；金币只对队伍来源生效 */
const EFFECT_KINDS: { [K in keyof EffectOf]: Handler<K> } = {
  blast: (sim, src, fx, at) => {
    const dmg = Math.max(1, Math.round(at.baseDamage * fx.ratio))
    applyBlast(sim, src, at.x, at.y, dmg, fx.radius, fx.knockback, at.exclude)
    if (fx.ring) spawnFxRing(sim, at.x, at.y, fx.radius, fx.ring)
  },

  slow: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.slow, TAG.effect, until, fx.factor))
  },

  poison: (sim, src, fx, at) => {
    const now = sim.elapsedMs
    eachCapable(sim, at, Mark, (t) => {
      addMark(t, MARK.poison, TAG.effect, now + fx.durationMs, fx.damage, fx.tickMs, now + fx.tickMs)
      poisonSrc[t] = src
    })
  },

  morph: (sim, _src, fx, at) => {
    eachCapable(sim, at, Enemy, (t) => {
      if (!hasMark(sim, t, MARK.unstoppable)) applyMorph(sim, sim.frames, t, fx)
    })
  },

  attackSlow: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.cd, TAG.effect, until, fx.mul))
  },

  ground: (sim, src, fx, at) => {
    spawnZone(sim, {
      x: at.x,
      y: at.y,
      radius: fx.def.radius,
      src: { ...flying(src), tint: 0xa5d86a },
      durationMs: fx.def.durationMs,
      enterMs: fx.def.enterMs,
      color: fx.def.color,
      fillAlpha: fx.def.fillAlpha,
      lineAlpha: fx.def.lineAlpha,
      lineWidth: 2,
      tickMs: fx.def.tickMs,
      damage: fx.def.damage,
      effects: fx.def.effects,
      rules: fx.def,
    })
  },

  heal: (sim, src, fx, at) => {
    const amount = Math.max(1, Math.round(fx.amount * src.dmgMul))
    if (!at.targets) {
      healAllies(sim, src.faction, at.x, at.y, fx.range ?? 0, amount, fx.scope !== 'lowest', at.source ?? -1, src.realm)
      return
    }
    const hurt = at.targets.filter((t) => hasComponent(sim.world, t, Hp) && Alive.v[t] === 1 && Hp.v[t]! < Hp.max[t]!)
    if (hurt.length === 0) return
    const each = Math.max(1, Math.round(amount * (fx.ratio ?? 1)))
    if (fx.scope === 'lowest') {
      let best = hurt[0]!
      for (const t of hurt) if (Hp.v[t]! / Hp.max[t]! < Hp.v[best]! / Hp.max[best]!) best = t
      Hp.v[best] = Math.min(Hp.max[best]!, Hp.v[best]! + each)
      return
    }
    for (const t of hurt) Hp.v[t] = Math.min(Hp.max[t]!, Hp.v[t]! + each)
  },

  spawnProjectile: (sim, src, fx, at) => {
    const angle = nearestAngle(sim, src, at.x, at.y, Infinity)
    if (angle === null) return
    spawnBolt(sim, at.x, at.y, angle, {
      faction: src.faction,
      frame: sim.frames.index(fx.projectile.emoji, src.faction === FACTION.enemy ? 'enemyProjectile' : 'player'),
      size: fx.projectile.size,
      radius: fx.projectile.radius,
      speed: fx.projectile.speed,
      rotOffsetDeg: fx.projectile.rotationOffsetDeg,
      lifeMs: fx.lifeMs,
      pierce: 0,
      damage: fx.damage * src.dmgMul,
      knockback: 0,
      src: flying(src),
      onHit: fx.onHit,
      homingDeg: fx.projectile.homingDeg,
      linger: fx.projectile.linger,
    })
  },

  buff: (sim, _src, fx, at) => {
    const until = fx.durationMs === undefined ? Infinity : sim.elapsedMs + fx.durationMs
    const tag = fx.durationMs === undefined ? TAG.perk : TAG.effect
    eachCapable(sim, at, Mark, (t) => {
      if (fx.damageMul !== undefined) addMark(t, MARK.dmg, tag, until, fx.damageMul)
      if (fx.speedMul !== undefined) addMark(t, MARK.speed, tag, until, fx.speedMul)
    })
  },

  damage: (sim, src, fx, at) => {
    const dmg = Math.max(1, Math.round((fx.amount + at.baseDamage * (fx.ratio ?? 0)) * (fx.ratio === undefined ? src.dmgMul : 1)))
    for (const t of at.targets ?? []) hit(sim, src, t, dmg)
  },

  stun: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => {
      if (addCc(sim, t, MARK.stun, until)) interrupt(sim, t)
    })
  },

  hide: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.hide, TAG.effect, until))
  },

  taunt: (sim, src, fx, at) => {
    const by = src.viewer
    if (by === undefined) return
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addCc(sim, t, MARK.taunt, until, by, 0, 0, Uid.v[by]!))
  },

  guard: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.guard, TAG.effect, until, fx.mul))
  },

  revive: (sim, _src, _fx, at) => {
    eachCapable(sim, at, Revive, (t) => {
      if (!Alive.v[t]) reviveCharacter(sim, t)
    })
  },

  healRatio: (sim, _src, fx, at) => {
    eachCapable(sim, at, Hp, (t) => {
      if (Alive.v[t]) Hp.v[t] = Math.min(Hp.max[t]!, Hp.v[t]! + Hp.max[t]! * fx.ratio)
    })
  },

  invuln: (sim, _src, fx, at) => {
    eachCapable(sim, at, Mark, (t) => {
      if (Alive.v[t]) grantIframe(sim, t, fx.ms)
    })
  },

  reviveCut: (sim, _src, fx, at) => {
    let best = -1
    eachCapable(sim, at, Revive, (t) => {
      if (Alive.v[t]) return
      if (best < 0 || Revive.at[t]! > Revive.at[best]!) best = t
    })
    if (best >= 0) Revive.at[best] = Revive.at[best]! - fx.ms
  },

  timeStop: (sim, _src, fx) => {
    sim.timeStopMsLeft = fx.durationMs
  },

  coins: (sim, src, fx, at) => {
    if (src.faction === FACTION.team) spawnCoins(sim, at.x, at.y, fx.count)
  },

  vanish: (sim, _src, _fx, at) => {
    eachCapable(sim, at, Enemy, (t) => despawnEnemy(sim, t))
  },

  root: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addCc(sim, t, MARK.root, until))
  },

  silence: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addCc(sim, t, MARK.silence, until))
  },

  disarm: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addCc(sim, t, MARK.disarm, until))
  },

  grounded: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addCc(sim, t, MARK.ground, until))
  },

  sleep: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => {
      if (addCc(sim, t, MARK.sleep, until, fx.wakeMul)) interrupt(sim, t)
    })
  },

  fear: (sim, src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addLed(sim, src, t, MARK.fear, until, at))
  },

  charm: (sim, src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addLed(sim, src, t, MARK.charm, until, at))
  },

  berserk: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addCc(sim, t, MARK.berserk, until))
  },

  stasis: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => {
      addMark(t, MARK.stasis, TAG.effect, until)
      interrupt(sim, t)
    })
  },

  untargetable: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.untargetable, TAG.effect, until))
  },

  unstoppable: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => {
      expireMarks(sim, t, CC_MARKS)
      addMark(t, MARK.unstoppable, TAG.effect, until)
    })
  },

  cleanse: (sim, _src, _fx, at) => {
    eachCapable(sim, at, Mark, (t) => expireMarks(sim, t, [...CC_MARKS, MARK.slow]))
  },

  spellShield: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.spellShield, TAG.effect, until, fx.count))
  },

  frontGuard: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.frontGuard, TAG.effect, until, 0, (fx.arcDeg * Math.PI) / 360))
  },

  reveal: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.reveal, TAG.effect, until))
  },

  stealth: (sim, _src, fx, at) => {
    const until = fx.durationMs === undefined ? Infinity : sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.stealth, TAG.effect, until))
  },

  undying: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.undying, TAG.effect, until))
  },

  parry: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.parry, TAG.effect, until, 0, PARRY_FX.id(fx.then)))
  },

  pull: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by < 0) return
    for (const t of at.targets ?? []) {
      if (t === by) continue
      const d = sim.hooks.worldDelta(sim, Transform.x[t]!, Transform.y[t]!, Transform.x[by]!, Transform.y[by]!)
      const dist = Math.hypot(d.x, d.y)
      const travel = dist - Radius.v[by]! - Radius.v[t]! - fx.gap
      if (travel <= 0) continue
      const ms = (travel / fx.speed) * 1000
      const angle = Math.atan2(d.y, d.x)
      if (displace(sim, t, { kind: 'dash', angle, distance: travel, ms }, { self: false, src })) continue
      if (fx.heavy === 'self') displace(sim, by, { kind: 'dash', angle: angle + Math.PI, distance: travel, ms }, { self: true })
    }
  },

  knockup: (sim, src, fx, at) => {
    for (const t of at.targets ?? []) {
      if (hasMark(sim, t, MARK.unstoppable)) continue
      if (displace(sim, t, { kind: 'arc', x: Transform.x[t]!, y: Transform.y[t]!, ms: fx.durationMs, height: fx.height }, { self: false, src, onLand: fx.onLand, base: at.baseDamage })) interrupt(sim, t)
    }
  },

  shove: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const ox = by >= 0 ? Transform.x[by]! : at.x
    const oy = by >= 0 ? Transform.y[by]! : at.y
    for (const t of at.targets ?? []) {
      if (t === by || hasMark(sim, t, MARK.unstoppable)) continue
      const d = sim.hooks.worldDelta(sim, ox, oy, Transform.x[t]!, Transform.y[t]!)
      const angle = Math.atan2(d.y, d.x)
      displace(sim, t, { kind: 'dash', angle, distance: fx.distance, ms: fx.ms }, { self: false, src, onWall: fx.onWall, base: at.baseDamage })
    }
  },

  throw: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    for (const t of at.targets ?? []) {
      if (t === by || hasMark(sim, t, MARK.unstoppable)) continue
      const tx = Transform.x[t]!
      const ty = Transform.y[t]!
      let to: { x: number; y: number } | null = null
      if (fx.to === 'foe') {
        const other = nearestTarget(sim, flying(src), tx, ty, fx.distance, new Set([t]))
        if (other) to = { x: other.x, y: other.y }
      }
      if (!to) {
        const ox = by >= 0 ? Transform.x[by]! : at.x
        const oy = by >= 0 ? Transform.y[by]! : at.y
        const d = sim.hooks.worldDelta(sim, tx, ty, ox, oy)
        const len = Math.hypot(d.x, d.y) || 1
        to = { x: ox + (d.x / len) * fx.distance * 0.5, y: oy + (d.y / len) * fx.distance * 0.5 }
      }
      if (displace(sim, t, { kind: 'arc', x: to.x, y: to.y, ms: fx.ms, height: fx.height }, { self: false, src, onLand: fx.onLand, base: at.baseDamage })) interrupt(sim, t)
    }
  },


  if: (sim, src, fx, at) => {
    for (const t of at.targets ?? []) {
      const then = test(sim, src, t, fx.when) ? fx.then : fx.else
      if (then) applyAbilityEffects(sim, src, then, { ...at, targets: [t] })
    }
  },

  stack: (sim, src, fx, at) => {
    const id = STACK_DEF.id(fx)
    const until = sim.elapsedMs + fx.durationMs
    for (const t of at.targets ?? []) {
      if (!hasComponent(sim.world, t, Mark)) continue
      const s = markSlot(sim, t, MARK.stack, src.bodyUid ?? 0, id)
      const n = (s >= 0 ? Mark.a[s]! : 0) + 1
      if (n >= fx.max) {
        if (s >= 0) Mark.kind[s] = MARK.none
        applyAbilityEffects(sim, src, fx.then, { x: Transform.x[t]!, y: Transform.y[t]!, baseDamage: at.baseDamage, targets: [t] })
        continue
      }
      markFrom(t, MARK.stack, until, n, id, src)
    }
  },

  detonate: (sim, src, fx, at) => {
    const kind = fx.mark === 'fuse' ? MARK.fuse : MARK.store
    const ref = src.bodyUid ?? 0
    for (const t of at.targets ?? []) {
      for (let s = t * MARK_SLOTS; s < (t + 1) * MARK_SLOTS; s++) {
        if (Mark.kind[s] === kind && Mark.ref[s] === ref && Mark.until[s]! > sim.elapsedMs) Mark.until[s] = sim.elapsedMs
      }
    }
  },

  fuse: (sim, src, fx, at) => {
    const id = FUSE_DEF.id(fx)
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Mark, (t) => markFrom(t, MARK.fuse, until, at.baseDamage, id, src))
  },

  store: (sim, src, fx, at) => {
    const id = STORE_DEF.id(fx)
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Mark, (t) => markFrom(t, MARK.store, until, 0, id, src))
  },

  deathMark: (sim, src, fx, at) => {
    const id = DEATH_DEF.id(fx)
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Mark, (t) => markFrom(t, MARK.deathMark, until, 0, id, src))
  },

  refresh: (sim, src, fx) => {
    const caster = casterOf(sim, src)
    for (const e of query(sim.world, [Ability, Owner, Cd])) {
      const o = Owner.eid[e]!
      if (fx.who === 'team' ? Faction.v[o] !== src.faction : o !== caster) continue
      if (fx.what === 'this' && e !== src.ability) continue
      if (fx.what === 'skill' && !hasComponent(sim.world, e, Manual)) continue
      refreshOne(sim, e, fx.ms)
    }
  },

  gain: (sim, _src, fx, at) => {
    for (const t of at.targets ?? []) gainRes(sim, t, fx.amount)
  },

  empower: (sim, _src, fx, at) => {
    const id = EMPOWER_DEF.id(fx)
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.empower, TAG.effect, Infinity, fx.hits, id))
  },

  caster: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by >= 0) applyAbilityEffects(sim, src, fx.then, { x: Transform.x[by]!, y: Transform.y[by]!, baseDamage: at.baseDamage, targets: [by] })
  },

  area: (sim, src, fx, at) => {
    const found = targetsWithin(sim, src, at.x, at.y, fx.radius).map((t) => t.eid)
    if (found.length > 0) applyAbilityEffects(sim, src, fx.then, { ...at, targets: found })
  },

  swap: (sim, src, _fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by < 0 || t === undefined || t === by || hasMark(sim, t, MARK.unstoppable)) return
    const tx = Transform.x[t]!
    const ty = Transform.y[t]!
    if (!displace(sim, t, { kind: 'place', x: Transform.x[by]!, y: Transform.y[by]! }, { self: false, src })) return
    displace(sim, by, { kind: 'place', x: tx, y: ty }, { self: true, free: true })
  },

  form: (sim, _src, fx, at) => {
    eachCapable(sim, at, Hp, (t) => {
      if (Alive.v[t]) applyForm(sim, t, fx.to, fx.ms, fx.onEnd)
    })
  },

  grow: (sim, _src, fx, at) => {
    eachCapable(sim, at, Grow, (t) => {
      if (fx.ms !== undefined) addMark(t, MARK.grow, TAG.effect, sim.elapsedMs + fx.ms, fx.mul)
      else Grow.perm[t] = Math.min(fx.max ?? Infinity, Grow.perm[t]! * fx.mul)
      rescale(sim, t)
    })
  },

  rewind: (sim, _src, fx, at) => {
    eachCapable(sim, at, History, (t) => {
      const s = historyAt(t, fx.ms)
      if (s < 0 || !Alive.v[t]) return
      const x0 = Transform.x[t]!
      const y0 = Transform.y[t]!
      if (!displace(sim, t, { kind: 'place', x: History.x[s]!, y: History.y[s]! }, { self: true, free: true })) return
      Hp.v[t] = Math.min(Hp.max[t]!, Math.max(Hp.v[t]!, History.hp[s]!))
      spawnFxCircle(sim, x0, y0, 22, { fill: 0x80deea, fillAlpha: 0.4, fromScale: 1, toScale: 0.2, durationMs: 260, depth: 14 })
      spawnFxCircle(sim, Transform.x[t]!, Transform.y[t]!, 26, { fill: 0x80deea, fillAlpha: 0.4, fromScale: 0.4, toScale: 1.8, durationMs: 300, depth: 14 })
    })
  },

  steal: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by >= 0 && t !== undefined) stealAbility(sim, by, t, fx.ms, fx.cooldownMs, fx.skill === true, src.ability)
  },

  clone: (sim, src, fx) => {
    const by = casterOf(sim, src)
    if (by >= 0) spawnClones(sim, by, fx.count, fx.lifeMs, fx.hpRatio, fx.dmgRatio, fx.onDeath)
  },

  raise: (sim, src, fx, at) => {
    if (at.victim !== undefined) raiseDead(sim, at.victim, src.faction, casterOf(sim, src), fx.lifeMs, fx.hpRatio)
  },

  devour: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by >= 0 && t !== undefined) devour(sim, by, t, fx.ms, fx.dps, fx.escape, fx.spit)
  },

  attach: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by < 0) return
    const until = sim.elapsedMs + fx.ms
    for (const t of at.targets ?? []) {
      if (t === by || !Alive.v[t] || hasComponent(sim.world, t, Anchored)) continue
      const d = sim.hooks.worldDelta(sim, Transform.x[by]!, Transform.y[by]!, Transform.x[t]!, Transform.y[t]!)
      const len = Math.hypot(d.x, d.y) || 1
      const r = Radius.v[by]! * 0.7
      if (!displace(sim, t, { kind: 'follow', host: by, ox: (d.x / len) * r, oy: (d.y / len) * r, ms: fx.ms }, { self: false, free: true })) continue
      addMark(t, MARK.untargetable, TAG.effect, until)
    }
  },

  spawn: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const x = by >= 0 ? Transform.x[by]! : at.x
    const y = by >= 0 ? Transform.y[by]! : at.y
    spawnAround(sim, by, src.faction, fx.def, fx.count, fx.spread, x, y)
  },

  teleport: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by < 0) return
    const foe = nearestTarget(sim, flying(src), Transform.x[by]!, Transform.y[by]!, Infinity)
    const dest = nearestSummoned(sim, by, fx.of, foe?.x ?? Transform.x[by]!, foe?.y ?? Transform.y[by]!)
    if (dest < 0) return
    const x0 = Transform.x[by]!
    const y0 = Transform.y[by]!
    if (!displace(sim, by, { kind: 'place', x: Transform.x[dest]!, y: Transform.y[dest]! + Radius.v[dest]! }, { self: true })) return
    spawnFxCircle(sim, x0, y0, 30, { fill: 0x66bb6a, fillAlpha: 0.4, fromScale: 1, toScale: 0.2, durationMs: 280, depth: 14 })
    spawnFxCircle(sim, Transform.x[by]!, Transform.y[by]!, 30, { fill: 0x66bb6a, fillAlpha: 0.4, fromScale: 0.3, toScale: 1.8, durationMs: 320, depth: 14 })
    if (fx.then) applyAbilityEffects(sim, src, fx.then, { x: Transform.x[by]!, y: Transform.y[by]!, baseDamage: at.baseDamage })
  },

  shadow: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by >= 0) spawnShadow(sim, src, by, at.angle ?? 0, fx.lifeMs, fx.max, fx.dash, fx.taunt)
  },

  shadowSwap: (sim, src) => {
    const by = casterOf(sim, src)
    if (by >= 0) swapShadow(sim, by)
  },

  barrier: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const angle = at.angle ?? 0
    const off = fx.shape === 'wall' ? (fx.offset ?? 0) : 0
    spawnBarrier(sim, {
      shape: fx.shape,
      x: at.x + Math.cos(angle) * off,
      y: at.y + Math.sin(angle) * off,
      angle,
      length: fx.length,
      durationMs: fx.durationMs,
      bodies: fx.bodies,
      shots: fx.shots,
      reflect: fx.reflect === true,
      follow: fx.follow && by >= 0 ? by : -1,
      onCross: fx.onCross,
      color: fx.color,
      src: flying(src),
    })
  },

  portal: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const x0 = by >= 0 ? Transform.x[by]! : at.x
    const y0 = by >= 0 ? Transform.y[by]! : at.y
    const a = at.angle ?? 0
    const far = by >= 0 ? sim.hooks.constrainBody(sim, by, { x: x0, y: y0 }, { x: x0 + Math.cos(a) * fx.distance, y: y0 + Math.sin(a) * fx.distance }) : { x: x0 + Math.cos(a) * fx.distance, y: y0 + Math.sin(a) * fx.distance }
    openPortals(sim, flying(src), { x: x0, y: y0 }, far, fx.radius, fx.durationMs, fx.cdMs, fx.color)
  },

  tether: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by < 0) return
    for (const t of at.targets ?? []) if (t !== by) spawnTether(sim, src, by, t, fx.ms, fx.range, fx.color, fx.onHold, fx.onBreak)
  },

  recall: (sim, src, fx) => {
    const by = casterOf(sim, src)
    if (by >= 0) recallShots(sim, by, fx.speed)
  },

  interrupt: (sim, _src, _fx, at) => {
    for (const t of at.targets ?? []) if (!hasMark(sim, t, MARK.unstoppable)) interrupt(sim, t)
  },

  warp: (sim, src, fx, at) => {
    const a = at.angle ?? 0
    const dx = Math.cos(a) * fx.distance
    const dy = Math.sin(a) * fx.distance
    const list: number[] = []
    if (fx.allies) eachAlly(sim, src.faction, at.x, at.y, Infinity, false, (t) => void list.push(t), src.realm)
    else list.push(...(at.targets ?? []))
    for (const t of list) {
      const x0 = Transform.x[t]!
      const y0 = Transform.y[t]!
      if (!displace(sim, t, { kind: 'place', x: x0 + dx, y: y0 + dy }, { self: false, free: true })) continue
      spawnFxCircle(sim, x0, y0, Radius.v[t]! * 1.6, { fill: 0x9575cd, fillAlpha: 0.45, fromScale: 1, toScale: 0.2, durationMs: 260, depth: 14 })
      spawnFxCircle(sim, Transform.x[t]!, Transform.y[t]!, Radius.v[t]! * 1.6, { fill: 0x9575cd, fillAlpha: 0.45, fromScale: 0.2, toScale: 1.5, durationMs: 300, depth: 14 })
    }
  },

  drag: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by < 0) return
    const until = sim.elapsedMs + fx.ms
    for (const t of at.targets ?? []) {
      if (t === by) continue
      const d = sim.hooks.worldDelta(sim, Transform.x[by]!, Transform.y[by]!, Transform.x[t]!, Transform.y[t]!)
      const len = Math.hypot(d.x, d.y) || 1
      const r = Radius.v[by]! + Radius.v[t]! + 4
      if (!displace(sim, t, { kind: 'follow', host: by, ox: (d.x / len) * r, oy: (d.y / len) * r, ms: fx.ms }, { self: false, src })) continue
      addCc(sim, t, MARK.stun, until)
      interrupt(sim, t)
    }
  },

  realm: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by < 0 || t === undefined || t === by) return
    const until = sim.elapsedMs + fx.ms
    const id = Uid.v[by]!
    addMark(by, MARK.realm, TAG.effect, until, 0, 0, 0, id)
    addMark(t, MARK.realm, TAG.effect, until, 0, 0, 0, id)
    spawnFxCircle(sim, Transform.x[t]!, Transform.y[t]!, 60, { fill: 0x4a148c, fillAlpha: 0.5, fromScale: 0.2, toScale: 1.4, durationMs: 400, depth: 14 })
  },

  undead: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Hp, (t) => {
      Hp.v[t] = Math.max(1, Hp.max[t]! * fx.hpRatio)
      addMark(t, MARK.undead, TAG.effect, until, Hp.v[t]! / (fx.ms / 1000))
    })
  },
}

/** 一组效果依次施加：每一条都只施于编号未变的目标，前一条打死而被复用的编号不再吃后面的 */
export function applyAbilityEffects(sim: Sim, src: Source, effects: readonly Effect[] | undefined, at: HitCtx): void {
  if (!effects) return
  const targets = at.targets
  const uids = targets && effects.length > 1 ? targets.map((t) => Uid.v[t]!) : undefined
  const same = (t: number, i: number): boolean => isSameEntity(sim.world, t, uids![i]!)
  for (const fx of effects) {
    const changed = targets !== undefined && uids !== undefined && !targets.every(same)
    applyEffect(sim, src, fx, changed ? { ...at, targets: targets.filter(same) } : at)
  }
}

function applyEffect<K extends keyof EffectOf>(sim: Sim, src: Source, fx: EffectOf[K] & { readonly kind: K }, at: HitCtx): void {
  EFFECT_KINDS[fx.kind](sim, src, fx, at)
}
