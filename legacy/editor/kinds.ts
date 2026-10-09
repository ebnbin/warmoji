import { MAPS } from '../data/maps'
import { signalsOf } from '../data/signals'
import type { MapCue, MapEvent, MapGauge } from '../data/signals'
import type { MapId } from '../types/maps'
import type { StarRule } from '../types/runs'
import type { End, Spawn } from './draft'

/** 导航与参数里用到的图标 */
export const ICON = {
  team: '1f46a',
  rules: '1f4dc',
  curve: '1f4c8',
  teamLevel: '1f199',
  stars: '2b50',
  recruit: '1f91d',
  shop: '1f6d2',
  phase: '1f4d1',
  squad: '1f465',
  cue: '1f4e3',
  random: '1f3b2',
  remove: '274c',
  leader: '1f451',
  type: '270f',
  chapter: '1f4d6',
  near: '1f440',
  far: '1f52d',
  ring: '2b55',
  behind: '1f519',
  gate: '1f6aa',
  mark: '1f4cd',
  event: '26a1',
  drive: '1f9ed',
  hazard: '2620',
  buff: '2728',
  debuff: '1f4a2',
  none: '1f6ab',
} as const

interface Kind<T> {
  readonly icon: string
  readonly name: string
  /** 新加一条时的样子：这张图写不了这一种是 undefined */
  readonly make: (map: MapId) => T | undefined
}

/** 这张图这一类信号里的第一个名字 */
const first = <T extends string>(map: MapId, field: 'events' | 'gauges' | 'cues' | 'marks'): T | undefined => signalsOf(MAPS[map].kind, field)[0] as T | undefined

/** 刷怪的几种写法 */
export const SPAWN_KINDS: { readonly [K in Spawn['kind']]: Kind<Extract<Spawn, { kind: K }>> } = {
  stream: { icon: '1f30a', name: '连续刷怪', make: () => ({ kind: 'stream' }) },
  batch: { icon: '1f6a8', name: '一队敌人', make: () => ({ kind: 'batch', atMs: 10_000, squad: { count: 6 } }) },
  waves: { icon: '1f501', name: '成组敌人', make: () => ({ kind: 'waves', atMs: 0, gapMs: 3_000, squads: [{ count: 6 }, { count: 10 }] }) },
}

/** 结束规则的几种写法 */
export const END_KINDS: { readonly [K in End['kind']]: Kind<Extract<End, { kind: K }>> } = {
  time: { icon: '23f1', name: '时限', make: () => ({ kind: 'time', ms: 60_000 }) },
  kills: { icon: '1f480', name: '击杀数', make: () => ({ kind: 'kills', count: 50 }) },
  cleared: { icon: '1f9f9', name: '清场', make: () => ({ kind: 'cleared' }) },
  boss: { icon: '1f451', name: '打倒头目', make: () => ({ kind: 'boss' }) },
  bossHp: { icon: '1fa78', name: '头目血量', make: () => ({ kind: 'bossHp', below: 0.5 }) },
  bounty: { icon: '1f3af', name: '悬赏目标', make: () => ({ kind: 'bounty' }) },
  hold: { icon: '1f6a9', name: '据点', make: () => ({ kind: 'hold', ms: 12_000, radius: 2, points: [{ dx: 0, dy: 0 }] }) },
  coins: { icon: '1fa99', name: '金币', make: () => ({ kind: 'coins', count: 30 }) },
  downs: { icon: '1f915', name: '倒下就输', make: () => ({ kind: 'downs', count: 3 }) },
  event: {
    icon: ICON.event,
    name: '地图事件',
    make: (map) => {
      const event = first<MapEvent>(map, 'events')
      return event === undefined ? undefined : { kind: 'event', event, count: 1 }
    },
  },
  gauge: {
    icon: '1f4ca',
    name: '地图读数',
    make: (map) => {
      const gauge = first<MapGauge>(map, 'gauges')
      return gauge === undefined ? undefined : { kind: 'gauge', gauge, above: 0.5 }
    },
  },
  visit: {
    icon: ICON.mark,
    name: '到访地标',
    make: (map) => {
      const mark = first<string>(map, 'marks')
      return mark === undefined ? undefined : { kind: 'visit', mark, radius: 1.5, ms: 3_000 }
    },
  },
  leak: {
    icon: '1f6a7',
    name: '漏怪就输',
    make: (map) => {
      const mark = first<string>(map, 'marks')
      return mark === undefined ? undefined : { kind: 'leak', mark, radius: 1.5, count: 5 }
    },
  },
}

/** 对地图下的指令：这张图有指令才写得了 */
export function newCue(map: MapId): { cue: MapCue; atMs: number } | undefined {
  const cue = first<MapCue>(map, 'cues')
  return cue === undefined ? undefined : { cue, atMs: 10_000 }
}

/** 星级条件的几种写法 */
export const STAR_KINDS: { readonly [K in StarRule['kind']]: { readonly icon: string; readonly name: string; readonly make: () => Extract<StarRule, { kind: K }> } } = {
  downs: { icon: '1f915', name: '倒下不超过', make: () => ({ kind: 'downs', count: 0 }) },
  time: { icon: '23f1', name: '用时不超过', make: () => ({ kind: 'time', ms: 120_000 }) },
  switches: { icon: '1f504', name: '换队长不超过', make: () => ({ kind: 'switches', count: 0 }) },
  skills: { icon: '1f300', name: '放技能不超过', make: () => ({ kind: 'skills', count: 0 }) },
  kills: { icon: '1f480', name: '击杀至少', make: () => ({ kind: 'kills', count: 100 }) },
  hazard: { icon: ICON.hazard, name: '危害伤害不超过', make: () => ({ kind: 'hazard', by: 'meteor', damage: 100 }) },
}
