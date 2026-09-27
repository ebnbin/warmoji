import staminaJson from '../assets/stamina.json'
import { fromJson } from './json'
import type { StaminaTuning } from '../types/stamina'

export const STAMINA = fromJson<StaminaTuning>(staminaJson)
