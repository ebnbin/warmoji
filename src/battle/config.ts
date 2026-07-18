// 战斗引擎的表现与手感数值：队员跟随弹簧、待机游移、受击抖屏

// 跟随惯性：队员用轻微欠阻尼弹簧追自己的岗位，起步慢半拍、急停带一点回弹
export const FOLLOW = {
  /** 弹簧刚度（1/s²）；kJitter 按槽位抖动刚度，让各队员步调不齐 */
  kBase: 230,
  kJitter: 0.3,
  /** 阻尼比 <1 → 轻微过冲 */
  zeta: 0.86,
  /** 拖拽距离上限（px）：高速移动时不被甩得太远 */
  maxLag: 60,
} as const

// 待机游移：静止且探测范围内无敌时，绕岗位做缓慢李萨如漂移
export const WANDER = {
  radius: 6,
  freqX: 0.8,
  freqY: 1.13,
  /** 幅度淡入淡出时长 */
  rampMs: 350,
} as const

// 角色受击时的相机震动
export const HIT_SHAKE = { durationMs: 60, intensity: 0.0012 } as const
