export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** 伤害、承伤一类的大数缩写 */
export function formatBig(v: number): string {
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`
}
