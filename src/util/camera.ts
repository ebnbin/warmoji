import type Phaser from 'phaser'

/** 只在主相机上画，其余相机（如环面的错位相机）一律跳过；主相机须已建好 */
export function mainCameraOnly<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  obj.cameraFilter = ~obj.scene.cameras.main.id
  return obj
}
