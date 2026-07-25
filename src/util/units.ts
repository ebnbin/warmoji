// 保底可视区：横屏 1280×720，竖屏 720×1280；多余空间向两侧扩展显示更多地图
export const VIEW = { minLong: 1280, minShort: 720 } as const

// 1 单位 = 标准实体（player）的尺寸；锚定：最小视口长边容纳 20 个单位
export const UNIT = VIEW.minLong / 20

/** 点击容差（逻辑 px）：按下到抬起位移小于它仍算点击。手机 fitScale≈0.5，
 * 20 逻辑 px ≈ 10 CSS px——快速拇指点按的晃动上限（实测 10 逻辑 px 大量吃点击） */
export const TAP_SLOP = 20

/** 角度数值参数一律为度（0–360），引擎侧做三角运算时就地 ×DEG2RAD 换算 */
export const DEG2RAD = Math.PI / 180
