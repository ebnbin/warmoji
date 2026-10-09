import { ENEMIES } from '../data/enemies'
import { MAPS } from '../data/maps'
import type { Path } from '../data/runCheck'
import { signalName } from '../data/signals'
import type { OutlineKind } from '../emoji/outline'
import { endText, stepText } from '../scene/runLines'
import type { EnemyKind } from '../types/enemies'
import type { Cue, Draft, End, Fight, Phase, Spawn, Step, WaveSquad } from './draft'
import { END_KINDS, ICON, SPAWN_KINDS } from './kinds'

/** 导航里的一项指着草稿的哪一块；列表里的一项带着它所在的列表与下标 */
export type Target =
  | { readonly kind: 'run' }
  | { readonly kind: 'team' }
  | { readonly kind: 'rules' }
  | { readonly kind: 'teamLevel' }
  | { readonly kind: 'curve' }
  | { readonly kind: 'stars' }
  | { readonly kind: 'step'; readonly list: Step[]; readonly index: number; readonly step: Step }
  | { readonly kind: 'fightRules'; readonly fight: Fight }
  | { readonly kind: 'phase'; readonly list: Phase[]; readonly index: number; readonly phase: Phase; readonly fight: Fight }
  | { readonly kind: 'spawn'; readonly list: Spawn[]; readonly index: number; readonly spawn: Spawn; readonly phase: Phase; readonly fight: Fight }
  | { readonly kind: 'squad'; readonly list: WaveSquad[]; readonly index: number; readonly squad: WaveSquad; readonly phase: Phase; readonly fight: Fight }
  | { readonly kind: 'cue'; readonly list: Cue[]; readonly index: number; readonly cue: Cue; readonly phase: Phase; readonly fight: Fight }
  | { readonly kind: 'end'; readonly list: End[]; readonly index: number; readonly end: End; readonly fight: Fight }

/** 导航里的一项 */
export interface Node {
  /** 在草稿里的位置，也拿来认选中的是哪一项 */
  readonly at: Path
  /** 上一层那一项的位置 */
  readonly parent: Path
  readonly depth: number
  readonly icon: string
  readonly outline?: OutlineKind
  readonly title: string
  readonly meta?: string
  readonly target: Target
}

const sec = (ms: number): string => `${+(ms / 1000).toFixed(1)} 秒`

/** 一批敌人从哪抽：指定了就是那一种，否则按配比 */
const who = (g: { readonly enemy?: EnemyKind; readonly mix?: readonly unknown[] }): string => (g.enemy ? ENEMIES[g.enemy].name : g.mix ? '自带配比' : '按配比')

function spawnText(s: Spawn): { readonly title: string; readonly meta: string } {
  switch (s.kind) {
    case 'stream':
      return { title: `连续刷怪 · ${who(s)}`, meta: s.intervalMs === undefined ? '按难度曲线' : `每 ${sec(s.intervalMs)}` }
    case 'batch':
      return { title: `一队 ${s.squad.count} 只 · ${who(s.squad)}`, meta: s.on ? `每逢${signalName('events', s.on)}` : `第 ${sec(s.atMs)}` }
    case 'waves':
      return { title: `成组 ${s.squads.length} 组`, meta: `第 ${sec(s.atMs)}起` }
  }
}

