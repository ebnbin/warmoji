import type { AiTuning } from '../src/data/enemies'

// 敌人 AI 手感常量（创作层·与难度正交）：游荡换向节奏、定距风筝滞回带、偷币冷却、逃兵脱战限速。
// 逻辑在 steer.ts 与战斗引擎；这里只放设计数值，经 gen 校验产出 ai.json。
export const AI = {
  // 游荡换向：换向后随机等 [turnMinMs, turnMinMs+turnJitterMs) 再换；spawn* 为出生后首次换向的更短区间。
  wander: { turnMinMs: 800, turnJitterMs: 1200, spawnTurnMinMs: 600, spawnTurnJitterMs: 900 },
  // 定距风筝的站位滞回带（单位）：dist 在 standoffDist±band 内不动，band 越大越不抖。
  standoffBandU: 0.5,
  // 偷币鼠吞币冷却（ms）：贴到金币也得等这么久才吞一枚。
  coinThiefEatCdMs: 650,
  // 逃兵脱战（离玩家够远）时的游荡限速：贴脸才全速逃。
  fleeIdleSpeedMul: 0.4,
} as const satisfies AiTuning
