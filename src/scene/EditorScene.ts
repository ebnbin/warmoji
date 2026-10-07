import Phaser from 'phaser'
import { CHARACTERS, ROSTER_IDS } from '../data/characters'
import { ENEMIES } from '../data/enemies'
import { BOX_MAPS } from '../data/boxMaps'
import { EXPERIMENT_IDS } from '../data/experiments'
import { MAPS } from '../data/maps'
import { pathText } from '../data/runCheck'
import type { Issue, Path } from '../data/runCheck'
import { RUNS } from '../data/runs'
import { currentDraft, defaultEmoji, draftIssues, draftSnapshot, loadDraft, resetDraft } from '../editor/draft'
import { inspect } from '../editor/fields'
import type { Action, Field, Option, Row as FormRow } from '../editor/fields'
import { END_KINDS, ICON, SPAWN_KINDS } from '../editor/kinds'
import { outline, ownerOf, samePath } from '../editor/outline'
import type { Node } from '../editor/outline'
import { preloadEmojis } from '../emoji/hold'
import type { EmojiRef } from '../emoji/hold'
import { beginCustomRun, skipFilled } from '../run/state'
import type { ExperimentId } from '../types/runs'
import {
  beginPage,
  Button,
  confirmDialog,
  Dialog,
  DIALOG_HEAD,
  FieldRow,
  hasModal,
  IconButton,
  Label,
  Notice,
  openPicker,
  PageHeader,
  pageFrame,
  Panel,
  RichLabel,
  ScrollView,
  Segmented,
  Slider,
  Stepper,
  Switch,
  TreeRow,
  Widget,
} from '../ui'
import type { PageFrame, Rect } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'
import { goStep } from './teamPage'

const WARN = '26a0'
const OK = '2705'
const PLAY = '25b6'

const PAD = 12
const GAP = 10
const NAV_ROW = 52
const NAV_GAP = 8
/** 一排操作按钮的行高：按钮面加投影 */
const ACTION_H = 56
const TOOL = 44
/** 取值不超过这么多档的用加减步进，更多的用滑杆 */
const STEPPER_MAX = 12
/** 问题列表下面的说明与按钮占的高度 */
const ISSUES_FOOT = 136

/** 参数行右边的一个控件与它占的宽度 */
interface Part {
  readonly obj: Widget
  readonly width: number
}

/** 版式：横屏左边导航、右边参数，竖屏上下排 */
function split(f: PageFrame): { readonly nav: Rect; readonly form: Rect } {
  const b = f.body
  if (f.portrait) {
    const h = Math.round(b.h * 0.4)
    return { nav: { ...b, h }, form: { x: b.x, y: b.y + h + 16, w: b.w, h: b.h - h - 16 } }
  }
  const w = 440
  return { nav: { ...b, w }, form: { x: b.x + w + 20, y: b.y, w: b.w - w - 20, h: b.h } }
}

const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 })

const headerTitle = (): string => `{${currentDraft().emoji}} 关卡编辑器`

/** 页面上会出现的图标：导航与操作的、能换上的每一局，外加所有敌人、新地图与角色 */
function editorEmojis(): EmojiRef[] {
  return [
    ...[WARN, OK, PLAY, currentDraft().emoji, defaultEmoji(), ...EXPERIMENT_IDS.map((id) => RUNS[id].emoji), ...Object.values(ICON), ...Object.values(SPAWN_KINDS).map((k) => k.icon), ...Object.values(END_KINDS).map((k) => k.icon)].map((id) => ({ id })),
    ...Object.values(ENEMIES).map((e) => ({ id: e.emoji, outline: 'enemy' as const })),
    ...BOX_MAPS.map((id) => ({ id: MAPS[id].emoji })),
    ...ROSTER_IDS.map((id) => ({ id: CHARACTERS[id].emoji, outline: 'player' as const })),
  ]
}

/** 参数区的样子：控件自己显示的数值与开关不算，其余不变就不用重画 */
function lookOf(node: Node, issues: readonly Issue[], rows: readonly FormRow[]): string {
  const plain = rows.map((r) => {
    if (r.kind !== 'field') return r
    const f = r.field
    if (f.kind === 'number' || f.kind === 'flag') return { ...f, value: undefined }
    if (f.kind === 'choice') return { ...f, options: f.options.map((o) => o.label) }
    return f
  })
  return JSON.stringify({ at: node.at, title: node.title, issues: issues.map((i) => i.why), rows: plain })
}

