import { hasComponent, query } from 'bitecs'
import { CHARACTERS } from '../data/characters'
import { STAT_KEYS, STATS } from '../data/stats'
import { AFFIXES } from '../data/affixes'
import { UNIT } from '../util/units'
import { Ability, Alive, Ammo, Boss, Cd, Charges, Ctl, Drive, Elite, Faction, FACTION, Form, Hp, Mark, MARK, MARK_SLOTS, Owner, Phys, Radius, Res, Seat, Stats, Transform, Uid } from './components'
import { abilityDef, bodyLook, eliteAffixes, enemyDef, resDef } from './store'
import { staminaLeft } from './systems/shared/stamina'
import { statusDef } from './utils/marks'
import type { Sim } from './sim'
import type { DriveDef } from '../types/enemies'

/** 点选时离身体边缘多远以内还算点中，像素 */
const PICK_SLACK = 0.6 * UNIT


const DRIVE_LABEL: Record<DriveDef['kind'], string> = {
  chase: '追击',
  wander: '闲逛',
  stay: '原地',
  flee: '逃离',
  coinThief: '偷金币',
  standoff: '对峙',
  orbit: '环绕',
  march: '行进',
}

const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 10 ? 2 : 1))
const cells = (px: number): string => num(px / UNIT)
const sec = (ms: number): string => `${(ms / 1000).toFixed(1)} 秒`

/** 离世界里 (x, y) 最近的身体：有属性表的才算，离它的边缘超过一点就不算点中，返回 -1 */
export function bodyAt(sim: Sim, x: number, y: number): number {
  let best = -1
  let bestD = Infinity
  for (const eid of query(sim.world, [Transform, Stats])) {
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[eid]!, Transform.y[eid]!)
    const gap = Math.hypot(d.x, d.y) - Radius.v[eid]!
    if (gap < bestD) {
      best = eid
      bestD = gap
    }
  }
  return bestD <= PICK_SLACK ? best : -1
}

function title(sim: Sim, eid: number): string {
  const slot = sim.characters.indexOf(eid)
  if (slot >= 0) {
    const def = CHARACTERS[sim.run.roster[slot]!]
    return `${def.name} · ${eid === sim.leader ? '队长' : `队员 · 坑位 ${Seat.v[eid]}`}`
  }
  const def = enemyDef[eid]
  const affixes = (eliteAffixes[eid] ?? []).map((id) => AFFIXES[id].name)
  const rank = Boss.v[eid] ? ' · 头目' : Elite.v[eid] ? ` · 精英${affixes.length > 0 ? `（${affixes.join('、')}）` : ''}` : ''
  const side = Faction.v[eid] === FACTION.team ? '我方' : Faction.v[eid] === FACTION.enemy ? '敌方' : '场地'
  return `${def?.name ?? '无名身体'} · ${side}${rank}`
}

function drive(sim: Sim, eid: number): string {
  const d = enemyDef[eid]?.drive
  const how = sim.characters.includes(eid) ? (eid === sim.leader ? '摇杆' : '跟着坑位') : d ? `${DRIVE_LABEL[d.kind]} ${JSON.stringify(d)}` : '没有驱动'
  const can = [Ctl.move[eid] ? '走' : '', Ctl.act[eid] ? '出手' : '', Ctl.cast[eid] ? '放技能' : '', Ctl.dash[eid] ? '位移' : ''].filter((s) => s !== '')
  const forced = Ctl.forced[eid] === 1 ? ' · 被迫逃离' : Ctl.forced[eid] === 2 ? ' · 被迫靠近' : ''
  return `驱动 ${how} · 能${can.length > 0 ? can.join('、') : '做的都被封住'}${forced}\n期望速度 (${cells(Drive.x[eid]!)}, ${cells(Drive.y[eid]!)}) · 速度 (${cells(Phys.vx[eid]!)}, ${cells(Phys.vy[eid]!)}) 格/秒`
}

function marks(sim: Sim, eid: number): string {
  const out: string[] = []
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const kind = Mark.kind[base + i]!
    if (kind === MARK.none) continue
    const until = Mark.until[base + i]!
    const a = Mark.a[base + i]!
    out.push(`${statusDef(kind)?.name ?? kind}${a !== 0 ? ` ${num(a)}` : ''} ${until === Infinity ? '常驻' : `剩 ${sec(until - sim.elapsedMs)}`}`)
  }
  return out.length > 0 ? out.join(' · ') : '没有'
}

function stats(eid: number): string {
  const out: string[] = []
  for (const k of STAT_KEYS) {
    const v = Stats[k][eid]!
    if (v !== STATS[k].base) out.push(`${STATS[k].name} ${num(v)}`)
  }
  return out.join(' · ')
}

function abilities(sim: Sim, eid: number): string[] {
  const out: string[] = []
  for (const a of query(sim.world, [Ability, Owner])) {
    if (Owner.eid[a] !== eid) continue
    const def = abilityDef[a]
    if (!def) continue
    const ready = Cd.left[a]! <= 0 ? '就绪' : `冷却 ${sec(Cd.left[a]!)}/${sec(Cd.base[a]!)}`
    const extra = [
      hasComponent(sim.world, a, Charges) ? `充能 ${Charges.n[a]}/${Charges.max[a]}` : '',
      hasComponent(sim.world, a, Ammo) ? `弹匣 ${Ammo.n[a]}/${Ammo.max[a]}` : '',
    ].filter((s) => s !== '')
    const damage = def.damage ? ` · 伤害 ${num(def.damage)}` : ''
    out.push(`  ${def.trigger === 'manual' ? '手动' : '自动'} ${def.shape.kind}${damage} · ${ready}${extra.length > 0 ? ` · ${extra.join(' · ')}` : ''}`)
  }
  return out.length > 0 ? out : ['  没有']
}

/** 一个身体此刻的样子：身份、位置、生命、驱动与控制、标记、与默认不同的属性、能力的冷却 */
export function describeBody(sim: Sim, eid: number): string {
  const lines = [
    `${title(sim, eid)} · eid ${eid} · uid ${Uid.v[eid]}${bodyLook[eid] ? ` · 外观 ${bodyLook[eid]}` : ''}`,
    `位置 (${cells(Transform.x[eid]!)}, ${cells(Transform.y[eid]!)}) 格 · 半径 ${cells(Radius.v[eid]!)} 格 · ${Alive.v[eid] ? '活着' : '倒下'}`,
    `生命 ${num(Hp.v[eid]!)}/${num(Hp.max[eid]!)}${sim.characters.includes(eid) ? ` · 体力 ${Math.round(staminaLeft(eid) * 100)}%` : ''}`,
    drive(sim, eid),
    `标记 ${marks(sim, eid)}`,
  ]
  if (hasComponent(sim.world, eid, Res)) lines.push(`资源 ${resDef[eid]?.kind ?? '?'} ${num(Res.v[eid]!)}/${num(Res.max[eid]!)}`)
  if (hasComponent(sim.world, eid, Form) && Form.idx[eid]! >= 0) lines.push(`形态 第 ${Form.idx[eid]! + 1} 个${Form.until[eid] ? ` · 剩 ${sec(Form.until[eid]! - sim.elapsedMs)}` : ''}`)
  lines.push(`属性 ${stats(eid)}`, '能力', ...abilities(sim, eid))
  return lines.join('\n')
}
