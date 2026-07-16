import { describe, expect, it } from 'vitest'
import {
  ANIM_RECIPES,
  MERGE_POOL,
  MERGE_RECIPES,
  animRecipeOf,
  bakeAnimFrame,
  findMergeRecipe,
  genericMergeRecipe,
  lerpKeyframes,
  mergeSvg,
  splitSvg,
  subpathsOf,
} from './studio'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
  '<path fill="#DD2E44" d="M1 1h2v2z"/>' +
  '<circle cx="19" cy="3" r="1" fill="#292F33"/>' +
  '<path fill="#77B255" d="M0 0h1M5 5h1M9 9h1"/>' +
  '</svg>'

describe('splitSvg', () => {
  it('切出开标签与顶层元素', () => {
    const { open, els } = splitSvg(SVG)
    expect(open).toContain('viewBox="0 0 36 36"')
    expect(els).toHaveLength(3)
    expect(els[1]).toContain('circle')
  })

  it('拒绝非 SVG 文本', () => {
    expect(() => splitSvg('<div/>')).toThrow()
  })
})

describe('subpathsOf', () => {
  it('按 M 命令拆分并保留 fill', () => {
    const subs = subpathsOf('<path fill="#664500" d="M1 1h2M3 3h4M5 5h6"/>')
    expect(subs).toHaveLength(3)
    expect(subs[1]).toBe('<path fill="#664500" d="M3 3h4"/>')
  })

  it('无 d 属性返回空', () => {
    expect(subpathsOf('<circle cx="1" cy="1" r="1"/>')).toEqual([])
  })
})

describe('lerpKeyframes', () => {
  const kfs = [
    { t: 0, tx: 0 },
    { t: 0.5, tx: 10 },
    { t: 1, tx: 0 },
  ]

  it('关键帧处取原值，中点线性插值', () => {
    expect(lerpKeyframes(kfs, 0).tx).toBe(0)
    expect(lerpKeyframes(kfs, 0.5).tx).toBe(10)
    expect(lerpKeyframes(kfs, 0.25).tx).toBe(5)
  })

  it('相位回绕（t>1 与 t<0 都归一到周期内）', () => {
    expect(lerpKeyframes(kfs, 1.25).tx).toBe(5)
    expect(lerpKeyframes(kfs, -0.75).tx).toBe(5)
  })

  it('缺省字段有中性值', () => {
    const pose = lerpKeyframes([{ t: 0, rotate: 4 }, { t: 1, rotate: 4 }], 0.3)
    expect(pose.scale).toBe(1)
    expect(pose.opacity).toBe(1)
    expect(pose.tx).toBe(0)
  })
})

describe('bakeAnimFrame', () => {
  const recipe = {
    emoji: '🧪',
    name: '试验体',
    desc: '',
    anatomy: '',
    durMs: 1000,
    frames: 4,
    parts: [
      {
        indices: [0],
        keyframes: [
          { t: 0, tx: 0 },
          { t: 0.5, tx: -4 },
          { t: 1, tx: 0 },
        ],
      },
    ],
  }

  it('部件包 g 并写死插值后的 transform', () => {
    const out = bakeAnimFrame(SVG, recipe, 0.5)
    expect(out).toContain('<g transform="translate(-4 0) rotate(0) scale(1) translate(0 0)">')
    expect(out).toContain('#DD2E44')
    // 未入组元素原样保留
    expect(out).toContain('<circle cx="19"')
    expect(out.endsWith('</svg>')).toBe(true)
  })

  it('不同相位烘焙出不同帧', () => {
    expect(bakeAnimFrame(SVG, recipe, 0)).not.toBe(bakeAnimFrame(SVG, recipe, 0.5))
  })

  it('多元素部件聚合到最大下标处，成员保序', () => {
    const r2 = { ...recipe, parts: [{ indices: [0, 2], keyframes: [{ t: 0, ty: 1 }, { t: 1, ty: 1 }] }] }
    const out = bakeAnimFrame(SVG, r2, 0)
    const gIdx = out.indexOf('<g ')
    const circleIdx = out.indexOf('<circle')
    expect(gIdx).toBeGreaterThan(circleIdx)
    // 组内两个成员按原顺序
    const inner = out.slice(gIdx)
    expect(inner.indexOf('#DD2E44')).toBeLessThan(inner.indexOf('#77B255'))
  })
})

