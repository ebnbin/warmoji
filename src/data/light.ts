/** 画面里的太阳：从左上方斜照下来，x、y 是屏幕上的水平分量，z 朝上；地图与新画风 emoji 共用这一个方向 */
export const SUN = { x: -0.45, y: -0.6, z: 0.66 } as const

/** 背着太阳的方向，画面上的单位向量：离地的东西的影子都往这边落 */
export const AWAY = { x: -SUN.x / Math.hypot(SUN.x, SUN.y), y: -SUN.y / Math.hypot(SUN.x, SUN.y) } as const
