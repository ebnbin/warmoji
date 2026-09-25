import Phaser from 'phaser'
import { setSvgSize } from './svg'
import { emojiSvgText, svgToImage } from './textures'

export function emojiThumbSize(displayPx: number, renderScale: number): number {
  return Math.ceil((displayPx * renderScale) / 8) * 8
}

let thumbSize = 0
let generation = 0
const ready = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

function keyOf(cp: string): string {
  return `thumb-${cp}`
}

export function prepareEmojiThumbs(scene: Phaser.Scene, size: number): void {
  if (size === thumbSize) return
  generation++
  for (const key of ready.values()) scene.textures.remove(key)
  ready.clear()
  inflight.clear()
  thumbSize = size
}

export function emojiThumbKey(cp: string): string | undefined {
  return ready.get(cp)
}

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
      console.warn(`emoji 缩略图渲染失败 ${cp}: ${String(err)}`)
      return null
    } finally {
      inflight.delete(cp)
    }
  })()
  inflight.set(cp, p)
  return p
}

export function releaseEmojiThumbs(scene: Phaser.Scene): void {
  generation++
  for (const key of ready.values()) scene.textures.remove(key)
  ready.clear()
  inflight.clear()
  thumbSize = 0
}
