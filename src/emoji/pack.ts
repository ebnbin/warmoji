// 纯逻辑，禁 DOM。ordering.txt 每行一个 ordering ID（全项目唯一标识），twemoji.txt 每行一个去 header 的 SVG 正文，行序对齐；
// emoji 不作为字符/字体使用

const EMOJI_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">'

export interface EmojiPack {
  /** ordering 顺序的全部 ID */
  readonly ids: readonly string[]
  /** ID → 去 header 的 SVG 正文 */
  readonly bodyById: ReadonlyMap<string, string>
}

/** 行数不齐 / ID 重复 / 空正文即抛错 */
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

/** 不在库中返回 null */
export function packSvg(pack: EmojiPack, id: string): string | null {
  const body = pack.bodyById.get(id)
  if (body === undefined) return null
  return `${EMOJI_HEADER}${body}</svg>`
}

function allEmojiIds(pack: EmojiPack): readonly string[] {
  return pack.ids
}

/** ID 里带下划线连接的肤色修饰符（1f3fb..1f3ff）；独立 component 不含下划线，不算变体 */
function isSkinToneVariant(id: string): boolean {
  return /_1f3f[b-f]/.test(id)
}

export function visibleEmojiIds(pack: EmojiPack, showSkinTone: boolean): readonly string[] {
  const ids = allEmojiIds(pack)
  return showSkinTone ? ids : ids.filter((id) => !isSkinToneVariant(id))
}