/** 关卡编辑器：导航里选一项，参数区里改它，随改随查，没有问题就按草稿开一局 */
export class EditorScene extends Phaser.Scene {
  private selected: Path = []
  private navScroll = 0
  private formScroll = 0
  private frame!: PageFrame
  private header!: PageHeader
  private nav!: ScrollView
  private form!: ScrollView
  private status!: Button
  /** 参数区眼下画的是什么样子 */
  private look = ''

  constructor() {
    super(SceneKey.Editor)
  }

  preload(): void {
    preloadEmojis(this, editorEmojis())
  }

  create(): void {
    beginPage(this)
    this.look = ''
    const f = (this.frame = pageFrame({ footer: true }))
    this.header = new PageHeader(this, f, { title: headerTitle(), back: () => this.scene.start(SceneKey.Menu) })
    new Button(this, f.right - 66, f.headerY, { label: '换一局', size: 'sm', variant: 'secondary', width: 132, onTap: () => this.swap() })

    const { nav, form } = split(f)
    new Panel(this, nav.x, nav.y, nav.w, nav.h, { variant: 'well' })
    new Panel(this, form.x, form.y, form.w, form.h, { variant: 'well' })
    this.nav = new ScrollView(this, inset(nav, 4))
    this.form = new ScrollView(this, inset(form, 4))

    const statusW = f.portrait ? 300 : 380
    this.status = new Button(this, f.left + statusW / 2, f.footerY, { label: '', size: 'md', variant: 'secondary', width: statusW, onTap: () => this.showIssues() })
    new Button(this, f.right - 170, f.footerY, { label: `{${PLAY}} 开始`, onTap: () => this.start() })

    this.render(true)
    this.nav.scrollTo(this.navScroll)
    this.form.scrollTo(this.formScroll)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.navScroll = this.nav.scroll
      this.formScroll = this.form.scroll
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 按草稿重画导航与底部的状态；参数区样子变了才重画，keepForm 为假时从头看起 */
  private render(keepForm: boolean, reveal = false): void {
    const nodes = outline(currentDraft())
    const node = nodes.find((n) => samePath(n.at, this.selected)) ?? ownerOf(nodes, this.selected)
    this.selected = node.at
    const issues = draftIssues()
    const owners = issues.map((i) => ownerOf(nodes, i.at))
    this.drawNav(nodes, node, new Set(owners), reveal)
    const own = issues.filter((_, k) => owners[k] === node)
    const rows = inspect(currentDraft(), node)
    const look = lookOf(node, own, rows)
    if (look !== this.look || !keepForm) {
      this.look = look
      this.drawForm(node, own, rows, keepForm)
    }
    this.status.setLabel(issues.length > 0 ? `{${WARN}} ${issues.length} 个问题` : `{${OK}} 没有问题`).setVariant(issues.length > 0 ? 'danger' : 'secondary')
  }

  private drawNav(nodes: readonly Node[], chosen: Node, flagged: ReadonlySet<Node>, reveal: boolean): void {
    const view = this.nav
    const w = view.viewport.w - PAD * 2
    const keep = view.scroll
    view.clear()
    nodes.forEach((n, i) => {
      view.add(
        new TreeRow(this, PAD, PAD + i * (NAV_ROW + NAV_GAP), w, NAV_ROW, {
          depth: n.depth,
          title: n.title,
          icon: n.icon,
          outline: n.outline,
          meta: n.meta,
          selected: n === chosen,
          badge: flagged.has(n) ? WARN : undefined,
          onTap: () => this.select(n.at),
        }),
      )
    })
    view.setContentSize(PAD * 2 + nodes.length * (NAV_ROW + NAV_GAP) - NAV_GAP)
    view.scrollTo(keep)
    if (reveal) view.reveal(PAD + nodes.indexOf(chosen) * (NAV_ROW + NAV_GAP), NAV_ROW)
  }

  private drawForm(node: Node, issues: readonly Issue[], rows: readonly FormRow[], keepScroll: boolean): void {
    const view = this.form
    const w = view.viewport.w - PAD * 2
    const top = keepScroll ? view.scroll : 0
    view.clear()
    view.add(new RichLabel(this, PAD + 4, PAD + 22, [{ icon: node.icon, outline: node.outline }, ` ${node.title}`], { kind: 'heading', bold: true, originX: 0, maxWidth: w - 8 }))
    let y = PAD + 52
    for (const issue of issues) {
      const n = new Notice(this, PAD, y, w, { icon: WARN, text: issue.why })
      view.add(n)
      y += n.boxHeight + GAP
    }
    for (const row of rows) y = this.drawRow(row, y, w) + GAP
    view.setContentSize(y + PAD)
    view.scrollTo(top)
  }

  private drawRow(row: FormRow, y: number, w: number): number {
    switch (row.kind) {
      case 'heading':
        this.form.add(new Label(this, PAD + 6, y + 8, row.text, { kind: 'label', bold: true, color: 'muted' }))
        return y + 38
      case 'actions':
        return this.drawActions(row.actions, y, w)
      case 'field':
        return this.drawField(row.field, y, w)
    }
  }

  /** 一排操作按钮，放不下就换行 */
  private drawActions(list: readonly Action[], y: number, w: number): number {
    let x = PAD
    let top = y
    for (const a of list) {
      const bw = Math.min(w, Math.max(112, a.label.length * 24 + 48))
      if (x > PAD && x + bw > PAD + w) {
        x = PAD
        top += ACTION_H + GAP
      }
      const variant = a.role === 'add' ? 'good' : a.role === 'remove' ? 'danger' : 'secondary'
      this.form.add(new Button(this, x + bw / 2, top + 25, { label: a.label, size: 'sm', variant, width: bw, enabled: a.enabled ?? true, onTap: () => this.act(a) }))
      x += bw + GAP
    }
    return top + ACTION_H
  }

  private drawField(f: Field, y: number, w: number): number {
    let row: FieldRow | undefined
    const main = this.control(f, (text) => row?.setValue(text))
    const tools = (f.tools ?? []).map((t): Part => ({ obj: new IconButton(this, 0, 0, { icon: t.icon, size: TOOL, variant: 'dark', onTap: () => this.edit(t.run) }), width: TOOL }))
    const box = this.pack([...(main ? [main] : []), ...tools])
    row = new FieldRow(this, PAD, y, w, {
      label: f.label,
      value: this.shownValue(f),
      hint: f.hint,
      icon: f.icon,
      outline: f.outline,
      control: box?.obj,
      controlWidth: box?.width,
      indent: f.sub ? 32 : 0,
    })
    this.form.add(row)
    return y + row.rowHeight
  }

  /** 名字后面的当前值：控件自己显示数值的就不再写 */
  private shownValue(f: Field): string | undefined {
    if (f.kind === 'number') return this.stepper(f) ? undefined : f.format(f.value)
    if (f.kind === 'pick' || f.kind === 'info') return f.value
    return undefined
  }

  private stepper(f: Extract<Field, { kind: 'number' }>): boolean {
    return (f.max - f.min) / f.step <= STEPPER_MAX
  }

  /** 参数行右边的控件；拖动滑杆时 show 改写名字后面的当前值 */
  private control(f: Field, show: (text: string) => void): Part | undefined {
    const wide = this.frame.portrait ? 250 : 300
    switch (f.kind) {
      case 'number':
        if (this.stepper(f)) {
          return { obj: new Stepper(this, 0, 0, { value: f.value, min: f.min, max: f.max, step: f.step, format: f.format, width: 200, onChange: (v) => this.edit(() => f.set(v)) }), width: 200 }
        }
        return {
          obj: new Slider(this, 0, 0, { width: wide, min: f.min, max: f.max, step: f.step, value: f.value, onInput: (v) => show(f.format(v)), onChange: (v) => this.edit(() => f.set(v)) }),
          width: wide,
        }
      case 'flag':
        return { obj: new Switch(this, 0, 0, { value: f.value, onChange: (on) => this.edit(() => f.set(on)) }), width: 84 }
      case 'choice': {
        const width = Math.min(wide + 40, f.options.length * 88)
        const items = f.options.map((o, i) => ({ key: i, label: o.label }))
        const selected = f.options.findIndex((o) => o.chosen)
        return { obj: new Segmented(this, 0, 0, { width, items, selected, onSelect: (i) => this.edit(() => f.options[i]?.run()) }), width }
      }
      case 'pick':
        return { obj: new Button(this, 0, 0, { label: '更换', size: 'sm', variant: 'secondary', width: 112, onTap: () => this.pick(f.title, f.options) }), width: 112 }
      case 'info':
        return undefined
    }
  }

  /** 几个控件从左到右排成一个，按整体的中心摆放 */
  private pack(parts: readonly Part[]): Part | undefined {
    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0]
    const width = parts.reduce((sum, p) => sum + p.width, 0) + GAP * (parts.length - 1)
    const box = new Widget(this)
    let x = -width / 2
    for (const p of parts) {
      box.add(p.obj.setPosition(x + p.width / 2, 0))
      x += p.width + GAP
    }
    return { obj: box, width }
  }

