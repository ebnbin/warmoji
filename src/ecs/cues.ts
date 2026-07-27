// 一次性战斗特效里**没能变成实体的那两种**的帧末队列。
//
// 圆 / 光束 / 闪电 / 斩击都已是实体（entities/fx.ts），机制侧直接建实体、不再入队。
// 剩下这两种是渲染层专属：💥 爆裂是图集贴图不是形状（走不了三角批），全屏闪是
// 一块屏幕固定的矩形——它根本不在世界坐标里，做不成世界实体。

export type Cue =
  | { readonly kind: 'screenFlash'; readonly color: number; readonly alpha: number; readonly durationMs: number }
  | { readonly kind: 'boom'; readonly x: number; readonly y: number; readonly size: number }
