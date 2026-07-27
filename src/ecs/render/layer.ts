import Phaser from 'phaser'

// 自绘层的公共基类：一个「只为在显示列表里占一个 depth」的裸 GameObject。
// 四个自绘层（精灵/形状/光圈/飘字）都从这里来。
//
// **它存在的唯一理由是 depth**：DisplayList 的排序键是 `_depth`，不是 `depth`——
// 后者只是 Depth 混入里那个「写了顺手 queueDepthSort」的读写口。裸 GameObject 没有
// 那个混入，自己声明一个 `depth` 字段的话 `_depth` 恒为 undefined，
// `childA._depth - childB._depth` 得到 NaN，StableSort 视作「不需要换位」——
// 于是全部深度带整体失效，真实叠放次序退化成「谁后进显示列表谁在上」。
//
// 开局时看不出来：地图视觉在 create 里先建、批绘在 boot 里后建，后进的正好该在上。
// 视口一变（转屏 / 拉窗口），单屏图的视觉层整体重建——destroy 掉再 add 回来就排到了
// 列表末尾，于是那块不透明的地面把全场实体一次盖光，屏幕上只剩地图背景。
export abstract class EcsLayer extends Phaser.GameObjects.GameObject {
  /** DisplayList 真正的排序键（见上） */
  _depth: number
  // WebGLRenderer.render 渲染每个子对象前会读 child.blendMode 设混合模式；
  // 裸 GameObject 无 BlendMode 组件，显式给正常混合，否则 setBlendMode(undefined) 报错
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
