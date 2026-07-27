/** 一条批绘深度带：本带只画 Depth.z ∈ [zMin, zMax) 的东西，整带落在一个 Phaser depth 上 */
export interface Band {
  readonly depth: number
  readonly zMin: number
  readonly zMax: number
}

// 批绘的深度分带（纯数据，不碰 Phaser）。
//
// 分带是必需的：一个批绘对象只有一个 depth，它画的东西全落在那一层——而 ECS 的实体
// 要与场景侧那些没批绘的 Phaser 图元（地面效果、断壁、缩圈、天体车道、血条…）前后穿插。
// 每带一个批绘对象，depth 取旧实现该层的值。
//
// 两张表**共用同一个 Phaser depth 轴**，改任何一张都要照着另一张看一眼：
//
//   Phaser depth │ 精灵带 (z)        │ 形状带 (z)      │ 场景侧裸图元
//   ─────────────┼───────────────────┼─────────────────┼──────────────────
//    1           │ 装饰 (-∞,2)       │                 │
//    2           │                   │                 │ 缩圈
//    3           │ 金币 [2,4)        │                 │ 天体预警车道、传送门
//    5           │ 敌人/预告 [4,6)   │                 │ 断壁石块
//    6           │ 敌弹/碎片 [6,7)   │                 │
//    7           │ Boss [7,8)        │ 冲击环/光束外层  │
//    8           │ 我方弹/队员 [8,30)│ 光束白芯 [8,9)  │
//    9           │ 💥 爆裂 [30,60)   │                 │
//   11/12        │                   │                 │ 血条
//   14           │                   │ 闪电/斩击 [9,∞) │
//   50           │                   │                 │ 伤害飘字（自成一层）
//   60           │ 天体球体 [60,∞)   │                 │
//
// 同一个 Phaser depth 上有两个对象时（如 8），先后由加入显示列表的次序决定。

/** 精灵批绘的分带（走 EcsSpriteBatch） */
export const SPRITE_BANDS: readonly Band[] = [
  { depth: 1, zMin: -Infinity, zMax: 2 }, // 装饰
  { depth: 3, zMin: 2, zMax: 4 }, // 金币
  { depth: 5, zMin: 4, zMax: 6 }, // 敌人 / 刷怪预告
  { depth: 6, zMin: 6, zMax: 7 }, // 敌弹 / 死亡碎片
  { depth: 7, zMin: 7, zMax: 8 }, // Boss
  { depth: 8, zMin: 8, zMax: 30 }, // 我方弹 / 被保护中心 / 队员
  { depth: 9, zMin: 30, zMax: 60 }, // 💥 爆裂（压在全部精灵之上、血条之下）
  { depth: 60, zMin: 60, zMax: Infinity }, // 天体横扫的球体（压在血条之上）
]

/** 形状批绘的分带（走 EcsShapeBatch）。三条带覆盖整个实数轴，不会有特效被静默丢掉 */
export const SHAPE_BANDS: readonly Band[] = [
  { depth: 7, zMin: -Infinity, zMax: 8 }, // 冲击环、光束外层
  { depth: 8, zMin: 8, zMax: 9 }, // 光束白芯、部分圆
  { depth: 14, zMin: 9, zMax: Infinity }, // 闪电、斩击、高层圆
]
