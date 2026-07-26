export interface WikiEntry {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 详情面板的属性行（按 ◆ 组标题分段） */
  readonly lines: readonly string[]
  /** 分级子标签（角色专用）：各级属性/能力完全独立，详情页顶部切换 */
  readonly levels?: readonly { readonly label: string; readonly lines: readonly string[] }[]
}
export interface WikiGroup {
  readonly icon: string
  readonly title: string
  readonly entries: readonly WikiEntry[]
}
