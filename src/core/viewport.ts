import { VIEW } from './config'

export interface ViewportSpec {
  cssWidth: number
  cssHeight: number
  /** css px / 逻辑 px，保证保底区完整可见的最大缩放 */
  fitScale: number
  logicalWidth: number
  logicalHeight: number
}

export function computeViewport(cssWidth: number, cssHeight: number): ViewportSpec {
  const w = Math.max(1, cssWidth)
  const h = Math.max(1, cssHeight)
  const landscape = w >= h
  const minW = landscape ? VIEW.minLong : VIEW.minShort
  const minH = landscape ? VIEW.minShort : VIEW.minLong
  const fitScale = Math.min(w / minW, h / minH)
  return {
    cssWidth: w,
    cssHeight: h,
    fitScale,
    logicalWidth: w / fitScale,
    logicalHeight: h / fitScale,
  }
}
