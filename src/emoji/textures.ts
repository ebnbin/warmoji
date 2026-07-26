import Phaser from 'phaser'
import { OUTLINE } from './svg'
import type { OutlineKind } from './svg'
import { packSvg, parseEmojiPack } from './pack'
import type { EmojiPack } from './pack'
import { EMOJI_PAD, outlineSvg, padSvg, setSvgSize } from './svg'

// twemoji 全集打包资源（ordering.txt + twemoji.txt，源在 scripts/emoji/，gen 拷进
// src/assets/emoji/；图形 CC-BY 4.0）：PreloadScene 门禁预加载后经 primeEmojiPack 注入，任意 emoji 的
// SVG 文本同步可取。emoji 全项目以 ordering ID 为唯一标识，从不作为字符/字体使用。
// 纹理管线：SVG 文本 → svg.ts 纯函数改写 → 光栅化 → Phaser 纹理；
// 描边按阵营配色（player 黑 / enemy 紫 / enemyProjectile 红 / elite 金），每色一个纹理变体。
// 启动只预载 PRELOAD_EMOJIS，其余按需 ensureEmoji，超 LRU 上限淘汰最久未用。
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

/** 预加载注入：PreloadScene 拿到两份构建资产后解析并解锁全部等待方（幂等）。
 * 解析失败即抛错——资源门禁不放行 */
export function primeEmojiPack(orderingText: string, twemojiText: string): void {
  const pack = parseEmojiPack(orderingText, twemojiText)
  void packDeferred()
  resolvePack?.(pack)
}

/** 打包资源（PreloadScene 注入前保持等待） */
export function loadEmojiPack(): Promise<EmojiPack> {
  return packDeferred()
}


/** ordering ID → 完整 SVG 文本（未收录即抛错）。
 * 项目规范的唯一注入点：viewBox 统一 pad 成 48 标准（内容 36 居中 + 四周 6），
 * 纹理/缩略图/Studio 全部经此出口——任何 emoji 素材天生自带 padding */
export async function emojiSvgText(id: string): Promise<string> {
  const pack = await loadEmojiPack()
  const svg = packSvg(pack, id)
  if (!svg) throw new Error(`emoji 不在打包资源中: ${id}`)
  return padSvg(svg, EMOJI_PAD)
}

/** dev 面板诊断：存活 emoji 纹理数与固定预载数（LRU 上限只约束非固定部分） */
export function emojiCacheStats(scene: Phaser.Scene): { textures: number; pinned: number } {
  return {
    textures: scene.textures.getTextureKeys().filter((k) => k.startsWith('emoji-')).length,
    pinned: pinned.size,
  }
}

// player 沿用旧后缀 '-ol'，其余按阵营命名
const KIND_SUFFIX: Record<OutlineKind, string> = {
  player: '-ol',
  enemy: '-ole',
  enemyProjectile: '-olr',
  elite: '-olg',
}

export function emojiKey(id: string, outline?: OutlineKind): string {
  return `emoji-${id}${outline ? KIND_SUFFIX[outline] : ''}`
}

/** SVG 文本 → 位图（尺寸由 SVG 自身的 width/height 决定），图鉴缩略图也复用 */
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

/** 确保 emoji 纹理可用（按需取正文 + 改写 + 光栅化），并发去重 */
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

/** 启动预载：清单由 boot 注入（本包不依赖游戏内容），预载纹理不参与 LRU 淘汰 */
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
