import { describe, expect, it } from 'vitest'
import {
  ANIM_RECIPES,
  MERGE_POOL,
  MERGE_RECIPES,
  animRecipeOf,
  bakeAnimFrame,
  extractPalette,
  findMergeRecipe,
  fusionRecipe,
  fusionRecolor,
  lerpKeyframes,
  mergeSvg,
  shadeHex,
  splitSvg,
  star4,
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

const A =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
  '<path fill="#C1694F" d="M0 0h9v9h-9zM1 1h2v2z"/><path fill="#662113" d="M1 1h8z"/>' +
  '<circle cx="5" cy="5" r="1" fill="#292F33"/></svg>'
const B =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
  '<path fill="#FFCC4D" d="M2 2h2v2h-2z"/><path fill="#664500" d="M3 3h1M4 4h2"/></svg>'

describe('mergeSvg', () => {
  const base = fusionRecipe('a', 'b', A, B)

  it('B 整体缩放叠加 + viewBox 扩容', () => {
    const out = mergeSvg(A, B, base)
    expect(out).toContain('viewBox="-8 -15.5 52 52"')
    expect(out).toContain('transform="translate(9.9 -14.7) scale(0.45)"')
  })

  it('recolor 成对替换 A/B 色相', () => {
    const out = mergeSvg(A, B, {
      ...base,
      recolorA: [['#C1694F', '#85B9DC']],
      recolorB: [['#FFCC4D', '#FFFFFF']],
    })
    expect(out).toContain('#85B9DC')
    expect(out).toContain('#FFFFFF')
  })

  it('partsB 支持整元素与 subpath 混取', () => {
    const out = mergeSvg(A, B, {
      ...base,
      recolorA: undefined,
      partsB: [{ index: 0 }, { index: 1, sub: 1 }],
    })
    expect(out).toContain('#FFCC4D')
    expect(out).toContain('d="M4 4h2"')
    expect(out).not.toContain('M3 3h1')
  })

  it('bBehindA 时 B 垫底', () => {
    const out = mergeSvg(A, B, { ...base, recolorA: undefined, bBehindA: true })
    expect(out.indexOf('<g ')).toBeLessThan(out.indexOf('#C1694F'))
  })

  it('opacityB 写在 g 上', () => {
    const out = mergeSvg(A, B, { ...base, opacityB: 0.9 })
    expect(out).toContain('opacity="0.9"')
  })
})

describe('通用融合', () => {
  it('extractPalette 按图形数据量降序且排除保护色', () => {
    const pal = extractPalette(A)
    expect(pal[0]!.color).toBe('#C1694F')
    expect(pal.map((p) => p.color)).not.toContain('#292F33')
  })

  it('fusionRecolor 全色板映射：明暗方向与 A 一致（亮色变亮、暗色变暗）', () => {
    const pairs = fusionRecolor(
      [
        { color: '#EEEEEE', weight: 9 },
        { color: '#888888', weight: 5 },
        { color: '#222222', weight: 2 },
      ],
      [{ color: '#88C9F9', weight: 7 }],
    )
    expect(pairs).toHaveLength(3)
    const dst = new Map(pairs)
    // 目标色互不相同且亮度序与源一致
    expect(new Set(pairs.map((p) => p[1])).size).toBe(3)
    const l = (hex: string): number =>
      0.299 * parseInt(hex.slice(1, 3), 16) + 0.587 * parseInt(hex.slice(3, 5), 16) + 0.114 * parseInt(hex.slice(5, 7), 16)
    expect(l(dst.get('#EEEEEE')!)).toBeGreaterThan(l(dst.get('#888888')!))
    expect(l(dst.get('#888888')!)).toBeGreaterThan(l(dst.get('#222222')!))
  })

  it('fusionRecolor 覆盖 A 的全部非保护色', () => {
    const pairs = fusionRecolor(extractPalette(A), [{ color: '#88C9F9', weight: 1 }])
    expect(pairs.map((p) => p[0]).sort()).toEqual(['#662113', '#C1694F'])
  })

  it('shadeHex 变亮变暗方向正确', () => {
    expect(shadeHex('#808080', 0.5) > '#808080').toBe(true)
    expect(shadeHex('#808080', -0.5) < '#808080').toBe(true)
  })

  it('fusionRecipe 端到端：换色映射非空、B 栖头顶', () => {
    const r = fusionRecipe('a', 'b', A, B)
    expect(r.recolorA!.length).toBeGreaterThan(0)
    expect(r.name).toBe('元素融合')
    const out = mergeSvg(A, B, r)
    expect(out).not.toContain('#C1694F')
    // 保护色原样保留
    expect(out).toContain('#292F33')
  })
})

describe('合并配方注册表', () => {
  it('精品配方正反序均命中，未收录组合返回 null（走通用融合）', () => {
    expect(findMergeRecipe('🧟', '🤠')?.name).toBe('牛仔僵尸')
    expect(findMergeRecipe('🤠', '🧟')?.name).toBe('牛仔僵尸')
    expect(findMergeRecipe('🤹', '🎩')).toBeNull()
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
