import { describe, expect, it } from 'vitest'
import { Fx, Tint, Transform } from '../components'
import { spawnFxBoom } from '../entities/fx'
import { animateBooms } from '../systems/animateBooms'
import { makeWorld } from '../world'
import { packTint } from './tint'
import type { FrameIndex } from '../frames'
import type { Sim } from '../sim'

// 顶点色打包的越界守卫。
//
// 钉的是这样一个缺陷：**打包是 `((a * 255) | 0) & 0xff`，越界的 alpha 会绕回低 8 位，
// 变成本意的反面**——负数（本该淡没）绕成几乎不透明，大于 1（本该全实）绕成几乎全透明。
// 旧实现从来碰不到它：alpha 一律经 Phaser 的 setAlpha，那个 setter 第一行就是
// Clamp(0,1)。ECS 把这些搬成裸写 Tint.alpha 之后，钳的人没了。
//
// 💥 爆裂正踩在上面：alpha = 1 - backEaseOut(t)，而 Back 的过冲让 t∈[0.37,1] 段恒为负
// ——那是它 63% 的寿命，且正是尺寸最大的那一段。于是本该「由小弹大、边弹边淡没」的一下
// 闪现，变成「满不透明地停在最大尺寸上」，看起来就是这个 💥 比从前大了一圈。
//
// 它为什么不会自己露馅：不报错、不崩、动画照跑，画面上就是一个更醒目的爆炸——
// 除非把两条实现按同一标称尺寸逐像素比，否则只会觉得「这特效有点大」。

const frames: FrameIndex = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }

/** alpha 通道（0..255） */
const alphaOf = (packed: number): number => (packed >>> 24) & 0xff

describe('packTint', () => {
  it('越界的 alpha 钳住而不是绕回：负数=全透明，超过 1=全不透明', () => {
    expect(alphaOf(packTint(0xffffff, -0.1))).toBe(0)
    expect(alphaOf(packTint(0xffffff, 1.08))).toBe(255) // Boss 入场的 Back 过冲峰值
    expect(alphaOf(packTint(0xffffff, 0))).toBe(0)
    expect(alphaOf(packTint(0xffffff, 1))).toBe(255)
  })

  it('💥 弹到最大的那一段必须是看不见的（旧实现在这里被 setAlpha 钳成 0）', () => {
    const world = makeWorld()
    const sim = { world, frames, fxMs: 0 } as unknown as Sim
    const eid = spawnFxBoom(sim, 0, 0, 100)
    const durMs = Fx.durMs[eid]!

    // t = 0.58：Back.easeOut 的过冲峰值，尺寸最大（约标称的 1.06 倍）
    sim.fxMs = durMs * 0.58
    animateBooms(sim)
    expect(Transform.w[eid]!).toBeGreaterThan(100) // 确实是最大的那一段，不是随便挑的时刻
    expect(alphaOf(packTint(Tint.color[eid]!, Tint.alpha[eid]!))).toBe(0)

    // 前段照旧可见：由小弹大 + 淡出，这一下闪现才是这个特效的全部
    sim.fxMs = durMs * 0.15
    animateBooms(sim)
    expect(Transform.w[eid]!).toBeLessThan(100)
    expect(alphaOf(packTint(Tint.color[eid]!, Tint.alpha[eid]!))).toBeGreaterThan(100)
  })
})
