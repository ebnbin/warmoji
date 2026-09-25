import type captainsJson from '../assets/captains.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'

interface CaptainSkillOf<A> {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
  readonly abilities: readonly A[]
}
interface CaptainOf<A> {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly skill: CaptainSkillOf<A>
  readonly teamSize: number
  readonly moveSpeed: number
  readonly coinMagnet: number
  readonly hpMul: number
  readonly reviveMul: number
  readonly startWave: number
  readonly startCoins: number
  readonly xpGainMul: number
  readonly reviveInShop: boolean
  readonly freeRefreshes: number
  readonly firstWaveShop: boolean
}
export type CaptainSource = CaptainOf<AbilityId>
export type CaptainDef = CaptainOf<AbilityDef>
export type CaptainId = keyof typeof captainsJson
