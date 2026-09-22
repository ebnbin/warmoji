export interface WikiEntry {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 按 ◆ 组标题分段 */
  readonly lines: readonly string[]
  /** 角色专用：各级 lines 完全独立 */
  readonly levels?: readonly { readonly label: string; readonly lines: readonly string[] }[]
}
export interface WikiGroup {
  readonly icon: string
  readonly title: string
  readonly entries: readonly WikiEntry[]
}
