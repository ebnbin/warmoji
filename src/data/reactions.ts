import type { Cond, Effect } from '../types/abilityDefs'
import type { BodyReaction, BodyRules, DeathEffect, UnitBase } from '../types/enemies'

interface Gated {
  readonly on: string
  readonly if?: Cond
  readonly chance?: number
  readonly effects: readonly Effect[]
}

/** 一组反应里 on 这件事的，连成一串效果：带条件的套上 if，带几率的套上 chance；一条都没有返回 undefined */
export function reactionEffects<R extends Gated>(list: readonly R[] | undefined, on: R['on']): readonly Effect[] | undefined {
  const hits = (list ?? []).filter((r) => r.on === on)
  if (hits.length === 0) return undefined
  if (hits.length === 1 && !hits[0]!.if && hits[0]!.chance === undefined) return hits[0]!.effects
  return hits.flatMap((r): Effect[] => {
    const gated: Effect[] = r.if ? [{ kind: 'if', when: r.if, then: r.effects }] : [...r.effects]
    return r.chance !== undefined ? [{ kind: 'chance', p: r.chance, then: gated }] : gated
  })
}

type Living = Exclude<BodyReaction, { readonly on: 'death' }>

const compiled = new WeakMap<UnitBase, BodyRules>()

/** 单位的反应按事件编成规则表，同一份定义只编一次 */
export function rulesOf(unit: UnitBase): BodyRules {
  const hit = compiled.get(unit)
  if (hit) return hit
  const all = unit.reactions ?? []
  const list = all.filter((r): r is Living => r.on !== 'death')
  const lows = list.filter((r): r is Extract<Living, { readonly on: 'lowHp' }> => r.on === 'lowHp').sort((a, b) => b.ratio - a.ratio)
  const idle = list.find((r): r is Extract<Living, { readonly on: 'idle' }> => r.on === 'idle')
  const rules: BodyRules = {
    resource: unit.resource,
    onLethal: reactionEffects(list, 'lethal'),
    onLowHp: lows.length > 0 ? lows.map((r) => ({ ratio: r.ratio, effects: reactionEffects([r], 'lowHp')! })) : undefined,
    onIdle: idle && { ms: idle.ms, still: idle.still, effects: reactionEffects(list, 'idle')! },
    onHurt: reactionEffects(list, 'hurt'),
    onTouched: reactionEffects(list, 'touched'),
    onTouch: reactionEffects(list, 'touch'),
    onKill: reactionEffects(list, 'kill'),
    onDeath: all.find((r) => r.on === 'death')?.effects,
    onAnchorLost: reactionEffects(list, 'anchorLost'),
  }
  compiled.set(unit, rules)
  return rules
}

/** 去掉这几种事件的反应 */
export function without(list: readonly BodyReaction[] | undefined, ons: readonly BodyReaction['on'][]): readonly BodyReaction[] {
  return (list ?? []).filter((r) => !ons.includes(r.on))
}

/** 换掉死亡反应，给了 effects 就换成它 */
export function withDeath<T extends UnitBase>(unit: T, effects: readonly DeathEffect[] | undefined): T {
  return { ...unit, reactions: [...without(unit.reactions, ['death']), ...(effects ? [{ on: 'death', to: 'spot', effects } as const] : [])] }
}

/** 挂上精英词缀的反应：接在原有的后面，死亡反应并成一条 */
export function withAffixes<T extends UnitBase>(unit: T, affixes: readonly { readonly reactions?: readonly BodyReaction[] }[]): T {
  const reactions = [...(unit.reactions ?? []), ...affixes.flatMap((a) => a.reactions ?? [])]
  const death = reactions.flatMap((r) => (r.on === 'death' ? r.effects : []))
  return withDeath({ ...unit, reactions }, death.length > 0 ? death : undefined)
}
