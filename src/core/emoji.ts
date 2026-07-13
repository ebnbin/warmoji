/** twemoji 文件名规则：码点小写十六进制以 - 连接；不含 ZWJ 的序列去掉 FE0F */
export function emojiCodepoints(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)!)
  const hasZwj = points.includes(0x200d)
  return points
    .filter((p) => hasZwj || p !== 0xfe0f)
    .map((p) => p.toString(16))
    .join('-')
}
