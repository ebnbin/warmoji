import { hasComponent } from 'bitecs'
import type { Effect } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { Alive, Enemy, FACTION, Hp, MARK, Mark, Radius, Revive, TAG, Transform, Uid } from '../../components'
import { addMark, CC_MARKS, hasMark, markSlot } from '../../utils/marks'
import { Interned } from '../../utils/intern'
import { displace } from './displace'
import { poisonSrc } from '../../store'
import { applyMorph } from '../../entities/enemy'
import { spawnBolt } from '../../entities/projectile'
import { spawnZone } from '../../entities/zone'
import { spawnCoins } from '../../entities/pickup'
import { hit } from './damage'
import { despawnEnemy, grantIframe, reviveCharacter } from './combat'
import { interrupt } from './ability'
import { healAllies } from './heal'
import { nearestAngle, nearestTarget, targetsWithin } from '../../utils/targets'
import { flying } from '../../utils/source'
import { isSameEntity } from '../../utils/identity'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import type { ByKind } from '../../../util/record'
import { spawnFxRing } from '../../entities/fx'

interface HitCtx {
  readonly x: number
  readonly y: number
  readonly baseDamage: number
  readonly targets?: readonly number[]
  readonly exclude?: ReadonlySet<number>
  readonly source?: number
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

/** 招架时施于出手者的效果，按号存在标记里 */
export const PARRY_FX = new Interned<readonly Effect[]>()

/** 出手的身体还在就返回它，否则 -1 */
export function casterOf(sim: Sim, src: Source): number {
  const b = src.body
  return b !== undefined && isSameEntity(sim.world, b, src.bodyUid ?? 0) && Alive.v[b] ? b : -1
}

/** 加一条控制：霸体的身体不吃 */
function addCc(sim: Sim, t: number, kind: number, until: number, a = 0, b = 0, c = 0, ref = 0): boolean {
  if (hasMark(sim, t, MARK.unstoppable)) return false
  return addMark(t, kind, TAG.effect, until, a, b, c, ref) >= 0
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
export function applyOnHit(sim: Sim, src: Source, effects: readonly Effect[] | undefined, x: number, y: number, baseDamage: number, struck: readonly Struck[]): void {
  if (!effects || struck.length === 0) return
  const live = struck.filter((s) => isSameEntity(sim.world, s.eid, s.uid)).map((s) => s.eid)
  applyAbilityEffects(sim, src, effects, { x, y, baseDamage, targets: live, exclude: new Set(live) })
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
    eachCapable(sim, at, Enemy, (t) => applyMorph(sim, sim.frames, t, fx))
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
    const dmg = Math.max(1, Math.round(fx.amount * src.dmgMul))
    for (const t of at.targets ?? []) hit(sim, src, t, dmg)
  },

  stun: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Mark, (t) => {
      addMark(t, MARK.stun, TAG.effect, until)
      interrupt(sim, t)
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
    eachCapable(sim, at, Mark, (t) => addMark(t, MARK.taunt, TAG.effect, until, by, 0, 0, Uid.v[by]!))
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
      if (displace(sim, t, { kind: 'arc', x: Transform.x[t]!, y: Transform.y[t]!, ms: fx.durationMs, height: fx.height }, { self: false, src })) interrupt(sim, t)
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

  swap: (sim, src, _fx, at) => {
    const by = casterOf(sim, src)
    const t = at.targets?.[0]
    if (by < 0 || t === undefined || t === by || hasMark(sim, t, MARK.unstoppable)) return
    const bx = Transform.x[by]!
    const byy = Transform.y[by]!
    if (!displace(sim, t, { kind: 'place', x: bx, y: byy }, { self: false, src })) return
    displace(sim, by, { kind: 'place', x: at.x, y: at.y }, { self: true, free: true })
  },
}

export function applyAbilityEffects(sim: Sim, src: Source, effects: readonly Effect[] | undefined, at: HitCtx): void {
  if (!effects) return
  for (const fx of effects) applyEffect(sim, src, fx, at)
}

function applyEffect<K extends keyof EffectOf>(sim: Sim, src: Source, fx: EffectOf[K] & { readonly kind: K }, at: HitCtx): void {
  EFFECT_KINDS[fx.kind](sim, src, fx, at)
}
