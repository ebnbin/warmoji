import feelJson from '../assets/feel.json'
import { fromJson } from './json'
import type { FeelTuning } from '../types/feel'

const FEEL = fromJson<FeelTuning>(feelJson)
export const FOLLOW = FEEL.follow
export const SQUAD = FEEL.squad
export const HIT_SHAKE = FEEL.hitShake
