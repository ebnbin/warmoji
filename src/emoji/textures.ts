import Phaser from 'phaser'
import { OUTLINE } from './svg'
import type { OutlineKind } from './svg'
import { packSvg, parseEmojiPack } from './pack'
import type { EmojiPack } from './pack'
import { EMOJI_PAD, outlineSvg, padSvg, setSvgSize } from './svg'

const RASTER = 256
const LRU_LIMIT = 256

const inflight = new Map<string, Promise<string>>()
const lastUsed = new Map<string, number>()
const pinned = new Set<string>()
let useTick = 0

let packPromise: Promise<EmojiPack> | undefined
let resolvePack: ((pack: EmojiPack) => void) | undefined

function packDeferred(): Promise<EmojiPack> {
  if (!packPromise) {
    packPromise = new Promise<EmojiPack>((resolve) => {
      resolvePack = resolve
    })
  }
  return packPromise
}

/** 幂等；解析失败即抛错 */
export function primeEmojiPack(orderingText: string, twemojiText: string): void {
  const pack = parseEmojiPack(orderingText, twemojiText)
  void packDeferred()
  resolvePack?.(pack)
}

/** primeEmojiPack 之前保持等待 */
export function loadEmojiPack(): Promise<EmojiPack> {
  return packDeferred()
}

/** 未收录即抛错；viewBox 统一 pad 成 48 标准的唯一注入点 */
export async function emojiSvgText(id: string): Promise<string> {
  const pack = await loadEmojiPack()
  const svg = packSvg(pack, id)
  if (!svg) throw new Error(`emoji 不在打包资源中: ${id}`)
  return padSvg(svg, EMOJI_PAD)
}

/** LRU 上限只约束非预载部分 */
export function emojiCacheStats(scene: Phaser.Scene): { textures: number; pinned: number } {
  return {
    textures: scene.textures.getTextureKeys().filter((k) => k.startsWith('emoji-')).length,
    pinned: pinned.size,
  }
}

const KIND_SUFFIX: Record<OutlineKind, string> = {
  player: '-ol',
  enemy: '-ole',
  enemyProjectile: '-olr',
  elite: '-olg',
}

export function emojiKey(id: string, outline?: OutlineKind): string {
  return `emoji-${id}${outline ? KIND_SUFFIX[outline] : ''}`
}

/** 尺寸由 SVG 自身的 width/height 决定 */
export async function svgToImage(svgText: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG 光栅化失败'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createTexture(scene: Phaser.Scene, id: string, outline?: OutlineKind): Promise<string> {
  const key = emojiKey(id, outline)
  const raw = await emojiSvgText(id)
  const svg = outline ? outlineSvg(raw, OUTLINE.radius, OUTLINE.colors[outline]) : raw
  scene.textures.addImage(key, await svgToImage(setSvgSize(svg, RASTER)))
  return key
}

/** 并发去重 */
export function ensureEmoji(scene: Phaser.Scene, id: string, outline?: OutlineKind): Promise<string> {
  const key = emojiKey(id, outline)
  lastUsed.set(key, ++useTick)
  if (scene.textures.exists(key)) return Promise.resolve(key)
  const pending = inflight.get(key)
  if (pending) return pending
  const p = createTexture(scene, id, outline)
    .then((k) => {
      evictIfNeeded(scene)
      return k
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

function evictIfNeeded(scene: Phaser.Scene): void {
  const candidates = [...lastUsed.entries()].filter(
    ([k]) => !pinned.has(k) && scene.textures.exists(k),
  )
  if (candidates.length <= LRU_LIMIT) return
  candidates.sort((a, b) => a[1] - b[1])
  for (const [k] of candidates.slice(0, candidates.length - LRU_LIMIT)) {
    scene.textures.remove(k)
    lastUsed.delete(k)
  }
}

/** 预载纹理不参与 LRU 淘汰 */
export async function loadEmojiTextures(
  scene: Phaser.Scene,
  preload: readonly string[],
  outlined: Record<OutlineKind, readonly string[]>,
): Promise<void> {
  const jobs: Promise<string>[] = preload.map((id) => ensureEmoji(scene, id))
  for (const kind of Object.keys(outlined) as OutlineKind[]) {
    for (const id of outlined[kind]) jobs.push(ensureEmoji(scene, id, kind))
  }
  await Promise.all(
    jobs.map((p) =>
      p
        .then((key) => {
          pinned.add(key)
        })
        // console.error 让 e2e 的无报错断言能捕获资源缺失
        .catch((err) => console.error(`emoji 纹理加载失败: ${String(err)}`)),
    ),
  )
}

export function emojiImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  id: string,
  size: number,
  outline?: OutlineKind,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, emojiKey(id, outline)).setDisplaySize(size, size)
}
