import { HAZARD_NAMES, MAPS } from '../data/maps'
import { signalName, signalsOf } from '../data/signals'
import type { MapSignals } from '../data/signals'
import type { Hazard, MapId } from '../types/maps'
import type { EndRule, HoldPoint } from '../types/runs'
import { keysOf } from '../util/record'
import type { End, Mutable } from './draft'
import { ALL_ENEMIES, enemyField } from './groups'
import { ICON } from './kinds'
import { actions, field, flag, heading, info, msNum, num, optional, pct, pick, put, rowsOf, sec, unit } from './rows'
import type { More, Option, Row } from './rows'

type Kind<K extends EndRule['kind']> = Extract<EndRule, { kind: K }>

const cell = unit('格')
const SIGNAL_ICON: Readonly<Record<keyof MapSignals, string>> = { events: ICON.event, gauges: '1f4ca', cues: ICON.cue, marks: ICON.mark }

/** 选这张图的一个信号或一组地标 */
export function signalPick(label: string, map: MapId, kind: keyof MapSignals, current: string, set: (name: string) => void, hint?: string): Row {
  const names = signalsOf(MAPS[map].kind, kind)
  const options = names.map((name): Option => ({ emoji: SIGNAL_ICON[kind], label: signalName(kind, name), chosen: name === current, run: () => set(name) }))
  const value = names.includes(current) ? signalName(kind, current) : `${current}（这张图没有）`
  return pick(label, value, `选${label}`, options, { icon: SIGNAL_ICON[kind], hint })
}

/** 失败的开关：开着时满足了就输 */
const loseFlag = (e: { lose?: boolean }, hint: string): Row => flag('满足了算输', e.lose === true, (on) => put(e, 'lose', on || undefined), { hint })

const count = (label: string, value: number, max: number, u: string, set: (v: number) => void, more: More = {}): Row => num(label, value, { min: 1, max, step: 1, format: unit(u), whole: true }, set, more)

/** 击杀数数什么：全部、某一种，或死于某种危害的 */
function killRows(e: Mutable<Kind<'kills'>>): Row[] {
  const mode = e.enemy ? 'enemy' : e.by ? 'hazard' : 'all'
  const hazards: Option[] = keysOf(HAZARD_NAMES).map((h: Hazard) => ({ emoji: ICON.hazard, label: HAZARD_NAMES[h], chosen: e.by === h, run: () => (e.by = h) }))
  return rowsOf<Kind<'kills'>>({
    kind: [],
    count: [count('击杀数', e.count, 1_000, '只', (v) => (e.count = v))],
    enemy: [
      field({
        kind: 'choice',
        label: '数哪些',
        options: [
          {
            label: '全部',
            chosen: mode === 'all',
            run: () => {
              delete e.enemy
              delete e.by
            },
          },
          {
            label: '某一种',
            chosen: mode === 'enemy',
            run: () => {
              e.enemy ??= ALL_ENEMIES[0]!.kind
              delete e.by
            },
          },
          {
            label: '死于危害',
            chosen: mode === 'hazard',
            run: () => {
              e.by ??= 'meteor'
              delete e.enemy
            },
          },
        ],
      }),
      ...(e.enemy ? [enemyField('哪一种', e.enemy, ALL_ENEMIES, (kind) => (e.enemy = kind), undefined, true)] : []),
    ],
    by: e.by ? [pick('哪种危害', HAZARD_NAMES[e.by], '选危害', hazards, { icon: ICON.hazard, sub: true, hint: '只数死于这种危害的' })] : [],
  })
}

/** 据点的一处：离地图中心偏多远，或这一组地标里的第几处 */
function pointRows(e: Mutable<Kind<'hold'>>, map: MapId): Row[] {
  const marks = signalsOf(MAPS[map].kind, 'marks')
  return [
    ...e.points.flatMap((p, i): Row[] => {
      const swap = (to: Mutable<HoldPoint>): void => {
        e.points[i] = to
      }
      const tools = e.points.length > 1 ? [{ icon: ICON.remove, run: () => e.points.splice(i, 1) }] : []
      const where = field({
        kind: 'choice',
        label: `第 ${i + 1} 处`,
        tools,
        options: [
          { label: '离中心', chosen: !('mark' in p), run: () => swap({ dx: 0, dy: 0 }) },
          ...(marks.length > 0 || 'mark' in p ? [{ label: '地标', chosen: 'mark' in p, run: () => swap({ mark: marks[0] ?? ('mark' in p ? p.mark : '') }) }] : []),
        ],
      })
      if ('mark' in p) {
        return [
          where,
          ...rowsOf<Extract<HoldPoint, { mark: string }>>({
            mark: [signalPick('地标', map, 'marks', p.mark, (m) => (p.mark = m))],
            nth: [num('第几处', p.nth ?? 0, { min: 0, max: 20, step: 1, format: (v) => `第 ${v + 1} 处`, whole: true }, (v) => put(p, 'nth', v > 0 ? v : undefined), { sub: true, hint: '这一组地标里的第几处，会动的圈跟着它动' })],
          }),
        ]
      }
      const offset = { min: -40, max: 40, step: 0.5, format: cell }
      return [
        where,
        ...rowsOf<Extract<HoldPoint, { dx: number }>>({
          dx: [num('往右', p.dx, offset, (v) => (p.dx = v), { sub: true })],
          dy: [num('往下', p.dy, offset, (v) => (p.dy = v), { sub: true })],
        }),
      ]
    }),
    actions([{ kind: 'do', label: '+ 一处', role: 'add', run: () => e.points.push({ dx: 0, dy: 0 }) }]),
  ]
}