  private select(at: Path): void {
    this.selected = at
    this.render(false)
  }

  /** 改一处草稿再重画；改选了另一类的项就从头看起它的参数 */
  private edit(change: () => void, select?: Path): void {
    if (select === undefined) {
      change()
      this.render(true)
      return
    }
    const kind = (): string => ownerOf(outline(currentDraft()), this.selected).target.kind
    const before = kind()
    change()
    this.selected = select
    this.render(kind() === before, true)
  }

  private act(a: Action): void {
    if (a.kind === 'menu') {
      this.pick(a.title, a.options)
      return
    }
    if (a.confirm) confirmDialog(this, { title: a.confirm, confirmLabel: a.label, danger: true, onConfirm: () => this.edit(a.run, a.select) })
    else this.edit(a.run, a.select)
  }

  private pick(title: string, options: readonly Option[]): void {
    openPicker(this, {
      title,
      items: options.map((o, i) => ({ key: i, emoji: o.emoji, outline: o.outline, label: o.label })),
      selected: options.findIndex((o) => o.chosen),
      onPick: (i) => {
        const o = options[i]
        if (o) this.edit(o.run, o.select)
      },
    })
  }

  /** 丢掉改动，换上默认的一局或一个实验从头改起 */
  private swap(): void {
    openPicker<ExperimentId | null>(this, {
      title: '丢掉改动，从哪一局改起？',
      items: [{ key: null, emoji: defaultEmoji(), label: '默认的一局' }, ...EXPERIMENT_IDS.map((id) => ({ key: id, emoji: RUNS[id].emoji, label: RUNS[id].name }))],
      onPick: (id) => {
        if (id === null) resetDraft()
        else loadDraft(RUNS[id])
        this.selected = []
        this.header.title.setContent(headerTitle())
        this.render(false, true)
      },
    })
  }

