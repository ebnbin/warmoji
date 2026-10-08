import { devChoice } from '../devtools'
import type { DevChoice, DevItem, DevTab } from '../devtools'
import { hostNumChoices } from '../ecs/systems/shared/devNumbers'

interface Tuned {
  readonly choice: DevChoice<string>
  readonly fallback: string
}

export function tuningTab(): DevTab {
  const tuned: Tuned[] = []
  // 模拟层的玩法数值交给开发面板读写并存下；回放时模拟层按录下的值钉住
  hostNumChoices((k) => {
    const choice = devChoice({
      id: k.id,
      label: `${k.group} · ${k.label}`,
      desc: `${k.desc ? `${k.desc} · ` : ''}默认 ${k.fmt(k.fallback)}`,
      options: k.values.map((v) => ({ id: String(v), label: k.fmt(v) })),
      default: String(k.fallback),
    })
    tuned.push({ choice, fallback: String(k.fallback) })
    return () => Number(choice())
  })
  const changed = (): number => tuned.filter((t) => t.choice() !== t.fallback).length
  return {
    id: 'tuning',
    title: '调参',
    badge: () => (changed() > 0 ? String(changed()) : ''),
    items: (): DevItem[] => [
      {
        kind: 'action',
        label: '全部恢复默认',
        desc: changed() > 0 ? `改过 ${changed()} 项：改过的值会存下来，影响之后的每一局` : '都是默认值',
        run: () => tuned.forEach((t) => t.choice.item.set(t.fallback)),
      },
      ...tuned.map((t) => t.choice.item),
    ],
  }
}
