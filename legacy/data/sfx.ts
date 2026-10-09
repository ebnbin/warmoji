import sfxJson from '../assets/sfx.json'
import { fromJson } from './json'
import type { SfxDef, SfxId } from '../types/sfx'

export const SFX = fromJson<Record<SfxId, SfxDef>>(sfxJson)
