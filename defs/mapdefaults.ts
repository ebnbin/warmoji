import type { MapDefaults } from '../src/types/maps'

// 有界地图缺省几何（创作层）：缺省尺寸（格）+ 相机滚动外扩圈（格）。
// 每图 size.w/h 可覆盖尺寸。经 gen 校验产出 mapdefaults.json。
export const MAP_DEFAULTS = {
  width: 25,
  height: 25,
  cameraMargin: 2,
} as const satisfies MapDefaults
