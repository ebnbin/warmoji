import sfxJson from '../assets/sfx.json'
import type { SfxDef, SfxId } from '../types/sfx'

export const SFX = sfxJson as unknown as Record<SfxId, SfxDef>
