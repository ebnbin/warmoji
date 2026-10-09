import staminaJson from '../assets/stamina.json'
import { fromJson } from './json'
import type { StaminaTuning } from '../types/stamina'

export const STAMINA = fromJson<StaminaTuning>(staminaJson)

/** 体力条的三档：够用、已经在减速、快见底 */
export type StaminaTier = 'ok' | 'slow' | 'low'

export function staminaTier(v: number): StaminaTier {
  return v >= STAMINA.slowFrom ? 'ok' : v > STAMINA.warnAt ? 'slow' : 'low'
}
