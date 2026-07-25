import type { OutlineKind } from '../emoji/svg'

/** 帧索引表：emoji + 描边 → atlas 变体下标。实体装配只需要这一条渲染侧信息，
 * 纯逻辑系统据此建实体而不必认识 atlas / Phaser（EcsAtlas 天然满足） */
export interface FrameIndex {
  index(id: string, outline: OutlineKind): number
  /** clip → 帧基址与帧数；帧数 0 表示尚未烘好（调用方保持静态帧） */
  clip(id: string, outline: OutlineKind, clipId: string): { base: number; frames: number }
}
