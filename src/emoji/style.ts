import { PAINTED } from './painted/index.ts'

let painted = true

/** 设置里的新画风开关：开着时画了的 emoji 用新画风，其余仍是 Twemoji */
export function setPaintedEmoji(on: boolean): void {
  painted = on
}

export function paintedEmojiOn(): boolean {
  return painted
}

/** 这个码位此刻用不用新画风 */
export function isPainted(id: string): boolean {
  return painted && id in PAINTED
}
