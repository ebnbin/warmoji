import type { FeelTuning } from '../src/battle/config'

// 战斗表现与手感数值（创作层·不进运行时 bundle）：队员跟随弹簧、待机游移、受击抖屏。
// 逻辑在战斗引擎（BaseArenaScene）；这里只放设计数值，经 gen 校验产出 feel.json。
export const FEEL = {
  // 跟随惯性：队员用轻微欠阻尼弹簧追自己的岗位，起步慢半拍、急停带一点回弹。
  // kBase 弹簧刚度（1/s²）；kJitter 按槽位抖动刚度让各队员步调不齐；zeta<1 轻微过冲；
  // maxLag 拖拽距离上限（px）：高速移动时不被甩得太远。
  follow: { kBase: 230, kJitter: 0.3, zeta: 0.86, maxLag: 60 },
  // 待机游移：静止且探测范围内无敌时，绕岗位做缓慢李萨如漂移（radius 幅度、freqX/Y 频率、rampMs 幅度淡入淡出时长）。
  wander: { radius: 6, freqX: 0.8, freqY: 1.13, rampMs: 350 },
  // 角色受击时的相机震动（durationMs 时长、intensity 强度）。
  hitShake: { durationMs: 60, intensity: 0.0012 },
} as const satisfies FeelTuning
