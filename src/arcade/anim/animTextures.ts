import type Phaser from 'phaser'
import { OUTLINE } from '../../emoji/svg'
import type { OutlineKind } from '../../emoji/svg'
import { animClipOf, bakeAnimFrame } from '../../emoji/anim'
import { outlineSvg, setSvgSize } from '../../emoji/svg'
import { emojiSvgText, svgToImage } from '../../emoji/textures'

// 帧纹理与静态纹理同规格（48 viewBox 全幅、描边烙进位图、光栅 256），换帧不改 scale 语义；
// clip 自带的 viewBox 只用于 Studio 取景，烘焙时忽略。emoji 以 ordering ID 标识，不作为字符使用
const RASTER = 256

const OUTLINE_SUFFIX: Record<OutlineKind, string> = {
  player: '-ol',
  enemy: '-ole',
  enemyProjectile: '-olr',
  elite: '-olg',
}

function animFrameKey(
  id: string,
  clipId: string,
  outline: OutlineKind | undefined,
  frame: number,
): string {
  return `anim-${id}-${clipId}${outline ? OUTLINE_SUFFIX[outline] : ''}-${frame}`
}

const inflight = new Map<string, Promise<string[] | null>>()

async function bakeClip(
  scene: Phaser.Scene,
  id: string,
  clipId: string,
  outline: OutlineKind | undefined,
): Promise<string[] | null> {
  const clip = animClipOf(id, clipId)
  if (!clip) return null
  const svg = await emojiSvgText(id)
  const recipe = { ...clip, viewBox: undefined }
  const keys: string[] = []
  for (let i = 0; i < clip.frames; i++) {
    const key = animFrameKey(id, clipId, outline, i)
    keys.push(key)
    if (scene.textures.exists(key)) continue
    let frame = bakeAnimFrame(svg, recipe, i / clip.frames)
    if (outline) frame = outlineSvg(frame, OUTLINE.radius, OUTLINE.colors[outline])
    const img = await svgToImage(setSvgSize(frame, RASTER))
    // 异步回来时场景可能已销毁（scene.textures 为空）
    if (!scene.textures || scene.textures.exists(key)) continue
    scene.textures.addImage(key, img)
  }
  return keys
}

const liveFrames = new Map<string, string[]>()

/** 同步返回帧 key 数组（可能为空），烘焙完成后就地填充；持有引用即可，不需重注册 */
export function clipFramesLive(
  scene: Phaser.Scene,
  id: string,
  clipId: string,
  outline?: OutlineKind,
): string[] {
  const key = animFrameKey(id, clipId, outline, -1)
  let arr = liveFrames.get(key)
  if (!arr) {
    const live: string[] = []
    liveFrames.set(key, live)
    arr = live
    void ensureClipTextures(scene, id, clipId, outline).then((keys) => {
      if (keys && live.length === 0) live.push(...keys)
    })
  }
  return arr
}

/** 该 emoji 没有这个 clip 时返回 null */
function ensureClipTextures(
  scene: Phaser.Scene,
  id: string,
  clipId: string,
  outline?: OutlineKind,
): Promise<string[] | null> {
  const clip = animClipOf(id, clipId)
  if (!clip) return Promise.resolve(null)
  const setKey = animFrameKey(id, clipId, outline, -1)
  const pending = inflight.get(setKey)
  if (pending) return pending
  const allExist = Array.from({ length: clip.frames }, (_, i) =>
    animFrameKey(id, clipId, outline, i),
  )
  if (allExist.every((k) => scene.textures.exists(k))) return Promise.resolve(allExist)
  const p = bakeClip(scene, id, clipId, outline)
    .catch((err) => {
      console.error(`动画帧烘焙失败 ${id}/${clipId}: ${String(err)}`)
      return null
    })
    .finally(() => inflight.delete(setKey))
  inflight.set(setKey, p)
  return p
}
