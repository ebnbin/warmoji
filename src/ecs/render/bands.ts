interface Band {
  readonly depth: number
  readonly zMin: number
  readonly zMax: number
}

/** z 低于它的精灵平躺在地上（布景），往上的都立着 */
export const LYING_Z = 2

export const SPRITE_BANDS: readonly Band[] = [
  { depth: 1, zMin: -Infinity, zMax: LYING_Z },
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
