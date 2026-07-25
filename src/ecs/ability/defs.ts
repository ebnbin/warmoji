import type { AbilityDef } from '../../data/abilityDefs'

// 能力定义的只读表：组件里只存下标，定义本体（嵌套对象）按下标取。
// 同一个 def 对象只登记一次——敌人按种类共享同一份，队员各自解析出自己的一份。

const table: AbilityDef[] = []
const seen = new Map<AbilityDef, number>()

/** 登记一条定义，返回它的下标（同一对象重复登记返回同一下标） */
export function internAbilityDef(def: AbilityDef): number {
  const hit = seen.get(def)
  if (hit !== undefined) return hit
  const idx = table.length
  table.push(def)
  seen.set(def, idx)
  return idx
}

export function abilityDefAt(idx: number): AbilityDef {
  return table[idx]!
}

/** 跨局清空（eid 与下标都从头再分配） */
export function clearAbilityDefs(): void {
  table.length = 0
  seen.clear()
}
