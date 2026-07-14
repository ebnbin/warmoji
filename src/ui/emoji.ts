import Phaser from 'phaser'
import { OUTLINE, OUTLINED_EMOJIS, PRELOAD_EMOJIS } from '../core/config'
import type { OutlineKind } from '../core/config'
import { emojiCodepoints } from '../core/emoji'
import { outlineSvg, setSvgSize } from '../core/svg'

// twemoji 全集（@twemoji/svg，构建时同步到 public/emoji/<版本>/，图形 CC-BY 4.0）。
// 加载管线：fetch SVG 文本 → core/svg.ts 纯函数改写 → 光栅化 → Phaser 纹理；
// 描边按阵营配色（player 黑 / enemy 紫 / enemyShot 红），每色一个纹理变体。
// 启动只预载 PRELOAD_EMOJIS，其余按需 ensureEmoji，超 LRU 上限淘汰最久未用。
const RASTER = 256
const LRU_LIMIT = 256

const inflight = new Map<string, Promise<string>>()
const lastUsed = new Map<string, number>()
const pinned = new Set<string>()
let useTick = 0

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
  enemyShot: '-olr',
}

export function emojiKey(emoji: string, outline?: OutlineKind): string {
  return `emoji-${emojiCodepoints(emoji)}${outline ? KIND_SUFFIX[outline] : ''}`
}

function emojiUrl(emoji: string): string {
  return `/emoji/${__TWEMOJI_VERSION__}/${emojiCodepoints(emoji)}.svg`
}

/** SVG 文本 → 位图（尺寸由 SVG 自身的 width/height 决定），图鉴图集也复用 */
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

export function emojiSvgUrl(emoji: string): string {
  return emojiUrl(emoji)
}

async function createTexture(scene: Phaser.Scene, emoji: string, outline?: OutlineKind): Promise<string> {
  const key = emojiKey(emoji, outline)
  const res = await fetch(emojiUrl(emoji))
  if (!res.ok) throw new Error(`HTTP ${res.status} ${emojiUrl(emoji)}`)
  const raw = await res.text()
  const svg = outline ? outlineSvg(raw, OUTLINE.radius, OUTLINE.colors[outline]) : raw
  scene.textures.addImage(key, await svgToImage(setSvgSize(svg, RASTER)))
  return key
}

/** 确保 emoji 纹理可用（按需 fetch + 改写 + 光栅化），并发去重 */
export function ensureEmoji(scene: Phaser.Scene, emoji: string, outline?: OutlineKind): Promise<string> {
  const key = emojiKey(emoji, outline)
  lastUsed.set(key, ++useTick)
  if (scene.textures.exists(key)) return Promise.resolve(key)
  const pending = inflight.get(key)
  if (pending) return pending
  const p = createTexture(scene, emoji, outline)
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

/** 启动预载：游戏当前用到的全部 emoji（含各阵营描边变体），预载纹理不参与 LRU 淘汰 */
export async function loadEmojiTextures(scene: Phaser.Scene): Promise<void> {
  const jobs: Promise<string>[] = PRELOAD_EMOJIS.map((emoji) => ensureEmoji(scene, emoji))
  for (const kind of Object.keys(OUTLINED_EMOJIS) as OutlineKind[]) {
    for (const emoji of OUTLINED_EMOJIS[kind]) jobs.push(ensureEmoji(scene, emoji, kind))
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
  emoji: string,
  size: number,
  outline?: OutlineKind,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, emojiKey(emoji, outline)).setDisplaySize(size, size)
}

/** 图标 + 文字的水平居中组合 */
export function iconLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoji: string,
  iconSize: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Container {
  const label = scene.add.text(0, 0, text, style).setOrigin(0, 0.5)
  const icon = emojiImage(scene, 0, 0, emoji, iconSize)
  const gap = 10
  const total = iconSize + gap + label.width
  icon.setX(-total / 2 + iconSize / 2)
  label.setX(-total / 2 + iconSize + gap)
  return scene.add.container(x, y, [icon, label])
}
