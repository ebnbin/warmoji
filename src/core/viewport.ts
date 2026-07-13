import { VIEW } from './config'

export interface ViewportSpec {
  cssWidth: number
  cssHeight: number
  /** 设备像素比，钳制在 [1, 3]（iPhone 普遍为 3；再高收益小、填充率代价大） */
  dpr: number
  /** css px / 逻辑 px，保证保底区完整可见的最大缩放 */
  fitScale: number
  /** 设备物理 px / 逻辑 px = fitScale * dpr，相机缩放与文本栅格化密度用它 */
  renderScale: number
  logicalWidth: number
  logicalHeight: number
}

export function computeViewport(cssWidth: number, cssHeight: number, dpr = 1): ViewportSpec {
  const w = Math.max(1, cssWidth)
  const h = Math.max(1, cssHeight)
  const d = Math.min(3, Math.max(1, dpr || 1))
  const landscape = w >= h
  const minW = landscape ? VIEW.minLong : VIEW.minShort
  const minH = landscape ? VIEW.minShort : VIEW.minLong
  const fitScale = Math.min(w / minW, h / minH)
  return {
    cssWidth: w,
    cssHeight: h,
    dpr: d,
    fitScale,
    renderScale: fitScale * d,
    logicalWidth: w / fitScale,
    logicalHeight: h / fitScale,
  }
}
