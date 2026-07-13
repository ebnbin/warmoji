import { describe, expect, it } from 'vitest'
import { outlineSvg, setSvgSize } from './svg'

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path d="M0 0h36v36H0z"/></svg>'

describe('setSvgSize', () => {
  it('注入 width/height 且保留 viewBox', () => {
    const out = setSvgSize(SAMPLE, 256)
    expect(out).toContain('width="256"')
    expect(out).toContain('height="256"')
    expect(out).toContain('viewBox="0 0 36 36"')
  })

  it('覆盖已有的 width/height', () => {
    const withSize = '<svg width="10" height="10" viewBox="0 0 36 36"></svg>'
    const out = setSvgSize(withSize, 64)
    expect(out).toContain('width="64"')
    expect(out).not.toContain('width="10"')
  })

  it('非 SVG 抛错', () => {
    expect(() => setSvgSize('<div/>', 64)).toThrow()
  })
})

describe('outlineSvg', () => {
  it('viewBox 四周外扩 radius+1', () => {
    const out = outlineSvg(SAMPLE, 2, '#ffffff')
    expect(out).toContain('viewBox="-3 -3 42 42"')
  })

  it('内容复制为下层描边副本：CSS 强制配色 + 圆角描边', () => {
    const out = outlineSvg(SAMPLE, 2, '#000000')
    expect(out).toContain('stroke-width:4 !important')
    expect(out).toContain('stroke-linejoin:round')
    expect(out).toContain('fill:#000000 !important')
    // 副本在前（下层），原内容在后（上层）
    expect(out).toContain('<g class="__ol"><path d="M0 0h36v36H0z"/></g><path d="M0 0h36v36H0z"/></svg>')
  })

  it('原始内容出现两次且未被修改', () => {
    const out = outlineSvg(SAMPLE, 1.5, '#000000')
    expect(out.split('<path d="M0 0h36v36H0z"/>').length - 1).toBe(2)
  })

  it('缺少 viewBox 抛错', () => {
    expect(() => outlineSvg('<svg xmlns="x"></svg>', 2, '#fff')).toThrow()
  })
})
