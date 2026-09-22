import Phaser from 'phaser'

// 裸 GameObject，只为在显示列表里占一个 depth。DisplayList 的排序键是 _depth 而非 depth：
// 裸 GameObject 须自己声明 _depth，否则排序得 NaN 而深度带整体失效
export abstract class EcsLayer extends Phaser.GameObjects.GameObject {
  /** DisplayList 的排序键 */
  _depth: number
  // 渲染前会读 child.blendMode；裸 GameObject 须显式给，否则报错
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
