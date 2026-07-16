import { describe, expect, it } from 'vitest'
import {
  ANIM_RECIPES,
  animRecipeOf,
  bakeAnimFrame,
  lerpKeyframes,
  splitSvg,
  star4,
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
    expect(out).toContain('<g transform="translate(-4 0) rotate(0) scale(1 1) translate(0 0)">')
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

describe('fx 程序化效果层', () => {
  const fxRecipe = {
    emoji: '🧪',
    name: '试验体',
    desc: '',
    anatomy: '',
    viewBox: '0 -6 36 42',
    parts: [
      {
        indices: [0],
        cx: 1,
        cy: 2,
        keyframes: [
          { t: 0, scaleX: 1, scaleY: 1 },
          { t: 0.5, scaleX: 1.3, scaleY: 0.7 },
          { t: 1, scaleX: 1, scaleY: 1 },
        ],
      },
    ],
    fx: [
      { layer: 'back' as const, render: (t: number) => `<circle class="bk" r="${t.toFixed(2)}"/>` },
      { layer: 'front' as const, render: () => '<path class="ft" d="M0 0"/>' },
    ],
  }

  it('fx 层注入：back 垫底、front 盖面、随相位变化', () => {
    const out = bakeAnimFrame(SVG, fxRecipe, 0.5)
    const bk = out.indexOf('class="bk"')
    const body = out.indexOf('#DD2E44')
    const ft = out.indexOf('class="ft"')
    expect(bk).toBeGreaterThan(-1)
    expect(bk).toBeLessThan(body)
    expect(body).toBeLessThan(ft)
    expect(out).toContain('r="0.50"')
  })

  it('viewBox 覆盖 + 不等比缩放写入 transform', () => {
    const out = bakeAnimFrame(SVG, fxRecipe, 0.5)
    expect(out).toContain('viewBox="0 -6 36 42"')
    expect(out).toContain('scale(1.3 0.7)')
  })

  it('fx 生成器输出合法片段（全相位不抛错、star4 闭合）', () => {
    for (const r of ANIM_RECIPES) {
      for (const f of r.fx ?? []) {
        for (let k = 0; k < 10; k++) expect(() => f.render(k / 10)).not.toThrow()
      }
    }
    expect(star4(18, 18, 2)).toMatch(/^M.*Z$/)
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
