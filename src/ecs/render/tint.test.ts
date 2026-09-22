import { describe, expect, it } from 'vitest'
import { Fx, Tint, Transform } from '../components'
import { spawnFxBoom } from '../entities/fx'
import { animateBooms } from '../systems/animateBooms'
import { makeWorld } from '../world'
import { packTint } from './tint'
import type { FrameIndex } from '../frames'
import type { Sim } from '../sim'

// 守卫：alpha 越界会在打包时绕回低 8 位，变成本意的反面

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

    // Back.easeOut 的过冲峰值
    sim.fxMs = durMs * 0.58
    animateBooms(sim)
    expect(Transform.w[eid]!).toBeGreaterThan(100) // 确认是最大的那一段
    expect(alphaOf(packTint(Tint.color[eid]!, Tint.alpha[eid]!))).toBe(0)

    sim.fxMs = durMs * 0.15
    animateBooms(sim)
    expect(Transform.w[eid]!).toBeLessThan(100)
    expect(alphaOf(packTint(Tint.color[eid]!, Tint.alpha[eid]!))).toBeGreaterThan(100)
  })
})
