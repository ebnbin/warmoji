import { describe, expect, it } from 'vitest'
import {
  ANIM_FORMAT,
  ANIM_RECIPES,
  ANIM_SPEC,
  ANIM_TEMPLATES,
  animRecipeOf,
  animTemplateOf,
  applyTemplate,
  bakeAnimFrame,
  dissectSvg,
  lerpKeyframes,
  loadAnimRecipes,
  splitSvg,
  star4,
  validateAnimResource,
} from './studio'
import type { AnimResource } from './studio'

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

describe('动画资源格式', () => {
  const goodEntry = {
    emoji: '🧪',
    name: '试验体',
    desc: '',
    anatomy: '',
    parts: [
      {
        indices: [0],
        keyframes: [
          { t: 0, tx: 0 },
          { t: 1, tx: 0 },
        ],
      },
    ],
  }
  const resource = (patch: object): AnimResource =>
    ({
      format: ANIM_FORMAT,
      spec: { frames: 10, durMs: 1000 },
      animations: { '1f9ea': { ...goodEntry, ...patch } },
    }) as AnimResource

  it('合法资源通过校验并还原 fx 渲染函数', () => {
    const recipes = loadAnimRecipes(
      resource({
        fx: [{ gen: 'sparkles', params: { stars: [{ x: 1, y: 1, r: 1, phase: 0 }] } }],
      }),
    )
    expect(recipes).toHaveLength(1)
    expect(recipes[0]!.fx![0]!.render(0.8)).toContain('<path')
  })

  it('fx 声明可覆盖生成器默认 layer', () => {
    const recipes = loadAnimRecipes(
      resource({
        fx: [{ gen: 'sparkles', layer: 'back', params: { stars: [] } }],
      }),
    )
    expect(recipes[0]!.fx![0]!.layer).toBe('back')
  })

  it('格式版本不符 → 报错', () => {
    expect(() =>
      validateAnimResource({ ...resource({}), format: 'warmoji-anim@0' }),
    ).toThrow('格式不符')
  })

  it('未知 fx 生成器 → 报错', () => {
    expect(() =>
      validateAnimResource(resource({ fx: [{ gen: 'nova', params: {} }] })),
    ).toThrow('未知生成器')
  })

  it('关键帧不闭环 → 报错', () => {
    expect(() =>
      validateAnimResource(
        resource({
          parts: [{ indices: [0], keyframes: [{ t: 0, tx: 0 }, { t: 1, tx: 5 }] }],
        }),
      ),
    ).toThrow('闭环')
  })

  it('关键帧时序倒退 → 报错', () => {
    expect(() =>
      validateAnimResource(
        resource({
          parts: [
            { indices: [0], keyframes: [{ t: 0.5, tx: 0 }, { t: 0.2, tx: 0 }, { t: 0.5, tx: 0 }] },
          ],
        }),
      ),
    ).toThrow('升序')
  })

  it('下标被多个部件占用 → 报错', () => {
    expect(() =>
      validateAnimResource(
        resource({
          parts: [
            { indices: [0], keyframes: [{ t: 0 }, { t: 1 }] },
            { indices: [0], keyframes: [{ t: 0 }, { t: 1 }] },
          ],
        }),
      ),
    ).toThrow('占用')
  })

  it('parts 与 fx 全空 → 报错', () => {
    expect(() => validateAnimResource(resource({ parts: [], fx: [] }))).toThrow('至少')
  })
})

describe('动画花名册（从资源文件加载）', () => {
  it('统一播放规格来自资源 spec', () => {
    expect(ANIM_SPEC.frames).toBeGreaterThanOrEqual(2)
    expect(ANIM_SPEC.durMs).toBeGreaterThan(0)
  })

  it('全部配方可烘焙出合法帧（闭环等约束已由加载期校验器把关）', () => {
    expect(ANIM_RECIPES.length).toBeGreaterThanOrEqual(9)
    const blank = '<svg xmlns="x" viewBox="0 0 36 36"><path d="M0 0"/></svg>'
    for (const r of ANIM_RECIPES) {
      const frame = bakeAnimFrame(blank.repeat(1), { ...r, parts: [] }, 0.3)
      expect(frame.endsWith('</svg>')).toBe(true)
    }
  })

  it('按 emoji 查配方', () => {
    expect(animRecipeOf('🤖')?.name).toBe('机器人')
    expect(animRecipeOf('🀄')).toBeUndefined()
  })
})

describe('通用动画模板', () => {
  const SVG3 =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
    '<path fill="#AAA" d="M0 0h1z"/><circle cx="5" cy="5" r="2" fill="#BBB"/>' +
    '<path fill="#CCC" d="M9 9h1z"/></svg>'

  it('模板关键帧闭环 + fx 声明合法（借用资源校验器把关）', () => {
    for (const tpl of ANIM_TEMPLATES) {
      const recipe = applyTemplate(tpl, '🧪', SVG3)
      validateAnimResource({
        format: ANIM_FORMAT,
        spec: { frames: 10, durMs: 1000 },
        animations: {
          test: {
            emoji: recipe.emoji,
            name: recipe.name,
            desc: recipe.desc,
            anatomy: recipe.anatomy,
            parts: recipe.parts,
            fx: tpl.fx,
          },
        },
      } as AnimResource)
    }
  })

  it('applyTemplate 把 whole 展开为全体元素下标', () => {
    const tpl = animTemplateOf('breathe')!
    const recipe = applyTemplate(tpl, '🧪', SVG3)
    expect(recipe.parts[0]!.indices).toEqual([0, 1, 2])
    expect(recipe.emoji).toBe('🧪')
  })

  it('纯 fx 模板无 parts，烘焙出的帧包含 fx 内容', () => {
    const tpl = animTemplateOf('sparkle')!
    const recipe = applyTemplate(tpl, '🧪', SVG3)
    expect(recipe.parts).toHaveLength(0)
    const frame = bakeAnimFrame(SVG3, recipe, 0.8)
    expect(frame).toContain('<path fill="#FFFFFF"')
  })

  it('模板 id 唯一且可查', () => {
    expect(new Set(ANIM_TEMPLATES.map((t) => t.id)).size).toBe(ANIM_TEMPLATES.length)
    expect(animTemplateOf('bounce')?.name).toBe('弹跳')
    expect(animTemplateOf('nope')).toBeUndefined()
  })
})

describe('dissectSvg', () => {
  it('逐元素独立渲染，序号/标签/填色齐全', () => {
    const parts = dissectSvg(SVG)
    expect(parts).toHaveLength(3)
    expect(parts[1]).toMatchObject({ index: 1, tag: 'circle', fill: '#292F33' })
    expect(parts[0]!.svg).toContain('#DD2E44')
    expect(parts[0]!.svg).not.toContain('circle')
    expect(parts[0]!.svg.endsWith('</svg>')).toBe(true)
  })
})
