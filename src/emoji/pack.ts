const EMOJI_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">'

export interface EmojiPack {
  readonly ids: readonly string[]
  readonly bodyById: ReadonlyMap<string, string>
}

export function parseEmojiPack(orderingText: string, twemojiText: string): EmojiPack {
  const ids = orderingText.split('\n').map((l) => l.trim()).filter(Boolean)
  if (ids.length === 0) throw new Error('emoji ordering 为空')
  const bodies = twemojiText.split('\n')
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

export function packSvg(pack: EmojiPack, id: string): string | null {
  const body = pack.bodyById.get(id)
  if (body === undefined) return null
  return `${EMOJI_HEADER}${body}</svg>`
}

function allEmojiIds(pack: EmojiPack): readonly string[] {
  return pack.ids
}

function isSkinToneVariant(id: string): boolean {
  return /_1f3f[b-f]/.test(id)
}

export function visibleEmojiIds(pack: EmojiPack, showSkinTone: boolean): readonly string[] {
  const ids = allEmojiIds(pack)
  return showSkinTone ? ids : ids.filter((id) => !isSkinToneVariant(id))
}
