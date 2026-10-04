export const VIEW = { minLong: 1280, minShort: 720 } as const

export const UNIT = VIEW.minLong / 20

/** 离地一米，画面上抬起多少像素：立着画的东西离地多高都按它抬 */
export const LIFT_PER_M = UNIT * 0.5

export const TAP_SLOP = 20

export const DEG2RAD = Math.PI / 180
