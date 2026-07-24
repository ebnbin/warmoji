import feelJson from '../assets/feel.json'

// 战斗引擎的表现与手感数值：队员跟随弹簧、待机游移、受击抖屏。
// 数据行在 defs/feel.ts（创作层），npm run gen 校验并产出 src/assets/feel.json；
// 本文件只从中派生惯用导出 FOLLOW/WANDER/HIT_SHAKE，形状与数值不变。
export interface FeelTuning {
  /** 跟随惯性：队员用轻微欠阻尼弹簧追岗位 */
  readonly follow: {
    /** 弹簧刚度（1/s²） */
    readonly kBase: number
    /** 按槽位抖动刚度，让各队员步调不齐 */
    readonly kJitter: number
    /** 阻尼比 <1 → 轻微过冲 */
    readonly zeta: number
    /** 拖拽距离上限（px）：高速移动时不被甩得太远 */
    readonly maxLag: number
  }
  /** 待机游移：绕岗位做缓慢李萨如漂移 */
  readonly wander: {
    readonly radius: number
    readonly freqX: number
    readonly freqY: number
    /** 幅度淡入淡出时长 */
    readonly rampMs: number
  }
  /** 角色受击时的相机震动 */
  readonly hitShake: { readonly durationMs: number; readonly intensity: number }
}

const FEEL = feelJson as unknown as FeelTuning
export const FOLLOW = FEEL.follow
export const WANDER = FEEL.wander
export const HIT_SHAKE = FEEL.hitShake
