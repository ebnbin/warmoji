import feelJson from '../assets/feel.json'
import type { FeelTuning } from '../types/feel'

const FEEL = feelJson as unknown as FeelTuning
export const FOLLOW = FEEL.follow
export const WANDER = FEEL.wander
export const HIT_SHAKE = FEEL.hitShake
/** 环形阵轨道参数（转速上限等）；动力学算法在两套战斗实现各自的 orbit（ecs/utils/orbit、arcade/orbit） */
export const ORBIT = FEEL.orbit
