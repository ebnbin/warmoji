import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import { fromJson } from './json'
import type { AbilityDef, Effect } from '../types/abilityDefs'
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
    case 'caster':
    case 'area':
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
    default:
      return []
  }
}

/** 能力直接带的效果：命中、自身、出手前、击杀、强化、弹匣末发，领域还有脉冲、到期与停留 */
export function abilityEffects(a: AbilityDef): readonly EffectList[] {
  const s = a.shape
  const zone = s.kind === 'zone' ? [s.pulse?.onHit, s.onExpire, s.dwell?.effects] : []
  return [a.onHit, a.onSelf, a.onCast, a.onKill, a.boost?.onHit, a.ammo?.last, ...zone]
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
