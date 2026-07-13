import Phaser from 'phaser'

const RADIUS = 56
const THUMB_RADIUS = 24
const DEADZONE = 0.12

/**
 * 浮动虚拟摇杆：在任意位置按下即以该点为原点，拖动产生方向向量（模长 0~1）。
 * 触屏与鼠标拖拽通用；监听注册在 scene.input 上，场景重启时自动清理。
 */
export class Joystick {
  private scene: Phaser.Scene
  private base: Phaser.GameObjects.Arc | null = null
  private thumb: Phaser.GameObjects.Arc | null = null
  private pointerId: number | null = null
  private originX = 0
  private originY = 0
  private vecX = 0
  private vecY = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup', this.onUp, this)
  }

  get vector(): { x: number; y: number } {
    return { x: this.vecX, y: this.vecY }
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.pointerId !== null) return
    this.pointerId = pointer.id
    this.originX = pointer.x
    this.originY = pointer.y
    this.base = this.scene.add
      .circle(pointer.x, pointer.y, RADIUS, 0xffffff, 0.06)
      .setStrokeStyle(2, 0xffffff, 0.2)
      .setDepth(150)
    this.thumb = this.scene.add.circle(pointer.x, pointer.y, THUMB_RADIUS, 0xffffff, 0.18).setDepth(151)
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return
    let dx = pointer.x - this.originX
    let dy = pointer.y - this.originY
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    this.thumb?.setPosition(this.originX + dx, this.originY + dy)
    const mx = dx / RADIUS
    const my = dy / RADIUS
    if (Math.hypot(mx, my) < DEADZONE) {
      this.vecX = 0
      this.vecY = 0
    } else {
      this.vecX = mx
      this.vecY = my
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return
    this.pointerId = null
    this.vecX = 0
    this.vecY = 0
    this.base?.destroy()
    this.thumb?.destroy()
    this.base = null
    this.thumb = null
  }
}
