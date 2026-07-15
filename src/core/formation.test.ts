import { describe, expect, it } from 'vitest'
import { FORMATION, TEAM } from './config'
import { formationName, formationPosts, slotOffset, vanguardSplit } from './formation'

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

  it('前后阵朝右：前排在 +x，后排在 −x，排内横向对称', () => {
    const posts = formationPosts('vanguard', 5, 0)
    expect(posts).toHaveLength(5)
    const front = posts.slice(0, 3)
    const back = posts.slice(3)
    for (const p of front) expect(p.x).toBeCloseTo(FORMATION.frontDist)
    for (const p of back) expect(p.x).toBeCloseTo(-FORMATION.backDist)
    expect(front.reduce((s, p) => s + p.y, 0)).toBeCloseTo(0)
    expect(back.reduce((s, p) => s + p.y, 0)).toBeCloseTo(0)
    // 排内间距 = spacing
    expect(Math.abs(front[0]!.y - front[1]!.y)).toBeCloseTo(FORMATION.spacing)
  })

  it('前后阵随朝向整体旋转（朝上时前排在 −y）', () => {
    const posts = formationPosts('vanguard', 5, UP)
    for (const p of posts.slice(0, 3)) expect(p.y).toBeCloseTo(-FORMATION.frontDist)
    for (const p of posts.slice(3)) expect(p.y).toBeCloseTo(FORMATION.backDist)
  })

  it('人数不足 2 回落环形', () => {
    const posts = formationPosts('guard', 1, UP)
    expect(Math.hypot(posts[0]!.x, posts[0]!.y)).toBeCloseTo(TEAM.ringRadius)
  })
})
