/** 一张 emoji 的画框边长，SVG 单位 */
export const EMOJI_BOX = 36

const EMOJI_HEADER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${EMOJI_BOX} ${EMOJI_BOX}">`

export interface EmojiPack {
  /** 有图的 emoji，按 ordering 的顺序 */
  readonly ids: readonly string[]
  readonly bodyById: ReadonlyMap<string, string>
}

/** twemoji 与 ordering 逐行对应，空行是这个码位没有图 */
export function parseEmojiPack(orderingText: string, twemojiText: string): EmojiPack {
  const all = orderingText.split('\n').map((l) => l.trim()).filter(Boolean)
  if (all.length === 0) throw new Error('emoji ordering 为空')
  const bodies = twemojiText.split('\n')
  if (bodies.length === all.length + 1 && bodies[bodies.length - 1] === '') bodies.pop()
  if (bodies.length !== all.length) {
    throw new Error(`emoji 资源错位：ordering ${all.length} 行 vs twemoji ${bodies.length} 行`)
  }
  const seen = new Set<string>()
  const ids: string[] = []
  const bodyById = new Map<string, string>()
  all.forEach((id, i) => {
    if (seen.has(id)) throw new Error(`emoji 资源 ID 重复：${id}`)
    seen.add(id)
    const body = bodies[i]!
    if (body.length === 0) return
    ids.push(id)
    bodyById.set(id, body)
  })
  if (ids.length === 0) throw new Error('emoji 资源全是空行')
  return { ids, bodyById }
}

export function packSvg(pack: EmojiPack, id: string): string | null {
  const body = pack.bodyById.get(id)
  if (body === undefined) return null
  return `${EMOJI_HEADER}${body}</svg>`
}
