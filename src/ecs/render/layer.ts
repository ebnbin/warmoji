import Phaser from 'phaser'

export abstract class EcsLayer extends Phaser.GameObjects.GameObject {
  _depth: number
  blendMode = Phaser.BlendModes.NORMAL

  constructor(scene: Phaser.Scene, type: string, depth: number) {
    super(scene, type)
    this._depth = depth
  }

  get depth(): number {
    return this._depth
  }

  set depth(v: number) {
    this._depth = v
    this.displayList?.queueDepthSort()
  }
}
