import { VIEW } from './units'

export interface Viewport {
  cssWidth: number
  cssHeight: number
  dpr: number
  fitScale: number
  renderScale: number
  logicalWidth: number
  logicalHeight: number
}

export function computeViewport(cssWidth: number, cssHeight: number, dpr = 1): Viewport {
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
