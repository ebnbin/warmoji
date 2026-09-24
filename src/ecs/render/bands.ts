/** 一条批绘深度带：本带只画 Depth.z ∈ [zMin, zMax) 的东西，整带落在一个 Phaser depth 上 */
export interface Band {
  readonly depth: number
  readonly zMin: number
  readonly zMax: number
}

//
// 精灵带、形状带和 rings.ts 的圈带共用同一个 Phaser depth 轴，改任何一张都要对照另外两张：
//
//   Phaser depth │ 精灵带 (z)        │ 形状带 (z)      │ 场景侧裸图元
//   ─────────────┼───────────────────┼─────────────────┼──────────────────
//    1           │ 装饰 (-∞,2)       │                 │
//    2           │                   │                 │ 缩圈
//    3           │ 金币 [2,4)        │                 │ 天体预警车道、传送门
//    5           │ 敌人/预告 [4,6)   │                 │ 断壁石块
//    6           │ 敌弹/碎片 [6,7)   │                 │
//    7           │ Boss [7,8)        │ 冲击环/光束外层  │
//    7.9         │                   │ 光束白芯 [8,9)  │
//    8           │ 我方弹/队员 [8,30)│                 │
//   11/12        │                   │                 │ 血条
//   14           │                   │ 闪电/斩击 [9,∞) │
//   30           │ 空投 [30,60)      │                 │
//   50           │                   │                 │ 伤害飘字（自成一层）
//   60           │ 天体球体 [60,∞)   │                 │
//
// 圈带：地面区 2、待拾光圈 2.5、携带者光环 4。
// 同一个 Phaser depth 上有两个对象时（如 7），先后由加入显示列表的次序决定。

export const SPRITE_BANDS: readonly Band[] = [
  { depth: 1, zMin: -Infinity, zMax: 2 }, // 装饰
  { depth: 3, zMin: 2, zMax: 4 }, // 金币
  { depth: 5, zMin: 4, zMax: 6 }, // 敌人 / 刷怪预告
  { depth: 6, zMin: 6, zMax: 7 }, // 敌弹 / 死亡碎片
  { depth: 7, zMin: 7, zMax: 8 }, // Boss
  { depth: 8, zMin: 8, zMax: 30 }, // 我方弹 / 被保护中心 / 💥 爆裂 / 队员
  { depth: 30, zMin: 30, zMax: 60 }, // 空投（压在血条与闪电之上）
  { depth: 60, zMin: 60, zMax: Infinity }, // 天体横扫的球体（压在血条之上）
]

/** 三条带须覆盖整个实数轴 */
export const SHAPE_BANDS: readonly Band[] = [
  { depth: 7, zMin: -Infinity, zMax: 8 }, // 冲击环、光束外层
  { depth: 7.9, zMin: 8, zMax: 9 }, // 光束白芯、部分圆（压在队员之下）
  { depth: 14, zMin: 9, zMax: Infinity }, // 闪电、斩击、高层圆
]
