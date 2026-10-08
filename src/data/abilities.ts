import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import { fromJson } from './json'
import type { AbilityDef, Effect, Reaction, ReactionOn } from '../types/abilityDefs'
import type { AbilityId, CombatTuning } from '../types/abilities'

const CT = fromJson<CombatTuning>(combatJson)
export const KNOCKBACK = CT.knockback
export const ENEMY_BODY = CT.enemyBody
export const MINION_BODY = CT.minionBody
export const BODY_MAX_SPEED = CT.knockback.maxSpeed
/** 击退位移 = 冲量 × 身体时间常数 */
export const KNOCKBACK_TAU_MS = (ENEMY_BODY.mass / (ENEMY_BODY.drag * ENEMY_BODY.grip)) * 1000
export const ACQUIRE = CT.acquire
export const PICKUP_BODY = CT.pickupBody
export const SHARD_BODY = CT.shardBody
export const SWARM_SPAN = CT.swarmSpan
export const MORPH = CT.morph
export const BLINK_IFRAME_PAD_MS = CT.blinkIframePadMs
export const TRANSIT_MS = CT.transitMs
export const FOLLOW_IN_MS = CT.followInMs
export const MINION_FIRST_SHOT_MS = CT.minionFirstShotMs
export const ARMOR_HALF = CT.armorHalf
export const LIFESTEAL_CAP_PER_SEC = CT.lifestealCapPerSec

export const ABILITIES = fromJson<Record<AbilityId, AbilityDef>>(abilitiesJson)

/** 空袭从天而降，不看遮挡 */
export function abilityPiercesWalls(def: AbilityDef): boolean {
  return def.shape.kind === 'drop' || ('piercesWalls' in def && def.piercesWalls === true)
}

type EffectList = readonly Effect[] | undefined

/** 效果里嵌着的效果 */
export function childEffects(fx: Effect): readonly EffectList[] {
  switch (fx.kind) {
    case 'spawnProjectile':
      return [fx.onHit]
    case 'if':
      return [fx.then, fx.else]
    case 'stack':
    case 'fuse':
    case 'store':
    case 'deathMark':
    case 'empower':
    case 'to':
    case 'chance':
    case 'parry':
    case 'teleport':
      return [fx.then]
    case 'form':
      return [fx.onEnd]
    case 'clone':
      return [fx.onDeath]
    case 'shove':
      return [fx.onWall]
    case 'throw':
    case 'knockup':
      return [fx.onLand]
    case 'ground':
      return [fx.def.effects, fx.def.onExpire, fx.def.dwell?.effects]
    case 'barrier':
      return [fx.onCross]
    case 'tether':
      return [fx.onHold, fx.onBreak]
    case 'damage':
    case 'hpDamage':
    case 'blast':
    case 'poison':
    case 'heal':
    case 'healRatio':
    case 'revive':
    case 'reviveCut':
    case 'undead':
    case 'stun':
    case 'root':
    case 'silence':
    case 'disarm':
    case 'grounded':
    case 'fear':
    case 'charm':
    case 'berserk':
    case 'stasis':
    case 'taunt':
    case 'sleep':
    case 'slow':
    case 'attackSlow':
    case 'morph':
    case 'exhaust':
    case 'interrupt':
    case 'timeStop':
    case 'buff':
    case 'guard':
    case 'invuln':
    case 'untargetable':
    case 'unstoppable':
    case 'cleanse':
    case 'spellShield':
    case 'frontGuard':
    case 'undying':
    case 'hide':
    case 'stealth':
    case 'reveal':
    case 'grow':
    case 'pull':
    case 'swap':
    case 'warp':
    case 'drag':
    case 'attach':
    case 'rewind':
    case 'realm':
    case 'devour':
    case 'detonate':
    case 'refresh':
    case 'gain':
    case 'portal':
    case 'spawn':
    case 'raise':
    case 'shadow':
    case 'shadowSwap':
    case 'recall':
    case 'steal':
    case 'coins':
    case 'interest':
    case 'vanish':
    case 'status':
      return []
    default:
      return unlisted(fx)
  }
}

/** 新效果须在上面写明套不套效果：漏写编译不过 */
function unlisted(fx: never): never {
  throw new Error(`效果没有登记套着的效果：${JSON.stringify(fx)}`)
}

/** 能力直接带的效果：命中、各条反应、强化、弹匣末发，领域还有脉冲、到期与停留 */
export function abilityEffects(a: AbilityDef): readonly EffectList[] {
  const s = a.shape
  const zone = s.kind === 'zone' ? [s.pulse?.onHit, s.onExpire, s.dwell?.effects] : []
  return [a.onHit, ...(a.reactions ?? []).map((r) => r.effects), a.boost?.onHit, a.ammo?.last, ...zone]
}

/** 一组反应里 on 这件事的，连成一串效果：带条件的套上 if，带几率的套上 chance；一条都没有返回 undefined */
export function reactionEffects(list: readonly Reaction[] | undefined, on: ReactionOn): readonly Effect[] | undefined {
  const hits = (list ?? []).filter((r) => r.on === on)
  if (hits.length === 0) return undefined
  if (hits.length === 1 && !hits[0]!.if && !('chance' in hits[0]! && hits[0].chance !== undefined)) return hits[0]!.effects
  return hits.flatMap((r): Effect[] => {
    const gated: Effect[] = r.if ? [{ kind: 'if', when: r.if, then: r.effects }] : [...r.effects]
    return 'chance' in r && r.chance !== undefined ? [{ kind: 'chance', p: r.chance, then: gated }] : gated
  })
}

/** 能力里套着的能力：下一段、轮换的招式、装置出手用的 */
export function childAbilities(a: AbilityDef): readonly AbilityDef[] {
  return [...(a.recast ? [a.recast.ability] : []), ...(a.cycle ?? []), ...(a.shape.kind === 'emplace' ? [a.shape.ability] : [])]
}

/** 尾随的施法锚点落在宿主多久前走过的地方 */
export const PET_TRAIL_MS = 1500

/** 能力要回看多久的路：倒带回看的最长时长，连同套着的能力；不倒带为 0 */
export function rewindMs(a: AbilityDef): number {
  let ms = 0
  const walk = (list: EffectList): void => {
    for (const fx of list ?? []) {
      if (fx.kind === 'rewind') ms = Math.max(ms, fx.ms)
      for (const c of childEffects(fx)) walk(c)
    }
  }
  for (const list of abilityEffects(a)) walk(list)
  for (const c of childAbilities(a)) ms = Math.max(ms, rewindMs(c))
  return ms
}
