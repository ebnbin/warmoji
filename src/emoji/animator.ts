import type Phaser from 'phaser'
import { clipFrameIndex } from './studio'

// 极简翻页动画播放器：持有一个 Image，把游戏时钟翻算成帧纹理并 setTexture。
// 状态机只有两层——常驻 idle（循环，可带相位偏移做群体去同步）+ 一次性
// 覆盖 clip（play 按真实行为间隔播一遍，播完自动回落 idle）。速度绑定的
// 关键在这里不预测：play 的 durMs 就是本次行为的真实间隔（如武器开火
// 间隔），资产端 cycle clip 的相位约定（收势在 t→1）保证任意时长都自然。
// 帧未烘焙好之前一律静默保持现有静态纹理（渐进增强，无加载闪烁）。
// 所有帧与静态纹理同为 256 光栅，setTexture 不改 scale 语义。

interface PlayOpts {
  /** 本次播放的真实时长（如开火间隔毫秒） */
  readonly durMs: number
  readonly onDone?: () => void
}

interface ActiveState {
  id: string
  durMs: number
  /** 首次 update 时锚定（play/setIdle 的调用方无需拿时钟） */
  anchorMs?: number
  onDone?: () => void
}

export class Animator {
  private readonly clips = new Map<string, readonly string[]>()
  private idle?: { id: string; durMs: number; offsetMs: number }
  private active?: ActiveState
  private lastKey?: string

  constructor(private readonly img: Phaser.GameObjects.Image) {}

  /** 注册/替换某 clip 的帧纹理（烘焙完成后调用；变形等场景可整套换帧） */
  register(id: string, frames: readonly string[]): void {
    this.clips.set(id, frames)
  }

  /** 声明常驻循环 clip；offsetMs 为相位偏移（同屏大量实体错开呼吸节拍） */
  setIdle(id: string, durMs: number, offsetMs = 0): void {
    this.idle = { id, durMs, offsetMs }
  }

  /** 播放一次性 clip 覆盖 idle；帧未注册也照常计时（烘焙完成即接上） */
  play(id: string, opts: PlayOpts): void {
    this.active = { id, durMs: opts.durMs, onDone: opts.onDone }
  }

  /** 当前生效的 clip id（probe/调试用） */
  get clip(): string | undefined {
    return (this.active ?? this.idle)?.id
  }

  /** 最近一次贴上的帧纹理 key（probe 断言帧在推进用） */
  get frameKey(): string | undefined {
    return this.lastKey
  }

  /** 每帧驱动；now 用游戏时钟（暂停即停帧） */
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
    // idle 不需要锚点：相位 = (now+offset) 对周期取模，跨 play 中断天然连续
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
