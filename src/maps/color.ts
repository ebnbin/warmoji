export function mix(from: number, to: number, t: number): number {
  const ch = (at: number): number => {
    const a = (from >> at) & 0xff
    return Math.round(a + (((to >> at) & 0xff) - a) * t)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
