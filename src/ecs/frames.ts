import type { AnimClipId } from '../types/anim'
import type { OutlineKind } from '../emoji/svg'

export interface FrameIndex {
  index(id: string, outline: OutlineKind | undefined): number
  clip(id: string, outline: OutlineKind | undefined, clipId: AnimClipId): { base: number; frames: number }
}
