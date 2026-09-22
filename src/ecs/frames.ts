import type { OutlineKind } from '../emoji/svg'

/** emoji + 描边 → atlas 变体下标；outline 须显式传 undefined 表示不描边 */
export interface FrameIndex {
  index(id: string, outline: OutlineKind | undefined): number
  /** 帧数 0 = 尚未烘好，调用方保持静态帧 */
  clip(id: string, outline: OutlineKind | undefined, clipId: string): { base: number; frames: number }
}
