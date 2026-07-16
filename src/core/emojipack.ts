// emoji 打包资源的解析层（纯逻辑，禁 DOM）。资源由 scripts/sync-emoji.mjs
// 构建期生成：index.json（Unicode 官方 CLDR 顺序 ∩ twemoji 的索引与元数据）
// + pack.txt（每行一个去 header 的 SVG 正文，行序 = 索引序）。
// 运行时全库仅两个请求；任意 emoji 的完整 SVG = 统一 header + 行正文 + 闭合。

export const EMOJI_PACK_FORMAT = 'warmoji-emoji@1'

export interface EmojiIndexEntry {
  /** twemoji key（码点小写连字符，无 ZWJ 序列已去 FE0F）——与 emojiCodepoints 输出一致 */
  readonly c: string
  /** fully-qualified emoji 字符 */
  readonly e: string
  /** Unicode 官方英文名 */
  readonly n: string
  /** groups 下标 */
  readonly g: number
}

export interface EmojiIndex {
  readonly format: string
  readonly unicodeVersion: string
  readonly twemojiVersion: string
  readonly header: string
  readonly groups: readonly string[]
  readonly emojis: readonly EmojiIndexEntry[]
}

export interface EmojiPack {
  readonly header: string
  readonly unicodeVersion: string
  readonly twemojiVersion: string
  readonly groups: readonly string[]
  /** CLDR 顺序的全部条目 */
  readonly entries: readonly EmojiIndexEntry[]
  readonly bodyByKey: ReadonlyMap<string, string>
}

/** 解析并校验打包资源；格式/对齐不符即抛错（加载期暴露，不进运行时） */
export function parseEmojiPack(index: EmojiIndex, packText: string): EmojiPack {
  if (index.format !== EMOJI_PACK_FORMAT) {
    throw new Error(`emoji 资源格式不符：期望 ${EMOJI_PACK_FORMAT}，得到 ${String(index.format)}`)
  }
  if (!index.header.startsWith('<svg ') || !index.header.endsWith('>')) {
    throw new Error('emoji 资源 header 非法')
  }
  const lines = packText.split('\n')
  if (lines.length === 1 && lines[0] === '') {
    throw new Error('emoji 打包文件为空')
  }
  if (lines.length !== index.emojis.length) {
    throw new Error(`emoji 资源错位：索引 ${index.emojis.length} 条 vs 打包 ${lines.length} 行`)
  }
  const bodyByKey = new Map<string, string>()
  index.emojis.forEach((entry, i) => {
    if (bodyByKey.has(entry.c)) throw new Error(`emoji 资源 key 重复：${entry.c}`)
    bodyByKey.set(entry.c, lines[i]!)
  })
  return {
    header: index.header,
    unicodeVersion: index.unicodeVersion,
    twemojiVersion: index.twemojiVersion,
    groups: index.groups,
    entries: index.emojis,
    bodyByKey,
  }
}

/** key → 完整 SVG 文本（统一 header + 正文 + 闭合）；不在库中返回 null */
export function packSvg(pack: EmojiPack, key: string): string | null {
  const body = pack.bodyByKey.get(key)
  if (body === undefined) return null
  return `${pack.header}${body}</svg>`
}

// 肤色修饰符 1F3FB..1F3FF：含任一段即视为肤色变体
const TONES = new Set(['1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff'])

/** 图鉴「全部」页清单：剔除肤色变体的基础形态 key（保持 CLDR 顺序） */
export function packBaseKeys(pack: EmojiPack): string[] {
  return pack.entries
    .map((e) => e.c)
    .filter((key) => !key.split('-').some((seg) => TONES.has(seg)))
}
