import feelJson from '../assets/feel.json'
import type { FeelTuning } from '../types/feel'

const FEEL = feelJson as unknown as FeelTuning
export const FOLLOW = FEEL.follow
export const WANDER = FEEL.wander
export const HIT_SHAKE = FEEL.hitShake