/** 一条结束规则自己的参数 */
export function endRows(e: End, map: MapId): Row[] {
  switch (e.kind) {
    case 'time':
      return rowsOf<Kind<'time'>>({
        kind: [],
        ms: [msNum('时长', e.ms, { min: 1, max: 1_800, step: 1, format: sec }, (v) => (e.ms = v))],
        lose: [flag('到点算输', e.lose === true, (on) => put(e, 'lose', on || undefined), { hint: '不开是撑到时间就算达成' })],
      })
    case 'kills':
      return killRows(e)
    case 'cleared':
      return rowsOf<Kind<'cleared'>>({ kind: [info('清场', undefined, { hint: '定时与成组的敌人都放完、连续刷怪也停了、场上一个不剩' })] })
    case 'boss':
      return rowsOf<Kind<'boss'>>({ kind: [info('打倒头目', undefined, { hint: '头目要在这一阶段或这一场更早的阶段登场：给一队敌人指定头目' })] })
    case 'bossHp':
      return rowsOf<Kind<'bossHp'>>({ kind: [], below: [num('头目血量降到', e.below, { min: 0.05, max: 0.95, step: 0.05, format: pct }, (v) => (e.below = v))] })
    case 'bounty':
      return rowsOf<Kind<'bounty'>>({ kind: [info('悬赏目标', undefined, { hint: '悬赏目标都倒下就达成：在一队敌人里打开“悬赏目标”' })] })
    case 'hold':
      return rowsOf<Kind<'hold'>>({
        kind: [],
        ms: [msNum('站满', e.ms, { min: 1, max: 300, step: 1, format: sec }, (v) => (e.ms = v), { hint: '队长在据点圈里累计站满这么久，各处分到一样长' })],
        radius: [num('圈的半径', e.radius, { min: 0.5, max: 8, step: 0.5, format: cell }, (v) => (e.radius = v))],
        points: [heading('据点'), ...pointRows(e, map)],
      })
    case 'coins':
      return rowsOf<Kind<'coins'>>({ kind: [], count: [count('金币', e.count, 500, '枚', (v) => (e.count = v), { hint: '捡到这么多金币就达成' })] })
    case 'downs':
      return rowsOf<Kind<'downs'>>({ kind: [], count: [count('倒下次数', e.count, 20, '次', (v) => (e.count = v), { hint: '队员累计倒下这么多次就输' })] })
    case 'event':
      return rowsOf<Kind<'event'>>({
        kind: [],
        event: [signalPick('地图事件', map, 'events', e.event, (v) => (e.event = v as typeof e.event))],
        count: [count('次数', e.count, 50, '次', (v) => (e.count = v), { hint: '这件事发生这么多次' })],
        lose: [loseFlag(e, '不开是发生够了就算达成')],
      })
    case 'gauge': {
      const above = e.above !== undefined
      return rowsOf<Kind<'gauge'>>({
        kind: [],
        gauge: [signalPick('地图读数', map, 'gauges', e.gauge, (v) => (e.gauge = v as typeof e.gauge))],
        above: [
          field({
            kind: 'choice',
            label: '方向',
            options: [
              {
                label: '升过',
                chosen: above,
                run: () => {
                  e.above = e.below ?? 0.5
                  delete e.below
                },
              },
              {
                label: '降过',
                chosen: !above,
                run: () => {
                  e.below = e.above ?? 0.5
                  delete e.above
                },
              },
            ],
          }),
          num('线', e.above ?? e.below ?? 0.5, { min: 0.05, max: 0.95, step: 0.05, format: pct }, (v) => (above ? (e.above = v) : (e.below = v)), { sub: true }),
        ],
        below: [],
        lose: [loseFlag(e, '不开是读数过线就算达成')],
      })
    }
    case 'visit':
      return rowsOf<Kind<'visit'>>({
        kind: [],
        mark: [signalPick('地标', map, 'marks', e.mark, (v) => (e.mark = v))],
        count: optional('只到访几处', e.count, () => 1, (v) => put(e, 'count', v), (v) => [count('处数', v, 20, '处', (x) => (e.count = x), { sub: true })], { hint: '不开是这一组地标每一处都要到' }),
        radius: [num('圈的半径', e.radius, { min: 0.5, max: 8, step: 0.5, format: cell }, (v) => (e.radius = v))],
        ms: [msNum('每处站满', e.ms, { min: 0.5, max: 60, step: 0.5, format: sec }, (v) => (e.ms = v))],
      })
    case 'leak':
      return rowsOf<Kind<'leak'>>({
        kind: [],
        mark: [signalPick('地标', map, 'marks', e.mark, (v) => (e.mark = v), '要有敌人朝这组地标行进：给一批敌人换上朝它行进的走法')],
        radius: [num('圈的半径', e.radius, { min: 0.5, max: 8, step: 0.5, format: cell }, (v) => (e.radius = v), { hint: '敌人走进这么近就离场，算漏过去一只' })],
        count: [count('漏过几只就输', e.count, 100, '只', (v) => (e.count = v))],
      })
  }
}
