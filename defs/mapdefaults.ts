import type { MapDefaults } from '../src/types/maps'

export const MAP_DEFAULTS = {
  width: 25,
  height: 25,
  cameraMargin: 4,
} as const satisfies MapDefaults
