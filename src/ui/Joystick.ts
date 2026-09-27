import Phaser from 'phaser'
import { INK, SURFACE, TONE } from './theme'

const BASE = 84
const KNOB = 28
/** 摇杆头拖到底盘边缘时走满速 */
const TRAVEL = BASE - KNOB
/** 按在底盘外这么远以内也算按到摇杆 */
const REACH = BASE + 20
const DEADZONE = 0.12
/** 移动时底盘边缘朝移动方向亮起的弧长 */
const ARC = Math.PI / 3

/** 固定位置的移动摇杆：只有从摇杆上按下才接管这根手指，摇杆头跳到手指处并限在底盘里；没按住时半透明；(x, y) 是圆心 */
export class Joystick {
  static readonly RADIUS = BASE

  private readonly scene: Phaser.Scene
  private readonly x: number
  private readonly y: number
  private readonly g: Phaser.GameObjects.Graphics
  private pointerId: number | null = null
  private vecX = 0
  private vecY = 0

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number) {
    this.scene = scene
    this.x = x
    this.y = y
    this.g = scene.add.graphics().setDepth(depth)
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
    this.draw(0, 0)
  }

  get vector(): { x: number; y: number } {
    return { x: this.vecX, y: this.vecY }
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.pointerId !== null) return
    if (Math.hypot(pointer.worldX - this.x, pointer.worldY - this.y) > REACH) return
    if (this.scene.input.hitTestPointer(pointer).length > 0) return
    this.pointerId = pointer.id
    this.follow(pointer)
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.pointerId) this.follow(pointer)
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.pointerId) this.release()
  }

  private follow(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.worldX - this.x
    const dy = pointer.worldY - this.y
    const k = Math.min(1, TRAVEL / Math.max(1, Math.hypot(dx, dy)))
    const mx = (dx * k) / TRAVEL
    const my = (dy * k) / TRAVEL
    const live = Math.hypot(mx, my) >= DEADZONE
    this.vecX = live ? mx : 0
    this.vecY = live ? my : 0
    this.draw(dx * k, dy * k)
  }

  /** 当作松手：场景要停住时手指可能还按着，停住期间收不到抬起 */
  release(): void {
    this.pointerId = null
    this.vecX = 0
    this.vecY = 0
    this.draw(0, 0)
  }

  /** (kx, ky) 是摇杆头相对圆心的位置 */
  private draw(kx: number, ky: number): void {
    const g = this.g.clear().setAlpha(this.pointerId === null ? 0.55 : 1)
    g.fillStyle(SURFACE.outline, 0.25)
    g.fillCircle(this.x, this.y, BASE)
    g.lineStyle(3, INK.ink, 0.4)
    g.strokeCircle(this.x, this.y, BASE)
    if (this.vecX !== 0 || this.vecY !== 0) {
      const a = Math.atan2(this.vecY, this.vecX)
      g.lineStyle(6, TONE.accent.face, 0.9)
      g.beginPath()
      g.arc(this.x, this.y, BASE, a - ARC / 2, a + ARC / 2, false)
      g.strokePath()
    }
    g.fillStyle(SURFACE.outline, 0.9)
    g.fillCircle(this.x + kx, this.y + ky, KNOB + 3)
    g.fillStyle(INK.soft, 1)
    g.fillCircle(this.x + kx, this.y + ky, KNOB)
  }
}
