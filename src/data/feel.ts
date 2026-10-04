import feelJson from '../assets/feel.json'
import { fromJson } from './json'
import type { FeelTuning } from '../types/feel'

const FEEL = fromJson<FeelTuning>(feelJson)
export const SQUAD = FEEL.squad
export const HIT_SHAKE = FEEL.hitShake
export const POP = FEEL.pop
export const DOWN = FEEL.down
export const REJOIN = FEEL.rejoin
export const EMPLACE = FEEL.emplace
export const ENTRANCE = FEEL.entrance
