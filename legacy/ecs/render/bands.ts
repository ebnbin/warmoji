interface Band {
  readonly depth: number
  readonly zMin: number
  readonly zMax: number
}

/** z 低于它的精灵平躺在地上，往上的都立着 */
export const LYING_Z = 2

/** z 低于它的是被地图上立着的东西挡住的身体：画在最底下，地图把挡住它们的东西画在这一层与躺着的那一层之间；它们的影子不画 */
export const UNDER_Z = -1000

/** 躺在地上的精灵与地上的布景画在这一层 */
export const LYING_DEPTH = 1

/** 脚下的圈：压在影子上面、立着的身体下面 */
export const FEET_DEPTH = 2.7

export const SPRITE_BANDS: readonly Band[] = [
  { depth: 0.5, zMin: -Infinity, zMax: UNDER_Z },
  { depth: LYING_DEPTH, zMin: UNDER_Z, zMax: LYING_Z },
  { depth: 3, zMin: LYING_Z, zMax: 4 },
  { depth: 5, zMin: 4, zMax: 6 },
  { depth: 6, zMin: 6, zMax: 7 },
  { depth: 7, zMin: 7, zMax: 8 },
  { depth: 8, zMin: 8, zMax: 30 },
  { depth: 30, zMin: 30, zMax: 60 },
  { depth: 60, zMin: 60, zMax: Infinity },
]

export const SHAPE_BANDS: readonly Band[] = [
  { depth: 7, zMin: -Infinity, zMax: 8 },
  { depth: 7.9, zMin: 8, zMax: 9 },
  { depth: 14, zMin: 9, zMax: Infinity },
]
