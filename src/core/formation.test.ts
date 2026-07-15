import { describe, expect, it } from 'vitest'
import { FORMATION, TEAM } from './config'
import { formationName, formationPosts, ringPostAngle, slotOffset, vanguardSplit } from './formation'

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

describe('vanguardSplit / formationName', () => {
  it('前排 = 半数向上取整', () => {
    expect(vanguardSplit(3)).toEqual({ front: 2, back: 1 })
    expect(vanguardSplit(4)).toEqual({ front: 2, back: 2 })
    expect(vanguardSplit(5)).toEqual({ front: 3, back: 2 })
    expect(vanguardSplit(6)).toEqual({ front: 3, back: 3 })
  })

  it('展示名按人数自适应', () => {
    expect(formationName('ring', 5)).toBe('环形阵')
    expect(formationName('guard', 5)).toBe('多保一')
    expect(formationName('vanguard', 5)).toBe('前三后二')
    expect(formationName('vanguard', 6)).toBe('前三后三')
    expect(formationName('vanguard', 4)).toBe('前二后二')
  })
})

describe('formationPosts', () => {
  it('环形 = slotOffset 原样；朝向不影响', () => {
    const a = formationPosts('ring', 5, UP)
    const b = formationPosts('ring', 5, 1.3)
    for (let i = 0; i < 5; i++) {
      const ref = slotOffset(i, 5, TEAM.ringRadius)
      expect(a[i]!.x).toBeCloseTo(ref.x)
      expect(a[i]!.y).toBeCloseTo(ref.y)
      expect(b[i]!.x).toBeCloseTo(ref.x)
    }
  })

  it('多保一：0 号在中心，其余等半径环绕', () => {
    const posts = formationPosts('guard', 5, UP)
    expect(posts).toHaveLength(5)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(0)
    for (let i = 1; i < 5; i++) {
      expect(Math.hypot(posts[i]!.x, posts[i]!.y)).toBeCloseTo(TEAM.ringRadius)
    }
  })

  it('前后阵朝右：前排呈半弧（等半径、居中者正对朝向），后排横排在 −x', () => {
    const posts = formationPosts('vanguard', 5, 0)
    expect(posts).toHaveLength(5)
    const front = posts.slice(0, 3)
    const back = posts.slice(3)
    // 前排都在弧上：到中心距离 = frontRadius，居中者（下标 1）正对 +x
    for (const p of front) expect(Math.hypot(p.x, p.y)).toBeCloseTo(FORMATION.frontRadius)
    expect(front[1]!.x).toBeCloseTo(FORMATION.frontRadius)
    expect(front[1]!.y).toBeCloseTo(0)
    // 两翼对称且弧间隔 = frontArcStep（翼位前向分量小于居中者 → 弧形而非直线）
    expect(front[0]!.y).toBeCloseTo(-front[2]!.y)
    expect(front[0]!.x).toBeCloseTo(front[2]!.x)
    expect(front[0]!.x).toBeLessThan(front[1]!.x)
    expect(Math.abs(Math.atan2(front[0]!.y, front[0]!.x))).toBeCloseTo(FORMATION.frontArcStep)
    // 后排横排相对固定
    for (const p of back) expect(p.x).toBeCloseTo(-FORMATION.backDist)
    expect(Math.abs(back[0]!.y - back[1]!.y)).toBeCloseTo(FORMATION.spacing)
  })

  it('前后阵随朝向整体旋转（朝上时居中前锋在 −y）', () => {
    const posts = formationPosts('vanguard', 5, UP)
    expect(posts[1]!.y).toBeCloseTo(-FORMATION.frontRadius)
    expect(posts[1]!.x).toBeCloseTo(0)
    for (const p of posts.slice(3)) expect(p.y).toBeCloseTo(FORMATION.backDist)
  })

  it('环相位：环形全员随相位旋转；多保一外圈旋转而中心不动', () => {
    const phase = 0.7
    const ring = formationPosts('ring', 4, UP, phase)
    for (let i = 0; i < 4; i++) {
      const a = (ringPostAngle('ring', i, 4) ?? 0) + phase
      expect(ring[i]!.x).toBeCloseTo(Math.cos(a) * TEAM.ringRadius)
      expect(ring[i]!.y).toBeCloseTo(Math.sin(a) * TEAM.ringRadius)
    }
    const guard = formationPosts('guard', 5, UP, phase)
    expect(Math.hypot(guard[0]!.x, guard[0]!.y)).toBeCloseTo(0)
    const base = formationPosts('guard', 5, UP, 0)
    // 外圈整体转过 phase：转回后应与零相位重合
    for (let i = 1; i < 5; i++) {
      const rot = Math.atan2(guard[i]!.y, guard[i]!.x) - Math.atan2(base[i]!.y, base[i]!.x)
      expect(Math.atan2(Math.sin(rot - phase), Math.cos(rot - phase))).toBeCloseTo(0)
    }
  })

  it('ringPostAngle：环形全员有角；多保一中心 null；前后阵全员 null', () => {
    expect(ringPostAngle('ring', 0, 5)).toBeCloseTo(-Math.PI / 2)
    expect(ringPostAngle('guard', 0, 5)).toBeNull()
    expect(ringPostAngle('guard', 1, 5)).toBeCloseTo(-Math.PI / 2)
    expect(ringPostAngle('vanguard', 0, 5)).toBeNull()
  })

  it('人数不足 2 回落环形', () => {
    const posts = formationPosts('guard', 1, UP)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(TEAM.ringRadius)
  })
})
