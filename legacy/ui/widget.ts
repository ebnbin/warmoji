import Phaser from 'phaser'

/** 所有复合控件的基类：一个加进场景的容器，子对象用局部坐标 */
export class Widget extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y)
    scene.add.existing(this)
  }
}
