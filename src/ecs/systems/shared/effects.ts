import type { Effect, Selector } from '../../../types/abilityDefs'
import type { Found } from '../../utils/targets'
import { test } from '../../utils/cond'
import { circleHitIndices } from '../../utils/hit'
import { TRANSIT_MS } from '../../../data/abilities'
import { hasComponent, query } from 'bitecs'
import { Ability, Alive, Anchored, Boss, Cd, Charges, Elite, Enemy, FACTION, Faction, Grow, Hp, Manual, MARK, MARK_SLOTS, Mark, Owner, Radius, Revive, Stamina, Stats, TAG, Trace, Transform, Uid } from '../../components'
import { addCc, addMark, CC_MARKS, CLEANSED, isSteadfast, markSlot, statusDef } from '../../utils/marks'
import { Interned } from '../../utils/intern'
import { displace } from './displace'
import { gainRes } from './resource'
import { markSrcs } from '../../store'
import { applyMorph } from '../../entities/enemy'
import { applyForm } from '../../entities/form'
import { nearestSummoned, raiseDead, spawnAround, spawnClones } from '../../entities/summon'
import { spawnShadow, swapShadow } from '../../entities/shadow'
import { spawnBarrier } from '../../entities/barrier'
import { spawnTether } from '../../entities/tether'
import { recallShots } from './projectile'
import { rewindTrace } from './trace'
import { devour } from './gut'
import { stealAbility } from './steal'
import { spawnBolt } from '../../entities/projectile'
import { openPortals, spawnZone } from '../../entities/zone'
import { spawnCoins } from '../../entities/pickup'
import { hit } from './damage'
import { despawnEnemy, grantIframe, reviveCharacter } from './combat'
import { interrupt } from './ability'
import { bumpTenacity } from './tenacity'
import { TENACITY } from '../../../data/enemies'
import { fireAbility } from './fire'
import { grantedAbility } from '../../entities/ability'
import { healAllies, mend } from './heal'
import { eachAlly, nearestTarget, targetsWithin } from '../../utils/targets'
import { attackOf, flying } from '../../utils/source'
import { aimLayer, BLAST_M, bandAt, breachAt, covered, FLOOR, hiOf, layerZ, loOf, STANDARD } from '../../utils/pass'
import { HIT } from '../../utils/hitTags'
import { layerMul, setStatLayer } from '../../utils/stats'
import { isSameEntity } from '../../utils/identity'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import type { ByKind } from '../../../util/record'
import { spawnFxCircle, spawnFxRing } from '../../entities/fx'
import { withDeath } from '../../../data/reactions'
import { elementIndex } from '../../../data/elements'

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
  const list = covered(sim, src, x, y, targetsWithin(sim, src, x, y, radius))
  const struck: Struck[] = []
  for (const i of circleHitIndices({ x, y }, radius, list)) {
    const t = list[i]!
    if (exclude?.has(t.eid)) continue
    const s = struckOf(t.eid)
    if (hit(sim, src, t.eid, damage, { knockback, from: { x, y }, tags: HIT.area })) struck.push(s)
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

/** 加一条记着来源的标记：按来源分开记的以来源身体的编号为 ref */
export function markFrom(t: number, kind: number, until: number, a: number, b: number, src: Source): number {
  const s = addMark(t, kind, TAG.effect, until, a, b, 0, src.bodyUid ?? 0)
  if (s >= 0) (markSrcs[t] ??= [])[s - t * MARK_SLOTS] = src
  return s
}

export function markSource(t: number, s: number): Source | undefined {
  return markSrcs[t]?.[s - t * MARK_SLOTS]
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

/** 让一组标记当场失效、到期反应照常执行：到期时刻记 0，因为记成此刻会被 Float32 向上舍入而仍算生效 */
export function expireMarks(sim: Sim, eid: number, kinds: readonly number[]): void {
  for (let s = eid * MARK_SLOTS; s < (eid + 1) * MARK_SLOTS; s++) {
    if (kinds.includes(Mark.kind[s]!) && Mark.until[s]! > sim.elapsedMs) Mark.until[s] = 0
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

/** 按选择器从落点 (x, y) 选出身体：敌方是这一下打得到的，同伴按所在的界；再筛、排、取前几个 */
function select(sim: Sim, src: Source, x: number, y: number, who: Exclude<Selector, { readonly side: 'self' }>): number[] {
  let found: Found[] = []
  if (who.side === 'foes') found = covered(sim, src, x, y, targetsWithin(sim, src, x, y, who.radius))
  else eachAlly(sim, src.faction, x, y, who.radius, false, (eid, ax, ay, radius) => void found.push({ eid, x: ax, y: ay, radius }), src.realm)
  if (who.filter) {
    const self = casterOf(sim, src)
    const cond = who.filter
    found = found.filter((t) => test(sim, src, self, t.eid, cond))
  }
  if (who.sort === 'nearest') found.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
  else if (who.sort === 'weakest') found.sort((a, b) => Hp.v[a.eid]! / Hp.max[a.eid]! - Hp.v[b.eid]! / Hp.max[b.eid]!)
  const picked = found.map((t) => t.eid)
  return who.count === undefined ? picked : picked.slice(0, who.count)
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
  status: (sim, _src, fx, at) => {
    const kind = MARK[fx.status]
    const def = statusDef(kind)!
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Mark, (t) => {
      const on = def.cc ? addCc(sim, t, kind, until, fx.value ?? 0) : addMark(t, kind, TAG.effect, until, fx.value ?? 0) >= 0
      if (on && def.interrupts) interrupt(sim, t)
    })
  },

  blast: (sim, src, fx, at) => {
    applyBlast(sim, src, at.x, at.y, (fx.amount ?? 0) + at.baseDamage * (fx.ratio ?? 0), fx.radius, fx.knockback, at.exclude)
    breachAt(sim, at.x, at.y, BLAST_M, fx.radius, fx.breach ?? 0)
    if (fx.ring) spawnFxRing(sim, at.x, at.y, fx.radius, fx.ring)
  },

  slow: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.slow, TAG.effect, until, fx.factor))
  },

  poison: (sim, src, fx, at) => {
    const now = sim.elapsedMs
    const tick = fx.damage + (fx.ratio ?? 0) * at.baseDamage
    eachCapable(sim, at, Mark, (t) => {
      const s = addMark(t, MARK.poison, TAG.effect, now + fx.durationMs, tick, fx.tickMs, now + fx.tickMs)
      if (s >= 0) (markSrcs[t] ??= [])[s - t * MARK_SLOTS] = src
    })
  },

  morph: (sim, _src, fx, at) => {
    eachCapable(sim, at, Enemy, (t) => {
      if (!isSteadfast(sim, t)) applyMorph(sim, sim.frames, t, fx)
    })
  },

  imbue: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.imbue, TAG.effect, until, elementIndex(fx.element)))
  },

  attune: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.ms
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.attuned, TAG.effect, until, elementIndex(fx.element)))
  },

  shield: (sim, src, fx, at) => {
    const until = sim.elapsedMs + fx.ms
    const healing = attackOf(sim, src).healing
    eachCapable(sim, at, Mark, (t) => {
      const amount = (fx.amount + (fx.ratio ?? 0) * Hp.max[t]!) * healing
      const s = markSlot(sim, t, MARK.shield)
      if (s < 0) {
        addMark(t, MARK.shield, TAG.effect, until, amount)
        return
      }
      Mark.a[s] = Math.max(Mark.a[s]!, amount)
      Mark.until[s] = Math.max(Mark.until[s]!, until)
    })
  },

  mend: (sim, src, fx, at) => {
    const now = sim.elapsedMs
    const healing = attackOf(sim, src).healing
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.mending, TAG.effect, now + fx.durationMs, (fx.amount + (fx.ratio ?? 0) * Hp.max[t]!) * healing, fx.tickMs, now + fx.tickMs))
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
      src: { ...flying(src), tint: 0xa5d86a, band: bandAt(FLOOR) },
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
    const amount = Math.max(1, Math.round(fx.amount * attackOf(sim, src).healing))
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
      mend(best, each)
      return
    }
    for (const t of hurt) mend(t, each)
  },

  spawnProjectile: (sim, src, fx, at) => {
    const t = nearestTarget(sim, src, at.x, at.y, Infinity)
    if (!t) return
    const p = fx.projectile
    spawnBolt(sim, at.x, at.y, Math.atan2(t.y - at.y, t.x - at.x), {
      faction: src.faction,
      frame: sim.frames.index(p.look.emoji, src.faction === FACTION.enemy ? 'enemyProjectile' : 'player'),
      size: p.look.size,
      radius: p.radius,
      speed: p.speed,
      rotOffsetDeg: p.look.rotationOffsetDeg ?? 0,
      lifeMs: fx.lifeMs,
      pierce: 0,
      damage: fx.damage,
      knockback: 0,
      src: flying(src),
      onHit: fx.onHit,
      homingDeg: p.flight?.kind === 'homing' ? p.flight.degPerSec : undefined,
      linger: p.linger,
      h: layerZ(aimLayer(STANDARD[0], STANDARD[1], loOf(sim.world, t.eid), hiOf(sim.world, t.eid))),
      arc: p.flight?.kind === 'arc' ? p.flight.peakM : undefined,
      reach: Math.hypot(t.x - at.x, t.y - at.y),
      split: p.split,
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
    const dmg = fx.amount + at.baseDamage * (fx.ratio ?? 0)
    for (const t of at.targets ?? []) hit(sim, src, t, dmg)
  },

  hpDamage: (sim, src, fx, at) => {
    for (const t of at.targets ?? []) {
      if (!hasComponent(sim.world, t, Hp) || !Alive.v[t]) continue
      const dmg = Hp.v[t]! * (Boss.v[t] || Elite.v[t] ? fx.bossRatio : fx.ratio)
      if (dmg >= 1) hit(sim, src, t, dmg)
    }
  },

  stun: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => {
      if (addCc(sim, t, MARK.stun, until)) interrupt(sim, t)
    })
  },

  exhaust: (sim, _src, _fx, at) => {
    eachCapable(sim, at, Stamina, (t) => {
      Stamina.used[t] = Stats.maxStamina[t]!
      Stamina.restMs[t] = 0
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
      if (Alive.v[t]) mend(t, Hp.max[t]! * fx.ratio)
    })
  },

  invuln: (sim, _src, fx, at) => {
    eachCapable(sim, at, Mark, (t) => {
      if (Alive.v[t]) grantIframe(sim, t, fx.ms)
    })
  },

  timeStop: (sim, _src, fx) => {
    sim.timeStopMsLeft = fx.durationMs
  },

  coins: (sim, src, fx, at) => {
    if (src.faction === FACTION.team) spawnCoins(sim, at.x, at.y, fx.count)
  },

  interest: (sim, src, fx) => {
    if (src.faction === FACTION.team) sim.run.coins += Math.min(fx.max, Math.floor(sim.run.coins * fx.ratio))
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
    eachCapable(sim, at, Mark, (t) => expireMarks(sim, t, CLEANSED))
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
      if (isSteadfast(sim, t)) continue
      if (displace(sim, t, { kind: 'arc', x: Transform.x[t]!, y: Transform.y[t]!, ms: fx.durationMs, height: fx.height }, { self: false, src, onLand: fx.onLand, base: at.baseDamage })) interrupt(sim, t)
    }
  },

  shove: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const ox = by >= 0 ? Transform.x[by]! : at.x
    const oy = by >= 0 ? Transform.y[by]! : at.y
    for (const t of at.targets ?? []) {
      if (t === by || isSteadfast(sim, t)) continue
      const d = sim.hooks.worldDelta(sim, ox, oy, Transform.x[t]!, Transform.y[t]!)
      const angle = Math.atan2(d.y, d.x)
      displace(sim, t, { kind: 'dash', angle, distance: fx.distance, ms: fx.ms }, { self: false, src, onWall: fx.onWall, base: at.baseDamage })
    }
  },

  throw: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    for (const t of at.targets ?? []) {
      if (t === by || isSteadfast(sim, t)) continue
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
      const then = test(sim, src, casterOf(sim, src), t, fx.when) ? fx.then : fx.else
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
        if (Mark.kind[s] === kind && Mark.ref[s] === ref && Mark.until[s]! > sim.elapsedMs) Mark.until[s] = 0
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

  to: (sim, src, fx, at) => {
    if (fx.who.side === 'self') {
      const by = casterOf(sim, src)
      if (by >= 0) applyAbilityEffects(sim, src, fx.then, { x: Transform.x[by]!, y: Transform.y[by]!, baseDamage: at.baseDamage, targets: [by] })
      return
    }
    const picked = select(sim, src, at.x, at.y, fx.who)
    if (picked.length > 0) applyAbilityEffects(sim, src, fx.then, { ...at, targets: picked })
  },

  each: (sim, src, fx, at) => {
    for (const t of at.targets ?? []) applyAbilityEffects(sim, src, fx.then, { ...at, x: Transform.x[t]!, y: Transform.y[t]!, targets: [t] })
  },

  chance: (sim, src, fx, at) => {
    if (sim.rng.next() < fx.p) applyAbilityEffects(sim, src, fx.then, at)
  },

  swap: (sim, src, _fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by < 0 || t === undefined || t === by || isSteadfast(sim, t)) return
    const tx = Transform.x[t]!
    const ty = Transform.y[t]!
    const ms = TRANSIT_MS.swap
    if (!displace(sim, t, { kind: 'transit', x: Transform.x[by]!, y: Transform.y[by]!, ms, look: 'streak', color: 0xb388ff }, { self: false, src })) return
    displace(sim, by, { kind: 'transit', x: tx, y: ty, ms, look: 'streak', color: 0xb388ff }, { self: true, free: true })
  },

  form: (sim, _src, fx, at) => {
    eachCapable(sim, at, Hp, (t) => {
      if (Alive.v[t]) applyForm(sim, t, fx.to, fx.ms, fx.onEnd)
    })
  },

  grow: (sim, _src, fx, at) => {
    eachCapable(sim, at, Grow, (t) => {
      if (fx.ms !== undefined) addMark(t, MARK.grow, TAG.effect, sim.elapsedMs + fx.ms, fx.mul)
      else setStatLayer(t, 'grow', [{ mul: { scale: Math.min(fx.max ?? Infinity, layerMul(t, 'grow', 'scale') * fx.mul) } }])
    })
  },

  rewind: (sim, _src, fx, at) => {
    eachCapable(sim, at, Trace, (t) => rewindTrace(sim, t, fx.ms))
  },

  steal: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by >= 0 && t !== undefined) stealAbility(sim, by, t, fx.ms, fx.cooldownMs, fx.skill === true)
  },

  summon: (sim, src, fx, at) => {
    const of = fx.of
    if (of === 'victim') {
      if (at.victim !== undefined) raiseDead(sim, at.victim, src.faction, casterOf(sim, src), fx.lifeMs ?? Infinity, fx.hpRatio ?? 1, fx.onDeath)
      return
    }
    const by = casterOf(sim, src)
    if ('clone' in of) {
      if (by >= 0) spawnClones(sim, by, fx.count, fx.lifeMs ?? Infinity, fx.hpRatio ?? 1, of.clone.dmgRatio, fx.onDeath)
      return
    }
    const x = by >= 0 ? Transform.x[by]! : at.x
    const y = by >= 0 ? Transform.y[by]! : at.y
    spawnAround(sim, by, src.faction, fx.onDeath ? withDeath(of.unit, fx.onDeath) : of.unit, fx.count, of.spread, x, y, fx.lifeMs, fx.hpRatio)
  },

  cast: (sim, src, fx) => {
    const by = casterOf(sim, src)
    if (by >= 0) fireAbility(sim, grantedAbility(sim, by, fx.ability))
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

  teleport: (sim, src, fx, at) => {
    const by = casterOf(sim, src)
    if (by < 0) return
    const foe = nearestTarget(sim, flying(src), Transform.x[by]!, Transform.y[by]!, Infinity)
    const dest = nearestSummoned(sim, by, fx.of, foe?.x ?? Transform.x[by]!, foe?.y ?? Transform.y[by]!)
    if (dest < 0) return
    displace(sim, by, { kind: 'transit', x: Transform.x[dest]!, y: Transform.y[dest]! + Radius.v[dest]!, ms: TRANSIT_MS.teleport, look: 'hidden', color: 0x66bb6a }, { self: true, src, onLand: fx.then, base: at.baseDamage })
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
    for (const t of at.targets ?? []) if (!isSteadfast(sim, t) && interrupt(sim, t)) bumpTenacity(sim.world, t, TENACITY.interruptMs)
  },

  warp: (sim, src, fx, at) => {
    const a = at.angle ?? 0
    const dx = Math.cos(a) * fx.distance
    const dy = Math.sin(a) * fx.distance
    const list: number[] = []
    if (fx.allies) eachAlly(sim, src.faction, at.x, at.y, Infinity, false, (t) => void list.push(t), src.realm)
    else list.push(...(at.targets ?? []))
    for (const t of list) {
      displace(sim, t, { kind: 'transit', x: Transform.x[t]! + dx, y: Transform.y[t]! + dy, ms: TRANSIT_MS.teleport, look: 'hidden', color: 0x9575cd }, { self: false, free: true })
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
