import type { MapDefaults } from '../src/types/maps'

// 单位：格；每图 size 可覆盖 width/height
export const MAP_DEFAULTS = {
  width: 25,
  height: 25,
  cameraMargin: 2,
} as const satisfies MapDefaults
