import type affixesJson from '../assets/affixes.json'
import type { BodyReaction } from './enemies'
import type { StatMods } from './stats'

export type AffixId = keyof typeof affixesJson

/** 精英词缀：属性折进精英那一层，反应加在这只精英身上（死亡反应并进它原有的那一条）；icon 挂在它头顶 */
export interface AffixDef {
  readonly name: string
  readonly icon: string
  readonly desc: string
  readonly stats?: StatMods
  readonly reactions?: readonly Exclude<BodyReaction, { readonly on: 'idle' }>[]
}
