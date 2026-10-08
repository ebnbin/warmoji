import type { AnimResource, PartKeyframe } from '../types/anim'

const pose = (kf: PartKeyframe): readonly number[] => [
  kf.rotate ?? 0,
  kf.tx ?? 0,
  kf.ty ?? 0,
  kf.scale ?? 1,
  kf.scaleX ?? 1,
  kf.scaleY ?? 1,
  kf.opacity ?? 1,
]

const samePose = (a: PartKeyframe, b: PartKeyframe): boolean => {
  const pa = pose(a)
  const pb = pose(b)
  return pa.every((v, i) => Math.abs(v - pb[i]!) < 1e-9)
}

/** 动画配方的问题；elementCount 给出这张 emoji 的顶层元素数，不在表情包里的给 undefined */
export function animIssues(data: AnimResource, elementCount: (emoji: string) => number | undefined): string[] {
  const out: string[] = []
  if (!(data.def.frames >= 2) || !(data.def.durMs > 0)) out.push('animations.def 的 frames 须 ≥ 2，durMs 须 > 0')
  for (const [key, entry] of Object.entries(data.animations)) {
    const at = `animations.${key}`
    if (!entry.emoji || !entry.name) out.push(`${at} 缺少 emoji 或 name`)
    if (entry.emoji !== key) out.push(`${at} 的 emoji 须与键相同：${entry.emoji}`)
    const count = elementCount(entry.emoji)
    if (count === undefined) out.push(`${at} 的 emoji 不在表情包里：${entry.emoji}`)
    if (Object.keys(entry.clips).length === 0) out.push(`${at} 至少要有一个片段`)
    for (const [clipId, clip] of Object.entries(entry.clips)) {
      const cat = `${at}.clips.${clipId}`
      if (clip.frames !== undefined && (!Number.isInteger(clip.frames) || clip.frames < 2)) out.push(`${cat}.frames 须为 ≥ 2 的整数`)
      if (clip.parts.length === 0 && (clip.fx?.length ?? 0) === 0) out.push(`${cat} 的 parts 与 fx 至少要有一项`)
      const seen = new Set<number>()
      clip.parts.forEach((part, pi) => {
        const pat = `${cat}.parts[${pi}]`
        if (part.indices.length === 0) out.push(`${pat}.indices 为空`)
        for (const i of part.indices) {
          if (!Number.isInteger(i) || i < 0) out.push(`${pat} 的下标非法：${i}`)
          else if (count !== undefined && i >= count) out.push(`${pat} 的下标 ${i} 超出这张 emoji 的 ${count} 个顶层元素`)
          if (seen.has(i)) out.push(`${pat} 的下标 ${i} 被多个部件占用`)
          seen.add(i)
        }
        if (part.keyframes.length < 2) {
          out.push(`${pat} 的关键帧不足 2 个`)
          return
        }
        let prev = -Infinity
        for (const kf of part.keyframes) {
          if (kf.t < 0 || kf.t > 1) out.push(`${pat} 的关键帧 t=${kf.t} 超出 [0, 1]`)
          if (kf.t < prev) out.push(`${pat} 的关键帧 t 未按升序排列`)
          prev = kf.t
        }
        if (!samePose(part.keyframes[0]!, part.keyframes[part.keyframes.length - 1]!)) out.push(`${pat} 的首尾姿态不闭环，循环播放会跳变`)
      })
    }
  }
  return out
}
