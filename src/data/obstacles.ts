import obstaclesJson from '../assets/obstacles.json'
import { fromJson } from './json'
import type { ObstacleDef, ObstacleId, ObstacleTuning } from '../types/obstacles'

export const OBSTACLES = fromJson<ObstacleTuning>(obstaclesJson)

export const MATERIALS = OBSTACLES.materials as Readonly<Record<ObstacleId, ObstacleDef>>
