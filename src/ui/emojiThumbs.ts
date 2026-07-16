import Phaser from 'phaser'
import { codepointsToEmoji } from '../core/emoji'
import { setSvgSize } from '../core/svg'
import { emojiSvgText, svgToImage } from './emoji'

// 全量 emoji 缩略图（图鉴「全部」页与 Studio 素材区共用）：feed 流按需
// 光栅化——滚到哪个格子，哪个格子自己渲染自己的纹理，无前置全量构建、
// 无 loading。页内缓存（Map），滚回来零等待；退出场景全量释放。光栅化
// 尺寸按设备渲染缩放量化到 8px 档位（物理像素 1:1 清晰），档位不变时
// 缓存跨场景 restart（旋转/切类别/切 tab）保留，跨档才作废重建。

/** 显示逻辑尺寸 × 设备渲染缩放 → 量化到 8px 档位的光栅化尺寸 */
export function emojiThumbSize(displayPx: number, renderScale: number): number {
  return Math.ceil((displayPx * renderScale) / 8) * 8
}

let thumbSize = 0
/** 代数：prepare 换档 / release 时 +1，在途任务凭代数自弃，不往新纪元里塞旧纹理 */
let generation = 0
const ready = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

function keyOf(cp: string): string {
  return `thumb-${cp}`
}

/** 进入消费场景时调用：同档位复用既有缓存；换档则全量作废 */
export function prepareEmojiThumbs(scene: Phaser.Scene, size: number): void {
  if (size === thumbSize) return
  generation++
  for (const key of ready.values()) scene.textures.remove(key)
  ready.clear()
  inflight.clear()
  thumbSize = size
}

/** 缓存命中查询（同步）；未渲染过返回 undefined */
export function emojiThumbKey(cp: string): string | undefined {
  return ready.get(cp)
}

/** 按需光栅化一格（并发去重）；释放/换档后完成的任务自弃并返回 null */
export function requestEmojiThumb(scene: Phaser.Scene, cp: string): Promise<string | null> {
  const hit = ready.get(cp)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(cp)
  if (pending) return pending
  const gen = generation
  const size = thumbSize
  const p = (async (): Promise<string | null> => {
    try {
      const svg = await emojiSvgText(codepointsToEmoji(cp))
      const img = await svgToImage(setSvgSize(svg, size))
      if (gen !== generation) return null
      const key = keyOf(cp)
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img)
      ready.set(cp, key)
      return key
    } catch (err) {
      // 单格失败只留空（warn 不触发 e2e 的无 error 断言）
      console.warn(`emoji 缩略图渲染失败 ${cp}: ${String(err)}`)
      return null
    } finally {
      inflight.delete(cp)
    }
  })()
  inflight.set(cp, p)
  return p
}

/** 已就绪的缩略图数量（调试上报/e2e 断言用） */
export function emojiThumbsReady(): number {
  return ready.size
}

/** 退出消费场景：全部缩略纹理销毁、内存归零；在途任务凭代数自弃 */
export function releaseEmojiThumbs(scene: Phaser.Scene): void {
  generation++
  for (const key of ready.values()) scene.textures.remove(key)
  ready.clear()
  inflight.clear()
  thumbSize = 0
}
