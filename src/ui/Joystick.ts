import Phaser from 'phaser'

const RADIUS = 56
const THUMB_RADIUS = 24
const DEADZONE = 0.12

/** 浮动虚拟摇杆：按下处为原点，拖出方向向量（模 0~1）；监听挂在 scene.input，场景重启自动清理 */
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
    // 点在可交互 UI（如压测按钮）上时不触发摇杆
    if (this.scene.input.hitTestPointer(pointer).length > 0) return
    this.pointerId = pointer.id
    this.originX = pointer.worldX
    this.originY = pointer.worldY
    this.base = this.scene.add
      .circle(this.originX, this.originY, RADIUS, 0xffffff, 0.06)
      .setStrokeStyle(2, 0xffffff, 0.2)
      .setDepth(150)
    this.thumb = this.scene.add
      .circle(this.originX, this.originY, THUMB_RADIUS, 0xffffff, 0.18)
      .setDepth(151)
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return
    let dx = pointer.worldX - this.originX
    let dy = pointer.worldY - this.originY
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
