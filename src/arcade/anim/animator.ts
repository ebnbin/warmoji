import type Phaser from 'phaser'
import { clipFrameIndex } from '../../emoji/anim'

// 帧未烘焙好时保持现有纹理；帧与静态纹理同为 256 光栅，setTexture 不改 scale 语义

interface PlayOpts {
  /** 毫秒；须为本次行为的真实间隔：资产端 cycle clip 约定收势在 t→1 */
  readonly durMs: number
  readonly onDone?: () => void
}

interface ActiveState {
  id: string
  durMs: number
  anchorMs?: number
  onDone?: () => void
}

export class Animator {
  private readonly clips = new Map<string, readonly string[]>()
  private idle?: { id: string; durMs: number; offsetMs: number }
  private active?: ActiveState
  private lastKey?: string

  constructor(private readonly img: Phaser.GameObjects.Image) {}

  /** 重复注册即整套换帧 */
  register(id: string, frames: readonly string[]): void {
    this.clips.set(id, frames)
  }

  /** offsetMs 为相位偏移 */
  setIdle(id: string, durMs: number, offsetMs = 0): void {
    this.idle = { id, durMs, offsetMs }
  }

  /** 帧未注册也照常计时 */
  play(id: string, opts: PlayOpts): void {
    this.active = { id, durMs: opts.durMs, onDone: opts.onDone }
  }

  get clip(): string | undefined {
    return (this.active ?? this.idle)?.id
  }

  get frameKey(): string | undefined {
    return this.lastKey
  }

  /** now 用游戏时钟 */
  update(now: number): void {
    const a = this.active
    if (a) {
      a.anchorMs ??= now
      if (now - a.anchorMs < a.durMs) {
        this.stamp(a.id, now - a.anchorMs, a.durMs, true)
        return
      }
      this.active = undefined
      a.onDone?.()
    }
    // idle 不锚定：相位取模保证跨 play 中断连续
    if (this.idle) this.stamp(this.idle.id, now + this.idle.offsetMs, this.idle.durMs, false)
  }

  private stamp(id: string, elapsedMs: number, durMs: number, once: boolean): void {
    const frames = this.clips.get(id)
    if (!frames || frames.length === 0) return
    const key = frames[clipFrameIndex(elapsedMs, durMs, frames.length, once)]!
    if (key !== this.lastKey && this.img.active) {
      this.img.setTexture(key)
      this.lastKey = key
    }
  }
}
