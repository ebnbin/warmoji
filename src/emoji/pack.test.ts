import { describe, expect, it } from 'vitest'
import { EMOJI_HEADER, allEmojiIds, packSvg, parseEmojiPack } from './pack'

// 第三个是肤色变体 component（以 ordering 为准，一律保留、不过滤）
const ordering = '1f600\n1f44b\n1f44b_1f3fb'
const twemoji = '<circle r="1"/>\n<path d="M0 0"/>\n<path d="M1 1"/>'
const pack = (): ReturnType<typeof parseEmojiPack> => parseEmojiPack(ordering, twemoji)

describe('parseEmojiPack', () => {
  it('两份行对齐文件解析出 id → 正文 映射', () => {
    const p = pack()
    expect(p.ids).toHaveLength(3)
    expect(p.bodyById.get('1f600')).toBe('<circle r="1"/>')
    expect(p.bodyById.get('1f44b_1f3fb')).toBe('<path d="M1 1"/>')
  })

  it('容许 twemoji 文件尾的单个空行', () => {
    expect(parseEmojiPack(ordering, twemoji + '\n').ids).toHaveLength(3)
  })

  it('行数不齐 → 报错', () => {
    expect(() => parseEmojiPack('a\nb', 'x')).toThrow('错位')
  })

  it('ID 重复 → 报错', () => {
    expect(() => parseEmojiPack('a\na', 'x\ny')).toThrow('重复')
  })

  it('空正文 → 报错', () => {
    expect(() => parseEmojiPack('a\nb\nc', 'x\n\nz')).toThrow('为空')
  })
})

describe('packSvg', () => {
  it('拼出完整 SVG（统一 header + 正文 + 闭合）；未收录返回 null', () => {
    const p = pack()
    expect(packSvg(p, '1f600')).toBe(`${EMOJI_HEADER}<circle r="1"/></svg>`)
    expect(packSvg(p, 'ffff')).toBeNull()
  })
})

describe('allEmojiIds', () => {
  it('ordering 全量 ID（保持顺序，肤色/component 一律保留）', () => {
    expect([...allEmojiIds(pack())]).toEqual(['1f600', '1f44b', '1f44b_1f3fb'])
  })
})
