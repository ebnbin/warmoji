import Phaser from 'phaser'
import { devConfig } from './config'
import { sampleHistory } from './history'
import { isPickMode, pickAt } from './inspect'
import { canvasToWorld, paintOverlays, worldToCanvas } from './overlay'
import type { OverlayCtx } from './overlay'
import { syncSceneHosts } from './sceneHosts'
import { enforceTimeControl } from './timeControl'

/** 画在游戏画面上的一层：标记与拾取都在这里，面板本身在画布之外 */
export class DevOverlayScene extends Phaser.Scene {
  private marks!: Phaser.GameObjects.Graphics
  private ctx!: OverlayCtx
  private picker?: Phaser.GameObjects.Zone

  constructor() {
    super(devConfig().key)
  }

  create(): void {
    // 一个单位就是一个 CSS 像素，与宿主怎么摆镜头无关
    this.cameras.main.setOrigin(0, 0).setZoom(1 / this.scale.zoom)
    this.marks = this.add.graphics()
    this.ctx = {
      game: this.game,
      toLocal: (scene, x, y, sfx = 1, sfy = 1): { x: number; y: number } => {
        const c = worldToCanvas(scene.cameras.main, x, y, sfx, sfy)
        return canvasToWorld(this.cameras.main, c.x, c.y)
      },
      canvasToLocal: (px, py): { x: number; y: number } => canvasToWorld(this.cameras.main, px, py),
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
      this.picker = undefined
    })
  }

  /** 用墙钟而非引擎时间：慢放或暂停时照常采样 */
  update(): void {
    syncSceneHosts()
    enforceTimeControl()
    this.marks.clear()
    paintOverlays(this.marks, this.ctx)
    this.syncPicker()
    sampleHistory(performance.now())
  }

  /** 拾取模式下铺一层全屏 zone 吃掉画面上的点击，业务 scene 收不到 */
  private syncPicker(): void {
    const want = isPickMode()
    if (want && !this.picker) {
      this.picker = this.add
        .zone(0, 0, this.scale.width * this.scale.zoom, this.scale.height * this.scale.zoom)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (p: Phaser.Input.Pointer) => pickAt(p.x, p.y))
    } else if (!want && this.picker) {
      this.picker.destroy()
      this.picker = undefined
    }
  }

  private onResize(): void {
    this.scene.restart()
  }
}
