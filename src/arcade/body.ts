import type Phaser from 'phaser'

export type ArcadeBody = Phaser.Physics.Arcade.Body
export type ImageObj = Phaser.GameObjects.Image

// Arcade body 半径按源纹理坐标计，随对象缩放
export function circleBody(obj: ImageObj, radius: number): void {
  const body = obj.body as ArcadeBody
  const frame = obj.width
  const r = (radius / obj.displayWidth) * frame
  body.setCircle(r, frame / 2 - r, frame / 2 - r)
}
