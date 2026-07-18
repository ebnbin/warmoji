import { describe, expect, it } from 'vitest'
import { EMOJI_PACK_FORMAT, packBaseKeys, packSvg, parseEmojiPack } from './pack'
import type { EmojiIndex } from './pack'

const HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">'
const index: EmojiIndex = {
  format: EMOJI_PACK_FORMAT,
  unicodeVersion: '17.0',
  twemojiVersion: '15.0.0',
  header: HEADER,
  groups: ['Smileys & Emotion', 'People & Body'],
  emojis: [
    { c: '1f600', e: '😀', n: 'grinning face', g: 0 },
    { c: '1f44b', e: '👋', n: 'waving hand', g: 1 },
    { c: '1f44b-1f3fb', e: '👋🏻', n: 'waving hand: light skin tone', g: 1 },
  ],
}
const pack = () => parseEmojiPack(index, '<circle r="1"/>\n<path d="M0 0"/>\n<path d="M1 1"/>')

describe('parseEmojiPack', () => {
  it('索引与打包按行对齐', () => {
    const p = pack()
    expect(p.entries).toHaveLength(3)
    expect(p.bodyByKey.get('1f44b')).toBe('<path d="M0 0"/>')
  })

  it('格式版本不符 → 报错', () => {
    expect(() => parseEmojiPack({ ...index, format: 'x@0' }, 'a')).toThrow('格式不符')
  })

  it('行数与条目数错位 → 报错', () => {
    expect(() => parseEmojiPack(index, 'a\nb')).toThrow('错位')
  })

  it('key 重复 → 报错', () => {
    const dup = { ...index, emojis: [index.emojis[0]!, index.emojis[0]!] }
    expect(() => parseEmojiPack(dup, 'a\nb')).toThrow('重复')
  })
})

describe('packSvg', () => {
  it('拼出完整 SVG；未收录返回 null', () => {
    const p = pack()
    expect(packSvg(p, '1f600')).toBe(`${HEADER}<circle r="1"/></svg>`)
    expect(packSvg(p, 'ffff')).toBeNull()
  })
})

describe('packBaseKeys', () => {
  it('剔除肤色变体，保持顺序', () => {
    expect(packBaseKeys(pack())).toEqual(['1f600', '1f44b'])
  })
})
