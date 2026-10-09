/** 一项可在开发面板里调的数值：候选值已含默认值；read 由开发面板接管，没接管时读默认值 */
export interface NumKnob {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly desc: string
  readonly values: readonly number[]
  readonly fallback: number
  readonly fmt: (v: number) => string
  read: () => number
}

type NumChoice = (id: string, label: string, desc: string, values: readonly number[], fallback: number, fmt: (v: number) => string) => () => number

const knobs: NumKnob[] = []
let host: ((knob: NumKnob) => () => number) | null = null
let pinned: Readonly<Record<string, number>> | null = null

/** 一组数值型的开发者选项：在候选值里挑，默认值不在候选里就补进去 */
export function numChoices(group: string): NumChoice {
  return (id, label, desc, values, fallback, fmt) => {
    const all = values.includes(fallback) ? values : [...values, fallback].sort((a, b) => a - b)
    const knob: NumKnob = { id, group, label, desc, values: all, fallback, fmt, read: () => fallback }
    if (host) knob.read = host(knob)
    knobs.push(knob)
    return () => pinned?.[id] ?? knob.read()
  }
}

/** 每项此刻的取值 */
export function numChoiceValues(): Record<string, number> {
  return Object.fromEntries(knobs.map((k) => [k.id, pinned?.[k.id] ?? k.read()]))
}

/** 回放时把各项钉在录下的取值上，null 放开 */
export function pinNumChoices(values: Readonly<Record<string, number>> | null): void {
  pinned = values
}

/** 开发面板接管全部数值选项的读取，之后登记的也一样 */
export function hostNumChoices(h: (knob: NumKnob) => () => number): void {
  host = h
  for (const knob of knobs) knob.read = h(knob)
}
