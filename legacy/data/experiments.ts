import experimentsJson from '../assets/experiments.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { ExperimentDef, ExperimentId } from '../types/runs'

export const EXPERIMENTS = fromJson<Record<ExperimentId, ExperimentDef>>(experimentsJson)

export const EXPERIMENT_IDS: readonly ExperimentId[] = keysOf(EXPERIMENTS)
