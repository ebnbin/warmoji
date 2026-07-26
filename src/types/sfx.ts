import sfxJson from '../assets/sfx.json'

export type Wave = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise'
export interface SfxDef {
  wave: Wave
  /** 起始频率 Hz（noise 时为低通滤波截止频率） */
  freq: number
  /** 结束频率（缺省 = 无滑移） */
  freqEnd?: number
  /** 时长（秒） */
  duration: number
  /** 峰值音量 0..1 */
  volume: number
  /** 起音时长（秒，线性淡入，默认 5ms 防爆点） */
  attack?: number
  /** 衰减曲线指数：1 线性，越大收尾越快（默认 1.6） */
  decayPow?: number
  /** 琶音：时长均分 N 段，各段频率乘以对应倍率 */
  steps?: readonly number[]
  /** 同种音效连播最小间隔 ms */
  throttleMs?: number
  /** 随机音高抖动（±比例） */
  jitter?: number
}
// 音效表：数据行在 defs/sfx.ts（创作层），npm run gen 校验并生成 sfx.json
export type SfxId = keyof typeof sfxJson
