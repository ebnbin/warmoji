import type { OutlineKind } from '../emoji/svg'

/** 帧索引表：emoji + 描边 → atlas 变体下标。实体装配只需要这一条渲染侧信息，
 * 纯逻辑系统据此建实体而不必认识 atlas / Phaser（EcsAtlas 天然满足）。
 *
 * outline 为 undefined 即**不描边**——与旧路径的 emojiKey(id, outline?) 同义。
 * 类型写成 `OutlineKind | undefined` 而不是可选参数：不描边是一个要当场表态的选择，
 * 不是「忘了填」的默认值（描边同时决定阵营配色与那一圈额外的占位） */
export interface FrameIndex {
  index(id: string, outline: OutlineKind | undefined): number
  /** clip → 帧基址与帧数；帧数 0 表示尚未烘好（调用方保持静态帧） */
  clip(id: string, outline: OutlineKind | undefined, clipId: string): { base: number; frames: number }
}
