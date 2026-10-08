import Phaser from 'phaser'
import { devConfig, setCurrentLayout } from './config'
import { syncSceneHosts } from './sceneHosts'
import { devSettings, SETTINGS_CHANGED, settingsEvents } from './settings'
import { enforceTimeControl } from './timeControl'
import { isPickMode, pickAt } from './inspect'
import { sampleHistory } from './history'
import { canvasToWorld, paintOverlays, worldToCanvas } from './overlay'
import type { OverlayCtx } from './overlay'
import type { DevLayout } from './types'

const DEPTH = { guides: 0, overlay: 2, picker: 5 } as const

/** 画在游戏画面上的一层：安全区参考线、检视与触点的标记、拾取；面板本身在画布之外 */
export class DevToolsScene extends Phaser.Scene {
  private layout!: DevLayout
  private guides!: Phaser.GameObjects.Graphics
  private overlay!: Phaser.GameObjects.Graphics
  private overlayCtx!: OverlayCtx
  private picker?: Phaser.GameObjects.Zone

  constructor() {
    super(devConfig().key)
  }

  create(): void {
    this.layout = devConfig().layout(this)
    setCurrentLayout(this.layout)
    this.guides = this.add.graphics().setDepth(DEPTH.guides)
    this.drawGuides()
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay)
    this.overlayCtx = {
      game: this.game,
      toLocal: (scene, x, y, sfx = 1, sfy = 1): { x: number; y: number } => {
        const c = worldToCanvas(scene.cameras.main, x, y, sfx, sfy)
        return canvasToWorld(this.cameras.main, c.x, c.y)
      },
      canvasToLocal: (px, py): { x: number; y: number } => canvasToWorld(this.cameras.main, px, py),
    }
    settingsEvents.on(SETTINGS_CHANGED, this.drawGuides, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      settingsEvents.off(SETTINGS_CHANGED, this.drawGuides, this)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
      this.picker = undefined
    })
  }

  /** 用墙钟而非引擎时间：慢放或暂停时照常采样 */
  update(): void {
    syncSceneHosts()
    enforceTimeControl()
    this.overlay.clear()
    paintOverlays(this.overlay, this.overlayCtx)
    this.syncPicker()
    sampleHistory(performance.now())
  }

  /** 拾取模式下铺一层全屏 zone 吃掉画面上的点击，业务 scene 收不到 */
  private syncPicker(): void {
    const want = isPickMode()
    if (want && !this.picker) {
      const L = this.layout
      this.picker = this.add
        .zone(0, 0, L.width, L.height)
        .setOrigin(0)
        .setDepth(DEPTH.picker)
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

  private drawGuides(): void {
    const g = this.guides
    g.clear()
    if (!devSettings().safeArea) return
    const L = this.layout
    const i = L.insets
    g.lineStyle(2, devConfig().accent, 0.7)
    g.strokeRect(i.left, i.top, L.width - i.left - i.right, L.height - i.top - i.bottom)
    g.lineStyle(1, 0xffffff, 0.3)
    g.strokeRect(0.5, 0.5, L.width - 1, L.height - 1)
  }
}
