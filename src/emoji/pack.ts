// emoji 打包资源的解析层（纯逻辑，禁 DOM）。资源是从 Emoji Studio 直接引入、
// 随代码提交的两份「行对齐」文件（src/assets/emoji/，Unicode 官方 CLDR 顺序）：
//   ordering.txt —— 每行一个 emoji 的 ordering ID（= 全项目唯一标识）
//   twemoji.txt  —— 每行一个去 header 的 twemoji SVG 正文，行序 = ordering 行序
// 运行时全库仅两份文本；任意 emoji 的完整 SVG = 统一 header + 对应行正文 + 闭合。
// emoji 在本项目里永不作为「字符/字体」使用，只作为符号，其唯一 ID 即 ordering 行。

export const EMOJI_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">'

export interface EmojiPack {
  /** ordering 顺序的全部 ID */
  readonly ids: readonly string[]
  /** ID → 去 header 的 SVG 正文 */
  readonly bodyById: ReadonlyMap<string, string>
}

/** 解析并校验两份行对齐资源；行数不齐 / ID 重复 / 空正文即抛错（加载期暴露，不进运行时） */
export function parseEmojiPack(orderingText: string, twemojiText: string): EmojiPack {
  const ids = orderingText.split('\n').map((l) => l.trim()).filter(Boolean)
  if (ids.length === 0) throw new Error('emoji ordering 为空')
  const bodies = twemojiText.split('\n')
  // 容许文件尾的单个空行
  if (bodies.length === ids.length + 1 && bodies[bodies.length - 1] === '') bodies.pop()
  if (bodies.length !== ids.length) {
    throw new Error(`emoji 资源错位：ordering ${ids.length} 行 vs twemoji ${bodies.length} 行`)
  }
  const bodyById = new Map<string, string>()
  ids.forEach((id, i) => {
    if (bodyById.has(id)) throw new Error(`emoji 资源 ID 重复：${id}`)
    const body = bodies[i]!
    if (body.length === 0) throw new Error(`emoji 资源正文为空：${id}`)
    bodyById.set(id, body)
  })
  return { ids, bodyById }
}

/** ID → 完整 SVG 文本（统一 header + 正文 + 闭合）；不在库中返回 null */
export function packSvg(pack: EmojiPack, id: string): string | null {
  const body = pack.bodyById.get(id)
  if (body === undefined) return null
  return `${EMOJI_HEADER}${body}</svg>`
}

/** 图鉴「全部」页清单：ordering 全量 ID（保持顺序）。以 ordering 为准，肤色/component 一律保留 */
export function allEmojiIds(pack: EmojiPack): readonly string[] {
  return pack.ids
}

/** 肤色变体：ID 里带下划线连接的肤色修饰符（1f3fb..1f3ff）。
 * 独立的 component（肤色修饰符/发型本体，如 1f3fb、1f9b0）不含下划线，不算变体、不受此判据影响。 */
export function isSkinToneVariant(id: string): boolean {
  return /_1f3f[b-f]/.test(id)
}

/** 全库清单按「显示肤色」开关过滤：关时剔除肤色变体，component 不受影响 */
export function visibleEmojiIds(pack: EmojiPack, showSkinTone: boolean): readonly string[] {
  const ids = allEmojiIds(pack)
  return showSkinTone ? ids : ids.filter((id) => !isSkinToneVariant(id))
}
