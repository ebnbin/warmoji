export const VIEW = { minLong: 1280, minShort: 720 } as const

export const UNIT = VIEW.minLong / 20

/** 沙盒地图都画在边长 FRAME_U 格的方框里：左上角是世界原点，队伍出生在正中，方框外只剩纯色背景 */
export const FRAME_U = 48

/** 方框四边各留 SAFE_U 格给 HUD、刘海与导航条：能走的地方与地图的边都在这一圈以内 */
export const SAFE_U = 6

/** 出生点四周至少空出这么多格：队伍开局站得开 */
export const SPAWN_CLEAR_U = 4

export const TAP_SLOP = 20

export const DEG2RAD = Math.PI / 180
