import { ABILITIES } from '../defs/abilities.ts'
import { BUDGET, COMBAT_KINDS } from '../defs/budget.ts'
import { abilityDps } from './dps.ts'

// 数值总表（只读工具，不进运行时）：把创作层的战斗数值按投送类型摊平成一张
// 可比表——生效 DPS、击退、射程、设计带宽、越界标记、分档走势——供数值调平衡时
// 一眼看清隐性预算。距离单位为「格」（运行时 toPx 才 ×UNIT）。运行：npm run balance

type Ability = Record<string, unknown>

function num(v: Ability, k: string): number {
  const x = v[k]
  return typeof x === 'number' ? x : 0
}

/** 射程类字段（各投送取其一） */
function range(v: Ability): string {
  for (const k of ['range', 'reach', 'radius', 'detectRange', 'blastRadius']) {
    if (typeof v[k] === 'number') return String(v[k])
  }
  return '—'
}

const BANDS = BUDGET as Record<string, { role: string; dps: readonly [number, number] }>
function outOfBand(v: Ability): boolean {
  const b = BANDS[String(v.kind)]
  if (!b) return false
  const d = abilityDps(v)
  return d < b.dps[0] || d > b.dps[1]
}

const isBase = (name: string): boolean => !/\d$/.test(name)
const all = ABILITIES as unknown as Record<string, Ability>

// 基础档横表：类型内可比，附设计带宽与越界标记
const head = ['ability', 'kind', 'dmg', 'cd(s)', 'kb', 'range', 'DPS*', 'band', '']
const w = [16, 12, 5, 7, 5, 7, 7, 10, 3]
const pad = (s: string, i: number): string => (i <= 1 ? s.padEnd(w[i]!) : s.padStart(w[i]!))
console.log(head.map(pad).join(''))
for (const kind of COMBAT_KINDS) {
  const b = BANDS[kind]!
  for (const [n, v] of Object.entries(all)) {
    if (v.kind !== kind || !isBase(n)) continue
    const row = [n, kind, String(num(v, 'damage')), num(v, 'cooldownMs') / 1000 + '', String(num(v, 'knockback')), range(v), abilityDps(v).toFixed(1), `[${b.dps[0]},${b.dps[1]}]`, outOfBand(v) ? '⚠' : '']
    console.log(row.map(pad).join(''))
  }
}
console.log('\nDPS* = 暴击/道具/aim 前的粗算生效值；summon/turret 按并发、boomerang 按去回2次、chainArc 按满命中折算')

// 分档 DPS 走势：升级是质变（效果/机制）还是数值成长，一眼可辨；越界档位标 ⚠
console.log('\n== 分档 DPS 走势（base → 一阶 → 二阶）==')
const fams = new Map<string, [string, Ability][]>()
for (const [n, v] of Object.entries(all)) {
  if (!(COMBAT_KINDS as readonly string[]).includes(String(v.kind))) continue
  const base = n.replace(/\d+$/, '')
  if (!fams.has(base)) fams.set(base, [])
  fams.get(base)!.push([n, v])
}
let flagged = 0
for (const [base, vs] of fams) {
  vs.sort((a, b) => a[0].localeCompare(b[0]))
  const seq = vs
    .map(([, v]) => {
      const oob = outOfBand(v)
      if (oob) flagged++
      return abilityDps(v).toFixed(0) + (oob ? '⚠' : '')
    })
    .join(' → ')
  console.log(base.padEnd(16) + String(vs[0]![1].kind).padEnd(12) + seq)
}

// 每类设计定位速览
console.log('\n== 设计定位 ==')
for (const kind of COMBAT_KINDS) {
  const b = BANDS[kind]!
  console.log(`${kind.padEnd(12)}[${String(b.dps[0]).padStart(2)},${String(b.dps[1]).padStart(2)}]  ${b.role}`)
}

console.log(`\n${flagged === 0 ? '✓ 全部战斗能力（含各档）落在设计带宽内' : `⚠ ${flagged} 个档位越界`}`)
