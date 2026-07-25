import type { CircleCue } from '../../war/abilities/cues'

// 一次性战斗特效的帧末队列：纯逻辑侧只描述「放一个什么样的特效」，绘制留到场景侧排空。
// 能力系统因此不碰 Phaser，headless 也能跑完整逻辑。

export type Cue =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number; readonly o: CircleCue }
  | { readonly kind: 'screenFlash'; readonly color: number; readonly alpha: number; readonly durationMs: number }
  | { readonly kind: 'boom'; readonly x: number; readonly y: number; readonly size: number }
  | { readonly kind: 'lightning'; readonly points: readonly { x: number; y: number }[]; readonly color: number }
  | {
      readonly kind: 'beam'
      readonly x: number
      readonly y: number
      readonly angle: number
      readonly length: number
      readonly radius: number
      readonly color: number
    }
  | {
      readonly kind: 'slash'
      readonly x: number
      readonly y: number
      readonly angle: number
      readonly radius: number
    }
