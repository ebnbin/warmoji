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

  it('注入膨胀滤镜并把原内容包进滤镜组', () => {
    const out = outlineSvg(SAMPLE, 2, '#ffffff')
    expect(out).toContain('feMorphology')
    expect(out).toContain('radius="2"')
    expect(out).toContain('flood-color="#ffffff"')
    expect(out).toContain('<g filter="url(#ol)"><path d="M0 0h36v36H0z"/></g></svg>')
  })

  it('原始内容不丢失、不修改', () => {
    const out = outlineSvg(SAMPLE, 1.5, '#000000')
    expect(out).toContain('<path d="M0 0h36v36H0z"/>')
  })

  it('缺少 viewBox 抛错', () => {
    expect(() => outlineSvg('<svg xmlns="x"></svg>', 2, '#fff')).toThrow()
  })
})
