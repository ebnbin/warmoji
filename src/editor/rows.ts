import type { Path } from '../data/runCheck'
import type { OutlineKind } from '../emoji/outline'
import type { Banner } from '../types/runs'
import type { Mutable } from './draft'
import type { Node } from './outline'

/** 弹出选择里的一项 */
export interface Option {
  readonly emoji: string
  readonly outline?: OutlineKind
  readonly label: string
  /** 眼下选的就是它 */
  readonly chosen?: boolean
  readonly run: () => void
  /** 选了它之后改选导航里的这一项 */
  readonly select?: Path
}

/** 一个操作：直接做，或者先弹出选择再做选的那一项 */
export type Action = {
  readonly label: string
  readonly enabled?: boolean
  /** add 是加东西，remove 是删东西 */
  readonly role?: 'add' | 'remove'
} & (
  | { readonly kind: 'do'; readonly run: () => void; readonly select?: Path; readonly confirm?: string }
  | { readonly kind: 'menu'; readonly title: string; readonly options: readonly Option[] }
)

/** 行末的小图标按钮 */
export interface Tool {
  readonly icon: string
  readonly run: () => void
}

interface FieldBase {
  readonly label: string
  readonly hint?: string
  readonly icon?: string
  readonly outline?: OutlineKind
  /** 由上一行打开的从属参数 */
  readonly sub?: boolean
  readonly tools?: readonly Tool[]
}

/** 数值的取值范围、步长与写法；whole 为真时只收整数 */
export interface Range {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly format: (v: number) => string
  readonly whole?: boolean
}

/** 一个参数：数值、开关、几选一、弹出选择、一段文字，或者只是看看 */
export type Field = FieldBase &
  (
    | ({ readonly kind: 'number'; readonly value: number; readonly set: (v: number) => void } & Range)
    | { readonly kind: 'flag'; readonly value: boolean; readonly set: (on: boolean) => void }
    | { readonly kind: 'choice'; readonly options: readonly { readonly label: string; readonly chosen: boolean; readonly run: () => void }[] }
    | { readonly kind: 'pick'; readonly value: string; readonly title: string; readonly options: readonly Option[] }
    | {
        readonly kind: 'text'
        readonly value: string
        /** 输入框有几行高 */
        readonly lines: number
        /** 写的能不能用：不能用就返回为什么 */
        readonly check: (text: string) => string | undefined
        readonly set: (text: string) => void
        /** 名字后面显示什么，不写就是文字本身 */
        readonly shown?: string
      }
    | { readonly kind: 'info'; readonly value?: string }
  )

/** 右边一行：分节标题、一个参数或一排操作 */
export type Row =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'field'; readonly field: Field }
  | { readonly kind: 'actions'; readonly actions: readonly Action[] }

/** 一种关卡数据摊开的编辑行：每个字段一项，在别处改的写空表，漏了字段就编译不过；先后就是导出时字段的先后 */
export type Each<T> = { readonly [K in keyof Required<T>]: readonly Row[] }

export function rowsOf<T>(each: Each<T>): Row[] {
  return (Object.values(each) as (readonly Row[])[]).flat()
}

export type More = Omit<FieldBase, 'label'>

/** 去掉浮点运算留下的尾巴，如 0.30000000000000004 */
export const tidy = (v: number): number => Number(v.toPrecision(12))

export const heading = (text: string): Row => ({ kind: 'heading', text })
export const actions = (list: readonly Action[]): Row => ({ kind: 'actions', actions: list })
export const field = (f: Field): Row => ({ kind: 'field', field: f })
export const num = (label: string, value: number, range: Range, set: (v: number) => void, more: More = {}): Row => field({ kind: 'number', label, value, ...range, set: (v) => set(tidy(v)), ...more })
export const flag = (label: string, value: boolean, set: (on: boolean) => void, more: More = {}): Row => field({ kind: 'flag', label, value, set, ...more })
export const info = (label: string, value?: string, more: More = {}): Row => field({ kind: 'info', label, value, ...more })
export const pick = (label: string, value: string, title: string, options: readonly Option[], more: More = {}): Row => field({ kind: 'pick', label, value, title, options, ...more })

/** 不许空着的文字 */
export const filled = (t: string): string | undefined => (t === '' ? '不能空着' : undefined)

/** 一段文字：lines 大于 1 的长文字整段写在名字下面 */
export function text(label: string, value: string, set: (t: string) => void, opts: More & { readonly lines?: number; readonly check?: (t: string) => string | undefined; readonly shown?: string } = {}): Row {
  const { lines = 1, check = filled, ...more } = opts
  return field({ kind: 'text', label, value, lines, check, set, ...more })
}

export const sec = (v: number): string => `${v} 秒`
export const moment = (v: number): string => `第 ${v} 秒`
export const pct = (v: number): string => `${Math.round(v * 100)}%`
export const times = (v: number): string => `× ${v}`
export const unit =
  (u: string) =>
  (v: number): string =>
    `${v} ${u}`

/** 以秒显示、按毫秒存的时长 */
export function msNum(label: string, ms: number, range: Range, set: (ms: number) => void, more: More = {}): Row {
  return num(label, ms / 1000, range, (v) => set(Math.round(v * 1000)), more)
}

/** 写上一项，给 undefined 就去掉它 */
export function put<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete obj[key]
  else obj[key] = value
}

export function move<T>(list: T[], from: number, to: number): void {
  list.splice(to, 0, ...list.splice(from, 1))
}

/** 可有可无的一项：开关打开时写上 make 给的初值，后面跟着它的从属参数 */
export function optional<T>(label: string, value: T | undefined, make: () => T, set: (v: T | undefined) => void, subRows: (v: T) => readonly Row[], more: More = {}): Row[] {
  return [flag(label, value !== undefined, (on) => set(on ? make() : undefined), more), ...(value !== undefined ? subRows(value) : [])]
}

/** 横幅：标题与一句提示 */
export function bannerRows(label: string, banner: Mutable<Banner> | undefined, set: (b: Mutable<Banner> | undefined) => void, hint: string): Row[] {
  return optional(label, banner, () => ({ title: '横幅标题', sub: '一句提示' }), set, (b) => [
    text('标题', b.title, (t) => (b.title = t), { sub: true }),
    text('提示', b.sub, (t) => (b.sub = t), { sub: true, lines: 2 }),
  ], { hint })
}

/** 列表里的一项：上移、下移、删除；选中跟着它走，删掉后选中上一层，删空了 emptied 收拾 */
export function listActions(list: unknown[], i: number, node: Node, noun: string, emptied?: () => void): Row {
  const to = (j: number): Path => [...node.at.slice(0, -1), j]
  const remove = (): void => {
    list.splice(i, 1)
    if (list.length === 0) emptied?.()
  }
  return actions([
    { kind: 'do', label: '上移', enabled: i > 0, run: () => move(list, i, i - 1), select: to(i - 1) },
    { kind: 'do', label: '下移', enabled: i < list.length - 1, run: () => move(list, i, i + 1), select: to(i + 1) },
    { kind: 'do', label: `删除${noun}`, role: 'remove', confirm: `删除「${node.title}」？`, run: remove, select: node.parent },
  ])
}
