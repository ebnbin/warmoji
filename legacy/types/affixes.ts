import type affixesJson from '../assets/affixes.json'
import type { BodyReaction } from './enemies'
import type { StatMods } from './stats'
import type { ElementId } from './elements'
import type { StatusLook } from './statuses'

export type AffixId = keyof typeof affixesJson

/** 精英词缀：属性折进精英那一层，反应加在这只精英身上（死亡反应并进它原有的那一条），element 换掉它本身的元素；look 是它身上一直带着的样子，icon 只在图鉴里 */
export interface AffixDef {
  readonly name: string
  readonly icon: string
  readonly desc: string
  readonly stats?: StatMods
  readonly reactions?: readonly Exclude<BodyReaction, { readonly on: 'idle' }>[]
  readonly element?: ElementId
  readonly look?: StatusLook
}
