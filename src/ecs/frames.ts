import type { OutlineKind } from '../emoji/svg'

export interface FrameIndex {
  index(id: string, outline: OutlineKind | undefined): number
}
