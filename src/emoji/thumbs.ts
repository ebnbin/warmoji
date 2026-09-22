import Phaser from 'phaser'
import { setSvgSize } from './svg'
import { emojiSvgText, svgToImage } from './textures'

/** 量化到 8px 档位 */
export function emojiThumbSize(displayPx: number, renderScale: number): number {
  return Math.ceil((displayPx * renderScale) / 8) * 8
}

let thumbSize = 0
/** 换档 / release 时 +1，在途任务凭代数自弃 */
let generation = 0
const ready = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

function keyOf(cp: string): string {
  return `thumb-${cp}`
}

/** 同档位复用缓存；换档全量作废 */
export function prepareEmojiThumbs(scene: Phaser.Scene, size: number): void {
  if (size === thumbSize) return
  generation++
  for (const key of ready.values()) scene.textures.remove(key)
  ready.clear()
  inflight.clear()
  thumbSize = size
}

/** 未渲染过返回 undefined */
export function emojiThumbKey(cp: string): string | undefined {
  return ready.get(cp)
}

/** 并发去重；释放/换档后完成的任务返回 null */
export function requestEmojiThumb(scene: Phaser.Scene, cp: string): Promise<string | null> {
  const hit = ready.get(cp)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(cp)
  if (pending) return pending
  const gen = generation
  const size = thumbSize
  const p = (async (): Promise<string | null> => {
    try {
      const svg = await emojiSvgText(cp)
      const img = await svgToImage(setSvgSize(svg, size))
      if (gen !== generation) return null
      const key = keyOf(cp)
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img)
      ready.set(cp, key)
      return key
    } catch (err) {
      // warn 不触发 e2e 的无 error 断言
      console.warn(`emoji 缩略图渲染失败 ${cp}: ${String(err)}`)
      return null
    } finally {
      inflight.delete(cp)
    }
  })()
  inflight.set(cp, p)
  return p
}

export function emojiThumbsReady(): number {
  return ready.size
}

export function releaseEmojiThumbs(scene: Phaser.Scene): void {
  generation++
  for (const key of ready.values()) scene.textures.remove(key)
  ready.clear()
  inflight.clear()
  thumbSize = 0
}
