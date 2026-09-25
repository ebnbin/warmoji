export interface WikiEntry {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly lines: readonly string[]
  readonly levels?: readonly { readonly label: string; readonly lines: readonly string[] }[]
}
export interface WikiGroup {
  readonly icon: string
  readonly title: string
  readonly entries: readonly WikiEntry[]
}
