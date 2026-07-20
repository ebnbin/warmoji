import { ABILITIES } from '../defs/abilities.ts'

// 数值总表（只读工具，不进运行时）：把创作层的战斗数值按投送类型摊平成一张
// 可比表——生效 DPS、击退、射程、分档走势，供数值调平衡时一眼看清隐性预算。
// 距离单位为「格」（与创作层一致，运行时 toPx 才 ×UNIT）；DPS 为暴击/道具/aim 前的粗算。
// 运行：npm run balance

type Ability = Record<string, unknown>

const COMBAT = ['projectile', 'thrust', 'sweep', 'areaBlast', 'boomerang', 'laser', 'chainArc', 'assassinate', 'summon', 'turret']

function num(v: Ability, k: string): number {
  const x = v[k]
  return typeof x === 'number' ? x : 0
}

/** 生效 DPS 粗算：各投送口径不同（并发/去回/满命中按各自机器折算，非单目标可比） */
function dps(v: Ability): number {
  const dmg = num(v, 'damage')
  const cd = num(v, 'cooldownMs') / 1000
  switch (v.kind) {
    case 'summon':
      return (num(v, 'count') * dmg) / (num(v, 'hitCooldownMs') / 1000)
    case 'turret':
      return (num(v, 'maxTurrets') * dmg) / (num(v, 'fireIntervalMs') / 1000)
    case 'chainArc': {
      // 满命中：主 + bounces 跳，逐跳 ×decay
      let tot = 0
      for (let i = 0; i <= num(v, 'bounces'); i++) tot += dmg * num(v, 'decay') ** i
      return tot / cd
    }
    case 'boomerang': {
      // 去回各判一次；冷却在接住后才起，周期 ≈ cd + 飞行去 + 回收
      const cyc = cd + num(v, 'outMs') / 1000 + num(v, 'range') / num(v, 'returnSpeed')
      return (2 * dmg) / cyc
    }
    default:
      return cd > 0 ? dmg / cd : 0
  }
}

/** 射程类字段（各投送取其一） */
function range(v: Ability): string {
  for (const k of ['range', 'reach', 'radius', 'detectRange', 'blastRadius']) {
    if (typeof v[k] === 'number') return String(v[k])
  }
  return '—'
}

const isBase = (name: string): boolean => !/\d$/.test(name)
const all = ABILITIES as unknown as Record<string, Ability>

// 基础档横表：类型内可比
const head = ['ability', 'kind', 'dmg', 'cd(s)', 'kb', 'range', 'DPS*']
const w = [16, 12, 5, 7, 5, 7, 8]
const pad = (s: string, i: number): string => (i <= 1 ? s.padEnd(w[i]!) : s.padStart(w[i]!))
console.log(head.map(pad).join(''))
for (const kind of COMBAT) {
  for (const [n, v] of Object.entries(all)) {
    if (v.kind !== kind || !isBase(n)) continue
    const row = [n, kind, String(num(v, 'damage')), num(v, 'cooldownMs') / 1000 + '', String(num(v, 'knockback')), range(v), dps(v).toFixed(1)]
    console.log(row.map(pad).join(''))
  }
}
console.log('\nDPS* = 暴击/道具/aim 前的粗算生效值；summon/turret 按并发、boomerang 按去回2次、chainArc 按满命中折算')

// 分档 DPS 走势：升级是质变（效果/机制）还是数值成长，一眼可辨
console.log('\n== 分档 DPS 走势（base → 一阶 → 二阶）==')
const fams = new Map<string, [string, Ability][]>()
for (const [n, v] of Object.entries(all)) {
  if (!COMBAT.includes(String(v.kind))) continue
  const base = n.replace(/\d+$/, '')
  if (!fams.has(base)) fams.set(base, [])
  fams.get(base)!.push([n, v])
}
for (const [base, vs] of fams) {
  vs.sort((a, b) => a[0].localeCompare(b[0]))
  const seq = vs.map(([, v]) => dps(v).toFixed(0)).join(' → ')
  console.log(base.padEnd(16) + String(vs[0]![1].kind).padEnd(12) + seq)
}
