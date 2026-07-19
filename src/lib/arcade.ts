import type { ArcadeBody, ImageObj } from '../battle/BaseArenaScene'

// 碰撞圆按逻辑半径换算回源纹理坐标（body 随对象缩放）
export function circleBody(obj: ImageObj, radius: number): void {
  const body = obj.body as ArcadeBody
  const frame = obj.width
  const r = (radius / obj.displayWidth) * frame
  body.setCircle(r, frame / 2 - r, frame / 2 - r)
}
