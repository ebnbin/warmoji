import type { AnimClipId } from '../types/anim'

export interface FrameIndex {
  index(id: string): number
  clip(id: string, clipId: AnimClipId): { base: number; frames: number }
}
