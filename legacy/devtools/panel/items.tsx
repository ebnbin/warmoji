import { Component } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { DevButtonsItem, DevChoiceItem, DevItem, DevMultiItem, DevOption, DevTextItem, DevToggleItem } from '../types'
import { useLive } from './live'

/** 包一层点击：执行后重建条目 */
export type Tap = (fn: () => void) => () => void

/** 按下不抢焦点：点完面板，键盘照样操作游戏 */
export function keepFocus(e: MouseEvent): void {
  e.preventDefault()
}

function Caption({ text, desc }: { readonly text: string | undefined; readonly desc?: string }): ReactNode {
  if (text === undefined) return null
  return (
    <div className="dt-cap">
      {text}
      {desc !== undefined && <span className="dt-cap-desc">{desc}</span>}
    </div>
  )
}

function TextView({ item }: { readonly item: DevTextItem }): ReactNode {
  const text = useLive(item.read)
  return (
    <div>
      <Caption text={item.label} desc={item.desc} />
      {text !== '' && <div className={item.mono ? 'dt-text dt-mono' : 'dt-text'}>{text}</div>}
    </div>
  )
}

interface RowProps {
  readonly label: string
  readonly desc?: string
  readonly on?: boolean
  readonly onClick: () => void
  readonly children?: ReactNode
}

function Row({ label, desc, on, onClick, children }: RowProps): ReactNode {
  return (
    <button className={on ? 'dt-row on' : 'dt-row'} onMouseDown={keepFocus} onClick={onClick}>
      <span className="dt-row-main">
        <span className="dt-row-label">{label}</span>
        {desc !== undefined && <span className="dt-row-desc">{desc}</span>}
      </span>
      {children}
    </button>
  )
}

function ToggleView({ item, tap }: { readonly item: DevToggleItem; readonly tap: Tap }): ReactNode {
  const on = useLive(item.get)
  return (
    <Row label={item.label} desc={item.desc} onClick={tap(() => item.set(!item.get()))}>
      <span className={on ? 'dt-switch on' : 'dt-switch'} />
    </Row>
  )
}

interface ChipsProps {
  readonly label: string | undefined
  readonly desc?: string
  readonly options: readonly DevOption[]
  readonly isOn: readonly boolean[]
  readonly pick: (o: DevOption) => void
  readonly tap: Tap
}

function Chips({ label, desc, options, isOn, pick, tap }: ChipsProps): ReactNode {
  return (
    <div>
      <Caption text={label} desc={desc} />
      <div className="dt-chips">
        {options.map((o, i) => (
          <button key={o.id} className={isOn[i] ? 'dt-chip on' : 'dt-chip'} onMouseDown={keepFocus} onClick={tap(() => pick(o))}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChoiceView({ item, tap }: { readonly item: DevChoiceItem; readonly tap: Tap }): ReactNode {
  const cur = useLive(item.get)
  if (!item.options.some((o) => o.desc !== undefined)) {
    return <Chips label={item.label} desc={item.desc} options={item.options} isOn={item.options.map((o) => o.id === cur)} pick={(o) => item.set(o.id)} tap={tap} />
  }
  return (
    <div className="dt-list">
      <Caption text={item.label} desc={item.desc} />
      {item.options.map((o) => (
        <Row key={o.id} label={o.label} desc={o.desc} on={o.id === cur} onClick={tap(() => item.set(o.id))} />
      ))}
    </div>
  )
}

function MultiView({ item, tap }: { readonly item: DevMultiItem; readonly tap: Tap }): ReactNode {
  const mask = useLive(() => item.options.map((o) => (item.has(o.id) ? '1' : '0')).join(''))
  return <Chips label={item.label} desc={item.desc} options={item.options} isOn={[...mask].map((c) => c === '1')} pick={(o) => item.toggle(o.id)} tap={tap} />
}

function ButtonsView({ item, tap }: { readonly item: DevButtonsItem; readonly tap: Tap }): ReactNode {
  return (
    <div>
      <Caption text={item.label} desc={item.desc} />
      <div className="dt-chips">
        {item.buttons.map((b, i) => (
          <button key={i} className="dt-chip dt-action" onMouseDown={keepFocus} onClick={tap(b.run)}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ItemView({ item, tap }: { readonly item: DevItem; readonly tap: Tap }): ReactNode {
  switch (item.kind) {
    case 'text':
      return <TextView item={item} />
    case 'action':
      return <Row label={item.label} desc={item.desc} onClick={tap(item.run)} />
    case 'toggle':
      return <ToggleView item={item} tap={tap} />
    case 'choice':
      return <ChoiceView item={item} tap={tap} />
    case 'multi':
      return <MultiView item={item} tap={tap} />
    case 'buttons':
      return <ButtonsView item={item} tap={tap} />
    case 'custom':
      return (
        <div>
          <Caption text={item.label} desc={item.desc} />
          {item.render()}
        </div>
      )
  }
}

interface GuardState {
  readonly error: string | null
}

interface GuardProps {
  readonly children: ReactNode
  /** 变了就重试一次 */
  readonly reset?: unknown
}

/** 出错只坏这一块，面板照常 */
export class Guard extends Component<GuardProps, GuardState> {
  state: GuardState = { error: null }

  static getDerivedStateFromError(e: unknown): GuardState {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  componentDidUpdate(prev: GuardProps): void {
    if (this.state.error !== null && prev.reset !== this.props.reset) this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children
    return (
      <div className="dt-err">
        {this.state.error}
        <button className="dt-btn" onMouseDown={keepFocus} onClick={() => this.setState({ error: null })}>
          重试
        </button>
      </div>
    )
  }
}

export function Item({ item, tap }: { readonly item: DevItem; readonly tap: Tap }): ReactNode {
  return (
    <Guard>
      <ItemView item={item} tap={tap} />
    </Guard>
  )
}
