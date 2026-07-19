import { UNIT } from '../core/units'
import { describe, expect, it } from 'vitest'
import { TEAM } from '../characters/registry'
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

describe('环形阵按人数取形', () => {
  it('1 人：位于队伍中心，无环', () => {
    const posts = formationPosts('ring', 1)
    expect(posts).toHaveLength(1)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(0)
  })

  it('2 人：紧凑左右并肩，相位不起作用（不环绕）', () => {
    const posts = formationPosts('ring', 2)
    expect(posts[0]!.x).toBeCloseTo((-TEAM.pairGap / 2) * UNIT)
    expect(posts[1]!.x).toBeCloseTo((TEAM.pairGap / 2) * UNIT)
    expect(posts[0]!.y).toBeCloseTo(0)
    expect(posts[1]!.y).toBeCloseTo(0)
    expect(formationPosts('ring', 2, 1.3)).toEqual(posts)
    // 圆心距紧凑：明显小于标准环的直径
    expect(TEAM.pairGap).toBeLessThan(TEAM.ringRadius * 2)
  })

  it('3 人：小半径环（比标准环紧凑）', () => {
    const posts = formationPosts('ring', 3)
    for (const p of posts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(TEAM.smallRingRadius * UNIT)
    expect(TEAM.smallRingRadius).toBeLessThan(TEAM.ringRadius)
  })

  it('≥4 人：标准半径环（8 人上限同半径，允许重叠）', () => {
    for (const n of [4, 5, 6, 8]) {
      const posts = formationPosts('ring', n)
      expect(posts).toHaveLength(n)
      for (const p of posts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(TEAM.ringRadius * UNIT)
    }
  })

  it('1~2 人不上可旋转环（ringPostAngle null），3 人起有角', () => {
    expect(ringPostAngle('ring', 0, 1)).toBeNull()
    expect(ringPostAngle('ring', 0, 2)).toBeNull()
    expect(ringPostAngle('ring', 1, 2)).toBeNull()
    expect(ringPostAngle('ring', 0, 3)).toBeCloseTo(UP)
  })
})

describe('formationPosts / ringPostAngle', () => {
  it('环形（≥4 人）= slotOffset 原样', () => {
    const posts = formationPosts('ring', 5)
    for (let i = 0; i < 5; i++) {
      const ref = slotOffset(i, 5, TEAM.ringRadius * UNIT)
      expect(posts[i]!.x).toBeCloseTo(ref.x)
      expect(posts[i]!.y).toBeCloseTo(ref.y)
    }
  })

  it('N 保 1：0 号在中心，其余等半径环绕', () => {
    const posts = formationPosts('guard', 5)
    expect(posts).toHaveLength(5)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(0)
    for (let i = 1; i < 5; i++) {
      expect(Math.hypot(posts[i]!.x, posts[i]!.y)).toBeCloseTo(TEAM.ringRadius * UNIT)
    }
  })

  it('环相位：环形全员随相位旋转；N 保 1 外圈旋转而中心不动', () => {
    const phase = 0.7
    const ring = formationPosts('ring', 4, phase)
    for (let i = 0; i < 4; i++) {
      const a = (ringPostAngle('ring', i, 4) ?? 0) + phase
      expect(ring[i]!.x).toBeCloseTo(Math.cos(a) * TEAM.ringRadius * UNIT)
      expect(ring[i]!.y).toBeCloseTo(Math.sin(a) * TEAM.ringRadius * UNIT)
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

  it('人数不足 2 的 N 保 1 回落环形（= 单人居中）', () => {
    const posts = formationPosts('guard', 1)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(0)
  })
})