  /** 开局前再查一遍：有问题就列出来，没有就按草稿此刻的样子开一局，打完回到这里 */
  private start(): void {
    if (draftIssues().length > 0) {
      this.showIssues()
      return
    }
    const run = beginCustomRun(draftSnapshot(), SceneKey.Editor)
    skipFilled(run)
    goStep(this, run)
  }

  /** 草稿的问题一条条列出来：在哪、为什么；点一条就去改它。对话框随条数收拢，放不下的只报个数 */
  private showIssues(): void {
    if (hasModal(this)) return
    const issues = draftIssues()
    const nodes = outline(currentDraft())
    const w = this.frame.portrait ? 660 : 900
    const room = (this.frame.portrait ? 1000 : 640) - DIALOG_HEAD - ISSUES_FOOT
    let dialog: Dialog | undefined
    const shown: Notice[] = []
    let used = 0
    for (const issue of issues) {
      const owner = ownerOf(nodes, issue.at)
      const n = new Notice(this, -w / 2 + 32, 0, w - 64, {
        icon: WARN,
        title: pathText(issue.at),
        text: issue.why,
        onTap: () => {
          dialog?.close()
          this.select(owner.at)
        },
      })
      if (used + n.boxHeight > room) {
        n.destroy()
        break
      }
      shown.push(n)
      used += n.boxHeight + GAP
    }
    const h = DIALOG_HEAD + used + ISSUES_FOOT
    const d = (dialog = new Dialog(this, { width: w, height: h, title: issues.length > 0 ? `${issues.length} 个问题` : '没有问题', titleColor: issues.length > 0 ? 'bad' : 'good' }))
    let y = d.bodyTop
    for (const n of shown) {
      d.add(n.setY(y))
      y += n.boxHeight + GAP
    }
    const note = issues.length === 0 ? '参数都查过了，可以开始' : shown.length < issues.length ? `还有 ${issues.length - shown.length} 个没列出，先改掉上面这些` : '点一条就去改它'
    d.add(new Label(this, 0, y + 6, note, { kind: 'label', color: 'muted' }).setOrigin(0.5, 0))
    d.add(new Button(this, 0, h / 2 - 56, { label: '知道了', size: 'md', variant: 'secondary', width: 216, onTap: () => d.close() }))
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }
}
