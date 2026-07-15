import { describe, expect, it } from 'vitest'
import { TEAM } from './config'
import { formationPosts, ringPostAngle, slotOffset } from './formation'

const UP = -Math.PI / 2

describe('slotOffset', () => {
  it('0 号槽位在正上方', () => {
    const p = slotOffset(0, 5, 100)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(-100)
  })

  it('全部槽位半径一致且均匀分布（矢量和为零）', () => {
    let sx = 0
    let sy = 0
    for (let i = 0; i < 5; i++) {
      const p = slotOffset(i, 5, 100)
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100)
      sx += p.x
      sy += p.y
    }
    expect(sx).toBeCloseTo(0)
    expect(sy).toBeCloseTo(0)
  })

  it('槽位两两不重合', () => {
    const pts = Array.from({ length: 5 }, (_, i) => slotOffset(i, 5, 100))
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(1)
      }
    }
  })
})

describe('formationPosts / ringPostAngle', () => {
  it('环形 = slotOffset 原样', () => {
    const posts = formationPosts('ring', 5)
    for (let i = 0; i < 5; i++) {
      const ref = slotOffset(i, 5, TEAM.ringRadius)
      expect(posts[i]!.x).toBeCloseTo(ref.x)
      expect(posts[i]!.y).toBeCloseTo(ref.y)
    }
  })

  it('N 保 1：0 号在中心，其余等半径环绕', () => {
    const posts = formationPosts('guard', 5)
    expect(posts).toHaveLength(5)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(0)
    for (let i = 1; i < 5; i++) {
      expect(Math.hypot(posts[i]!.x, posts[i]!.y)).toBeCloseTo(TEAM.ringRadius)
    }
  })

  it('环相位：环形全员随相位旋转；N 保 1 外圈旋转而中心不动', () => {
    const phase = 0.7
    const ring = formationPosts('ring', 4, phase)
    for (let i = 0; i < 4; i++) {
      const a = (ringPostAngle('ring', i, 4) ?? 0) + phase
      expect(ring[i]!.x).toBeCloseTo(Math.cos(a) * TEAM.ringRadius)
      expect(ring[i]!.y).toBeCloseTo(Math.sin(a) * TEAM.ringRadius)
    }
    const guard = formationPosts('guard', 5, phase)
    expect(Math.hypot(guard[0]!.x, guard[0]!.y)).toBeCloseTo(0)
    const base = formationPosts('guard', 5, 0)
    for (let i = 1; i < 5; i++) {
      const rot = Math.atan2(guard[i]!.y, guard[i]!.x) - Math.atan2(base[i]!.y, base[i]!.x)
      expect(Math.atan2(Math.sin(rot - phase), Math.cos(rot - phase))).toBeCloseTo(0)
    }
  })

  it('ringPostAngle：环形全员有角，0 号正上；N 保 1 中心 null、外圈有角', () => {
    expect(ringPostAngle('ring', 0, 5)).toBeCloseTo(UP)
    expect(ringPostAngle('guard', 0, 5)).toBeNull()
    expect(ringPostAngle('guard', 1, 5)).toBeCloseTo(UP)
  })

  it('人数不足 2 回落环形', () => {
    const posts = formationPosts('guard', 1)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(TEAM.ringRadius)
  })
})
