import sfxJson from '../assets/sfx.json'

type Wave = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise'
export interface SfxDef {
  wave: Wave
  freq: number
  freqEnd?: number
  duration: number
  volume: number
  attack?: number
  decayPow?: number
  steps?: readonly number[]
  throttleMs?: number
  jitter?: number
}
export type SfxId = keyof typeof sfxJson
