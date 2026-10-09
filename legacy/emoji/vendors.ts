/** 一种 emoji 画风：资源是 scripts/emoji/<id>.txt，与 ordering 逐行对应；header 的 viewBox 是画框，padding 是光栅前四周垫的留白，与画框同单位 */
export interface EmojiVendor {
  readonly name: string
  readonly header: string
  readonly padding: number
  readonly credit: string
}

export const EMOJI_VENDORS = {
  twemoji: {
    name: 'Twemoji',
    header: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">',
    padding: 6,
    credit: 'emoji graphics © Twemoji · CC-BY 4.0 · 有改动',
  },
  noto: {
    name: 'Noto',
    header: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128">',
    padding: 16,
    credit: 'emoji graphics © Google Noto Emoji · Apache 2.0 · 有改动',
  },
} as const satisfies Record<string, EmojiVendor>

export type EmojiVendorId = keyof typeof EMOJI_VENDORS

export const DEFAULT_VENDOR: EmojiVendorId = 'noto'

export function isVendorId(v: unknown): v is EmojiVendorId {
  return typeof v === 'string' && Object.hasOwn(EMOJI_VENDORS, v)
}

/** header 里 viewBox 的宽高 */
export function vendorBox(v: EmojiVendor): { readonly w: number; readonly h: number } {
  const vb = /viewBox="([^"]+)"/.exec(v.header)?.[1]
  const parts = vb?.trim().split(/[\s,]+/).map(Number) ?? []
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw new Error(`emoji 画风的 header 缺少有效的 viewBox：${v.header}`)
  return { w: parts[2]!, h: parts[3]! }
}