describe('动画花名册', () => {
  it('配方关键帧闭环（首尾姿态一致，循环播放不跳变）', () => {
    for (const r of ANIM_RECIPES) {
      for (const part of r.parts) {
        const a = lerpKeyframes(part.keyframes, 0)
        const b = lerpKeyframes(part.keyframes, 1)
        expect(a).toEqual(b)
      }
    }
  })

  it('按 emoji 查配方', () => {
    expect(animRecipeOf('🤖')?.name).toBe('机器人')
    expect(animRecipeOf('🀄')).toBeUndefined()
  })

  it('部件下标不越界不重复', () => {
    for (const r of ANIM_RECIPES) {
      const seen = new Set<number>()
      for (const part of r.parts) {
        for (const i of part.indices) {
          expect(i).toBeGreaterThanOrEqual(0)
          expect(seen.has(i)).toBe(false)
          seen.add(i)
        }
      }
    }
  })
})

describe('mergeSvg', () => {
  const A =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
    '<path fill="#C1694F" d="M0 0h9z"/><path fill="#662113" d="M1 1h8z"/></svg>'
  const B =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
    '<path fill="#FFCC4D" d="M2 2h2z"/><path fill="#664500" d="M3 3h1M4 4h2"/></svg>'

  it('B 整体缩放叠加 + viewBox 扩容', () => {
    const out = mergeSvg(A, B, genericMergeRecipe('a', 'b'))
    expect(out).toContain('viewBox="-1 -5 38 42"')
    expect(out).toContain('<g transform="translate(19 -4) scale(0.45)">')
    expect(out.indexOf('#C1694F')).toBeLessThan(out.indexOf('<g '))
  })

  it('recolor 成对替换 A/B 色相', () => {
    const out = mergeSvg(A, B, {
      ...genericMergeRecipe('a', 'b'),
      recolorA: [['#C1694F', '#85B9DC']],
      recolorB: [['#FFCC4D', '#FFFFFF']],
    })
    expect(out).toContain('#85B9DC')
    expect(out).not.toContain('#C1694F')
    expect(out).toContain('#FFFFFF')
  })

  it('partsB 支持整元素与 subpath 混取', () => {
    const out = mergeSvg(A, B, {
      ...genericMergeRecipe('a', 'b'),
      partsB: [{ index: 0 }, { index: 1, sub: 1 }],
    })
    expect(out).toContain('#FFCC4D')
    expect(out).toContain('d="M4 4h2"')
    expect(out).not.toContain('M3 3h1')
  })

  it('bBehindA 时 B 垫底', () => {
    const out = mergeSvg(A, B, { ...genericMergeRecipe('a', 'b'), bBehindA: true })
    expect(out.indexOf('<g ')).toBeLessThan(out.indexOf('#C1694F'))
  })

  it('opacityB 写在 g 上', () => {
    const out = mergeSvg(A, B, { ...genericMergeRecipe('a', 'b'), opacityB: 0.9 })
    expect(out).toContain('opacity="0.9"')
  })
})

describe('合并配方注册表', () => {
  it('精品配方正反序均命中，未收录组合走兜底', () => {
    expect(findMergeRecipe('🧟', '🤠').name).toBe('牛仔僵尸')
    expect(findMergeRecipe('🤠', '🧟').name).toBe('牛仔僵尸')
    expect(findMergeRecipe('🤹', '🎩').name).toBe('自由合成')
  })

  it('精品配方的原料都在候选池里', () => {
    for (const r of MERGE_RECIPES) {
      expect(MERGE_POOL).toContain(r.a)
      expect(MERGE_POOL).toContain(r.b)
    }
  })

  it('候选池无重复', () => {
    expect(new Set(MERGE_POOL).size).toBe(MERGE_POOL.length)
  })
})