/** 一场与它的规则、阶段、刷怪、成组的每一组、地图指令、结束规则 */
function fightNodes(f: Fight, at: Path): Node[] {
  const rules: Node = { at: [...at, 'fight', 'rules'], parent: at, depth: 2, icon: ICON.rules, title: '这一场的我方规则', meta: f.rules ? '另定' : '照这一局', target: { kind: 'fightRules', fight: f } }
  const phases = f.phases.flatMap((phase, p) => {
    const pat = [...at, 'fight', 'phases', p]
    const head: Node = { at: pat, parent: at, depth: 2, icon: ICON.phase, title: `第 ${p + 1} 阶段`, meta: phase.ends.map(endText).join('，'), target: { kind: 'phase', list: f.phases, index: p, phase, fight: f } }
    const spawns = phase.spawns.flatMap((spawn, i): Node[] => {
      const sat = [...pat, 'spawns', i]
      const self: Node = { at: sat, parent: pat, depth: 3, icon: SPAWN_KINDS[spawn.kind].icon, ...spawnText(spawn), target: { kind: 'spawn', list: phase.spawns, index: i, spawn, phase, fight: f } }
      if (spawn.kind !== 'waves') return [self]
      return [
        self,
        ...spawn.squads.map((squad, k): Node => ({ at: [...sat, 'squads', k], parent: sat, depth: 4, icon: ICON.squad, title: `第 ${k + 1} 组 · ${squad.count} 只`, meta: who(squad), target: { kind: 'squad', list: spawn.squads, index: k, squad, phase, fight: f } })),
      ]
    })
    const cues = (phase.cues ?? []).map((cue, i, list): Node => ({ at: [...pat, 'cues', i], parent: pat, depth: 3, icon: ICON.cue, title: signalName('cues', cue.cue), meta: `第 ${sec(cue.atMs)}`, target: { kind: 'cue', list, index: i, cue, phase, fight: f } }))
    const ends = phase.ends.map((end, i): Node => ({ at: [...pat, 'ends', i], parent: pat, depth: 3, icon: END_KINDS[end.kind].icon, title: endText(end), target: { kind: 'end', list: phase.ends, index: i, end, fight: f } }))
    return [head, ...spawns, ...cues, ...ends]
  })
  return [rules, ...phases]
}

/** 导航：这一局，队伍、规则、全队升级、难度曲线、星级，然后按顺序的每一步，战斗往下展开 */
export function outline(d: Draft): Node[] {
  const team = d.team === 'knobs' ? undefined : d.team
  const out: Node[] = [
    { at: [], parent: [], depth: 0, icon: d.emoji, title: d.name, meta: `${d.steps.length} 步`, target: { kind: 'run' } },
    { at: ['team'], parent: [], depth: 1, icon: ICON.team, title: '队伍', meta: team ? `${team.slots.length} 人` : '靠招募', target: { kind: 'team' } },
    { at: ['rules'], parent: [], depth: 1, icon: ICON.rules, title: '我方规则', target: { kind: 'rules' } },
    { at: ['teamLevel'], parent: [], depth: 1, icon: ICON.teamLevel, title: '全队升级', meta: d.teamLevel ? '开' : '关', target: { kind: 'teamLevel' } },
    { at: ['curve'], parent: [], depth: 1, icon: ICON.curve, title: '难度曲线', meta: d.curve ? '自定义' : '默认', target: { kind: 'curve' } },
    { at: ['stars'], parent: [], depth: 1, icon: ICON.stars, title: '星级', meta: d.stars ? '两条' : '不评', target: { kind: 'stars' } },
  ]
  d.steps.forEach((step, index) => {
    const at = ['steps', index]
    const base = { at, parent: [], depth: 1, target: { kind: 'step', list: d.steps, index, step } } as const
    switch (step.kind) {
      case 'recruit':
        out.push({ ...base, icon: ICON.recruit, title: stepText(step) })
        break
      case 'shop':
        out.push({ ...base, icon: ICON.shop, title: '商店', meta: `物价第 ${step.tier} 档` })
        break
      case 'fight':
        out.push({ ...base, icon: MAPS[step.fight.map].emoji, title: step.fight.name, meta: MAPS[step.fight.map].name }, ...fightNodes(step.fight, at))
    }
  })
  return out
}

export function samePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** 位置落在导航的哪一项：前缀对得上的项里最深的那一项，没有更深的就是这一局本身 */
export function ownerOf(nodes: readonly Node[], at: Path): Node {
  return nodes.reduce((best, n) => (n.at.length > best.at.length && n.at.every((x, i) => x === at[i]) ? n : best), nodes[0]!)
}
