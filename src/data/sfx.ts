import sfxJson from '../assets/sfx.json'
import type { SfxDef, SfxId } from '../types/sfx'

// 音效表：数据行在 defs/sfx.ts（创作层），npm run gen 校验并生成 sfx.json。
// 只有表与形状在此——合成与播放是运行时，在 audio/sfx.ts。
// 分开是因为 data 是叶子层：能力/敌人的数据定义要引用 SfxId，不该因此拖进 WebAudio。

export const SFX = sfxJson as unknown as Record<SfxId, SfxDef>
