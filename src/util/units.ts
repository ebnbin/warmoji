// 保底可视区；多余空间向两侧扩展
export const VIEW = { minLong: 1280, minShort: 720 } as const

// 1 单位 = 标准实体（player）的尺寸；锚定：最小视口长边容纳 20 个单位
export const UNIT = VIEW.minLong / 20

/** 逻辑 px；≈ 10 CSS px，再小会吃掉快速点按 */
export const TAP_SLOP = 20

/** 数据里的角度一律为度 */
export const DEG2RAD = Math.PI / 180
