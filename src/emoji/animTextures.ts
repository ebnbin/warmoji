import type Phaser from 'phaser'
import { OUTLINE } from '../config'
import type { OutlineKind } from '../config'
import { emojiCodepoints } from './codepoints'
import { animClipOf, bakeAnimFrame } from './studio'
import { outlineSvg, setSvgSize } from './svg'
import { emojiSvgText, svgToImage } from './textures'

// 动画帧纹理烘焙层：clip（core/studio 的关键帧配方）→ 每帧一张 Phaser 纹理。
// 与静态纹理同规格：48 标准 viewBox 全幅、描边烙进位图、光栅 256——
// 这样任何拿 emoji 纹理换算 scale 的消费者（成员呼吸、出生 tween）无需感知
// 当前贴的是静态帧还是动画帧。clip 自带的 viewBox 只是 Studio 的取景放大，
// 游戏内烘焙一律忽略。惰性按需烘焙 + 并发去重；帧数少（10~12）不参与 LRU。
const RASTER = 256

const OUTLINE_SUFFIX: Record<OutlineKind, string> = {
  player: '-ol',
  enemy: '-ole',
  enemyShot: '-olr',
  elite: '-olg',
}

export function animFrameKey(
  emoji: string,
  clipId: string,
  outline: OutlineKind | undefined,
  frame: number,
): string {
  return `anim-${emojiCodepoints(emoji)}-${clipId}${outline ? OUTLINE_SUFFIX[outline] : ''}-${frame}`
}

const inflight = new Map<string, Promise<string[] | null>>()

async function bakeClip(
  scene: Phaser.Scene,
  emoji: string,
  clipId: string,
  outline: OutlineKind | undefined,
): Promise<string[] | null> {
  const clip = animClipOf(emoji, clipId)
  if (!clip) return null
  const svg = await emojiSvgText(emoji)
  const recipe = { ...clip, viewBox: undefined }
  const keys: string[] = []
  for (let i = 0; i < clip.frames; i++) {
    const key = animFrameKey(emoji, clipId, outline, i)
    keys.push(key)
    if (scene.textures.exists(key)) continue
    let frame = bakeAnimFrame(svg, recipe, i / clip.frames)
    if (outline) frame = outlineSvg(frame, OUTLINE.radius, OUTLINE.colors[outline])
    const img = await svgToImage(setSvgSize(frame, RASTER))
    // 光栅化是异步的，场景可能已切换/重启——纹理管理器还在才写入
    if (!scene.textures || scene.textures.exists(key)) continue
    scene.textures.addImage(key, img)
  }
  return keys
}

const liveFrames = new Map<string, string[]>()

/** 帧 key 的「活数组」：同步立即返回（可能为空），烘焙完成后就地填充。
 * Animator.register 持有引用即可自动接上，调用方无需回调/重注册。
 * 模块级缓存跨场景重启复用（纹理本就是全局的，重启不重烘） */
export function clipFramesLive(
  scene: Phaser.Scene,
  emoji: string,
  clipId: string,
  outline?: OutlineKind,
): string[] {
  const key = animFrameKey(emoji, clipId, outline, -1)
  let arr = liveFrames.get(key)
  if (!arr) {
    const live: string[] = []
    liveFrames.set(key, live)
    arr = live
    void ensureClipTextures(scene, emoji, clipId, outline).then((keys) => {
      if (keys && live.length === 0) live.push(...keys)
    })
  }
  return arr
}

/** 确保某 emoji 某 clip 的整套帧纹理可用，返回按帧序的纹理 key 数组；
 * 该 emoji 没有这个 clip 时返回 null（调用方保持静态纹理即可） */
export function ensureClipTextures(
  scene: Phaser.Scene,
  emoji: string,
  clipId: string,
  outline?: OutlineKind,
): Promise<string[] | null> {
  const clip = animClipOf(emoji, clipId)
  if (!clip) return Promise.resolve(null)
  const setKey = animFrameKey(emoji, clipId, outline, -1)
  const pending = inflight.get(setKey)
  if (pending) return pending
  const allExist = Array.from({ length: clip.frames }, (_, i) =>
    animFrameKey(emoji, clipId, outline, i),
  )
  if (allExist.every((k) => scene.textures.exists(k))) return Promise.resolve(allExist)
  const p = bakeClip(scene, emoji, clipId, outline)
    .catch((err) => {
      console.error(`动画帧烘焙失败 ${emoji}/${clipId}: ${String(err)}`)
      return null
    })
    .finally(() => inflight.delete(setKey))
  inflight.set(setKey, p)
  return p
}
