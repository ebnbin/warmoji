import { describe, expect, it } from 'vitest'
import { hydrate } from './hydrate'
import { UNIT } from './units'

describe('数据水合', () => {
  it('"Nu" 按格换算成逻辑 px，支持小数与负数', () => {
    expect(hydrate<number>('13u')).toBe(13 * UNIT)
    expect(hydrate<number>('0.45u')).toBe(0.45 * UNIT)
    expect(hydrate<number>('-2u')).toBe(-2 * UNIT)
  })

  it('"Ndeg" 换算成弧度', () => {
    expect(hydrate<number>('90deg')).toBeCloseTo(Math.PI / 2)
    expect(hydrate<number>('135deg')).toBeCloseTo((3 * Math.PI) / 4)
    expect(hydrate<number>('0deg')).toBe(0)
  })

  it('"0x…" 十六进制颜色换算成数值', () => {
    expect(hydrate<number>('0x9575cd')).toBe(0x9575cd)
    expect(hydrate<number>('0xFF7043')).toBe(0xff7043)
  })

  it('纯数字/普通字符串/布尔原样通过', () => {
    expect(hydrate<number>(16)).toBe(16)
    expect(hydrate<string>('🍅')).toBe('🍅')
    expect(hydrate<string>('unicorn')).toBe('unicorn')
    expect(hydrate<boolean>(true)).toBe(true)
  })

  it('深层对象与数组递归换算，原数据不被修改', () => {
    const src = { a: [{ b: '2u' }], c: { d: '45deg', e: 'x' } }
    const out = hydrate<{ a: { b: number }[]; c: { d: number; e: string } }>(src)
    expect(out.a[0]!.b).toBe(2 * UNIT)
    expect(out.c.d).toBeCloseTo(Math.PI / 4)
    expect(out.c.e).toBe('x')
    expect(src.a[0]!.b).toBe('2u')
  })
})
