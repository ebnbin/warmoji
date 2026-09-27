import { defineDevChoice } from '../../../devtools'

type NumChoice = (id: string, label: string, desc: string, values: readonly number[], fallback: number, fmt: (v: number) => string) => () => number

/** 一组数值型的开发者选项：在候选值里挑，默认值不在候选里就补进去 */
export function numChoices(group: string): NumChoice {
  return (id, label, desc, values, fallback, fmt) => {
    const all = values.includes(fallback) ? values : [...values, fallback].sort((a, b) => a - b)
    const get = defineDevChoice({
      id,
      group,
      label,
      desc,
      options: all.map((v) => ({ id: String(v), label: fmt(v) })),
      default: String(fallback),
    })
    return () => Number(get())
  }
}
