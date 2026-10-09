import type { MapKind } from '../types/maps'

/**
 * 一种地图给关卡用的信号，键是关卡里写的名字、值是说法：
 * events 是这张图上一再发生、数得着的事；gauges 是此刻的一个比例（0 到 1）；cues 是关卡能让它此刻做的一件它本来就会做的事；marks 是能当目标、据点或行进去处的地标组。
 */
export interface MapSignals {
  readonly events?: Readonly<Record<string, string>>
  readonly gauges?: Readonly<Record<string, string>>
  readonly cues?: Readonly<Record<string, string>>
  readonly marks?: Readonly<Record<string, string>>
}

/** 每种地图的信号：地图的规则照这张表发事件、给读数、接指令、摆地标，构建期按它查关卡写的名字 */
export const SIGNALS = {
  meadow: { marks: { gate: '栅栏门' } },
  sakura: { events: { swept: '敌人被溪水冲走' }, marks: { bridge: '木桥' } },
  desert: { events: { lap: '沿一个方向走满一圈' }, marks: { marker: '标志物' } },
  deep: { events: { depart: '潜艇开走', dock: '潜艇停稳' }, cues: { depart: '潜艇开走' }, marks: { door: '潜艇门口' } },
  ruins: { events: { collapse: '墙塌' }, gauges: { walls: '残墙' }, cues: { quake: '余震' }, marks: { tower: '塔楼' } },
  amethyst: { events: { dusk: '日落', dawn: '日出' }, marks: { tunnel: '小晶洞' } },
  volcano: { events: { erupt: '火山喷发' }, cues: { erupt: '火山喷发' }, marks: { vent: '喷气孔' } },
  floe: { events: { gust: '阵风' }, cues: { gust: '起一阵风' } },
  theater: { events: { act: '换幕' } },
  petri: { gauges: { colony: '菌落覆盖' }, marks: { sector: '分区' } },
  exit: { events: { jump: '整队穿门' }, cues: { lock: '锁住所有门' }, marks: { cabin: '舱室' } },
  nebula: { gauges: { mass: '黑洞长大' }, cues: { meteor: '来一颗流星' } },
} as const satisfies { readonly [K in MapKind]?: MapSignals }

type Table = typeof SIGNALS
type Names<F extends keyof MapSignals> = { [K in keyof Table]: Table[K] extends { readonly [P in F]: infer R } ? keyof R : never }[keyof Table]

export type MapEvent = Names<'events'>
export type MapGauge = Names<'gauges'>
export type MapCue = Names<'cues'>

const BY_KIND: { readonly [K in MapKind]?: MapSignals } = SIGNALS

/** 这种地图有没有这一类信号里的这个名字 */
export function hasSignal(kind: MapKind, field: keyof MapSignals, name: string): boolean {
  return BY_KIND[kind]?.[field]?.[name] !== undefined
}

/** 这种地图这一类信号里的全部名字 */
export function signalsOf(kind: MapKind, field: keyof MapSignals): string[] {
  return Object.keys(BY_KIND[kind]?.[field] ?? {})
}

/** 这一类信号里这个名字的说法：同一个名字在哪种地图上说法都一样（构建期查过） */
export function signalName(field: keyof MapSignals, name: string): string {
  for (const s of Object.values<MapSignals>(SIGNALS)) {
    const label = s[field]?.[name]
    if (label !== undefined) return label
  }
  return name
}
