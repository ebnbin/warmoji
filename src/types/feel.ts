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
  /** 环形阵轨道动力学：队员按秉性 × 探测范围内敌情沿环滑动避敌/迎敌 */
  readonly orbit: {
    /** 敌人进入该距离（单位，从角色自身量起）才产生移动倾向 */
    readonly detectRange: number
    /** 沿环最大角速度（rad/s） */
    readonly maxSpeed: number
    /** 避敌倾向增益 */
    readonly avoidGain: number
    /** 迎敌倾向增益 */
    readonly seekGain: number
  }
}
