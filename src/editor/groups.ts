import { POOLS } from '../data/battlefield'
import { BOSSES, ENEMIES, ENEMY_DEFS } from '../data/enemies'
import { MAPS } from '../data/maps'
import { signalName, signalsOf } from '../data/signals'
import type { Polarity } from '../types/battlefield'
import type { DriveDef, EnemyDef, EnemyKind } from '../types/enemies'
import type { MapId } from '../types/maps'
import type { Escort, GroupTraits, Loot, MixEntry, SpawnAt, Squad } from '../types/runs'
import { keysOf } from '../util/record'
import type { Mutable, WaveSquad } from './draft'
import { ICON } from './kinds'
import { modsRows } from './mods'
import { actions, bannerRows, field, flag, num, optional, pct, pick, put, rowsOf, times, unit } from './rows'
import type { Each, Option, Row } from './rows'

export const ALL_ENEMIES: readonly EnemyDef[] = [...ENEMY_DEFS, ...BOSSES]

const cell = unit('格')

/** 选一种敌人：none 写了就多一项不指定 */
export function enemyField(label: string, current: EnemyKind | undefined, pool: readonly EnemyDef[], set: (kind: EnemyKind) => void, none?: { readonly label: string; readonly icon: string; readonly set: () => void }, sub = false): Row {
  const cur = current === undefined ? undefined : ENEMIES[current]
  const options: Option[] = [
    ...(none ? [{ emoji: none.icon, label: none.label, chosen: cur === undefined, run: none.set }] : []),
    ...pool.map((e): Option => ({ emoji: e.emoji, outline: 'enemy', label: e.name, chosen: e.kind === current, run: () => set(e.kind) })),
  ]
  return pick(label, cur?.name ?? none?.label ?? '', '选敌人', options, { icon: cur?.emoji ?? none?.icon, outline: cur ? 'enemy' : undefined, sub })
}

/** 一份配比：逐种调权重或删掉，删空了 drop；最后一排加一种，还没有配比时 open 给出一份空的 */
export function mixRows(own: Mutable<MixEntry>[] | undefined, open: () => Mutable<MixEntry>[], drop: () => void, sub: boolean): Row[] {
  const mix = own ?? []
  const total = mix.reduce((n, m) => n + m.weight, 0)
  const used = new Set(mix.map((m) => m.kind))
  return [
    ...mix.map((m, i) =>
      num(ENEMIES[m.kind].name, m.weight, { min: 1, max: 10, step: 1, format: String, whole: true }, (v) => (m.weight = v), {
        icon: ENEMIES[m.kind].emoji,
        outline: 'enemy',
        hint: `权重 · 占 ${pct(m.weight / total)}`,
        sub,
        tools: [
          {
            icon: ICON.remove,
            run: () => {
              mix.splice(i, 1)
              if (mix.length === 0) drop()
            },
          },
        ],
      }),
    ),
    actions([
      {
        kind: 'menu',
        label: '+ 敌人',
        role: 'add',
        title: '加一种敌人',
        options: ENEMY_DEFS.filter((e) => !used.has(e.kind)).map((e): Option => ({ emoji: e.emoji, outline: 'enemy', label: e.name, run: () => open().push({ kind: e.kind, weight: 1 }) })),
      },
    ]),
  ]
}

/** 一批敌人的去处怎么说 */
function atText(at: SpawnAt | undefined, map: MapId): { readonly label: string; readonly icon: string } {
  if (!at) return { label: '看得见队伍', icon: ICON.near }
  switch (at.kind) {
    case 'far':
      return { label: '远处', icon: ICON.far }
    case 'ring':
      return { label: '围一圈', icon: ICON.ring }
    case 'behind':
      return { label: '身后', icon: ICON.behind }
    case 'gate':
      return { label: `出怪口 · ${MAPS[map].gates.kinds[at.gate]?.name ?? `${at.gate}（这张图没有）`}`, icon: ICON.gate }
  }
}

/** 一批敌人从哪来：看得见队伍、远处、围一圈、身后，或这张图的一种出怪口；前几种定下的点会吸附到附近的出怪口 */
export function atRows(g: { at?: Mutable<SpawnAt> }, map: MapId): Row[] {
  const at = g.at
  const set = (v: Mutable<SpawnAt> | undefined): void => put(g, 'at', v)
  const now = atText(at, map)
  const options: Option[] = [
    { emoji: ICON.near, label: '看得见队伍', chosen: at === undefined, run: () => set(undefined) },
    { emoji: ICON.far, label: '远处', chosen: at?.kind === 'far', run: () => set({ kind: 'far' }) },
    { emoji: ICON.ring, label: '围一圈', chosen: at?.kind === 'ring', run: () => set({ kind: 'ring', dist: 6 }) },
    { emoji: ICON.behind, label: '身后', chosen: at?.kind === 'behind', run: () => set({ kind: 'behind', dist: 4 }) },
    ...Object.entries(MAPS[map].gates.kinds).map(
      ([id, k]): Option => ({ emoji: ICON.gate, label: `出怪口 · ${k.name}`, chosen: at?.kind === 'gate' && at.gate === id, run: () => set({ kind: 'gate', gate: id }) }),
    ),
  ]
  const rows: Row[] = [pick('站位', now.label, '选站位', options, { icon: now.icon, hint: '定下的点会吸附到附近的出怪口，按出怪口的样子进场' })]
  if (at?.kind === 'ring' || at?.kind === 'behind') rows.push(num('离队长', at.dist, { min: 0.5, max: 15, step: 0.5, format: cell }, (v) => (at.dist = v), { sub: true }))
  return rows
}

type Drive<K extends DriveDef['kind']> = Extract<DriveDef, { kind: K }>
type Nest = Extract<DriveDef, { kind: 'orbit'; around: 'nest' }>
type Circle = Extract<DriveDef, { kind: 'orbit'; around: 'foe' }>

/** 换上的走法怎么说 */
function driveText(d: DriveDef): string {
  switch (d.kind) {
    case 'chase':
      return d.at === 'leader' ? '追击（盯队长）' : '追击'
    case 'wander':
      return '游荡'
    case 'stay':
      return '原地不动'
    case 'flee':
      return '逃跑'
    case 'coinThief':
      return '偷金币'
    case 'standoff':
      return '定距吐弹'
    case 'orbit':
      return d.around === 'nest' ? '护巢环绕' : '绕人兜圈'
    case 'march':
      return `朝${signalName('marks', d.mark)}行进`
  }
}

/** 走法自己的参数 */
function driveParams(d: Mutable<DriveDef>): Row[] {
  const n = (label: string, value: number, max: number, set: (v: number) => void, hint?: string): Row => num(label, value, { min: 0.5, max, step: 0.5, format: cell }, set, { sub: true, hint })
  switch (d.kind) {
    case 'chase':
      return rowsOf<Drive<'chase'>>({ kind: [], at: [] })
    case 'wander':
    case 'stay':
    case 'coinThief':
      return rowsOf<Drive<'wander' | 'stay' | 'coinThief'>>({ kind: [] })
    case 'flee':
      return rowsOf<Drive<'flee'>>({ kind: [], range: [n('躲开', d.range, 20, (v) => (d.range = v), '队伍进到这么近就跑')] })
    case 'standoff':
      return rowsOf<Drive<'standoff'>>({ kind: [], standoffDist: [n('保持距离', d.standoffDist, 15, (v) => (d.standoffDist = v))] })
    case 'march':
      return rowsOf<Drive<'march'>>({ kind: [], mark: [] })
    case 'orbit':
      if (d.around === 'nest') {
        const nest: Mutable<Nest> = d
        return rowsOf<Nest>({ kind: [], around: [], radius: [n('环绕半径', nest.radius, 10, (v) => (nest.radius = v))], aggroRange: [n('扑上去', nest.aggroRange, 20, (v) => (nest.aggroRange = v), '敌人进到巢这么近就扑上去')] })
      }
      return rowsOf<Circle>({ kind: [], around: [], radius: [n('兜圈半径', d.radius, 10, (v) => (d.radius = v))] })
  }
}

/** 指定了一种敌人时换掉它的走法 */
function driveRows(g: Mutable<GroupTraits>, map: MapId): Row[] {
  const d = g.drive
  const set = (v: Mutable<DriveDef> | undefined): void => put(g, 'drive', v)
  const choices: readonly Mutable<DriveDef>[] = [
    { kind: 'chase' },
    { kind: 'chase', at: 'leader' },
    { kind: 'wander' },
    { kind: 'stay' },
    { kind: 'flee', range: 7 },
    { kind: 'coinThief' },
    { kind: 'standoff', standoffDist: 5 },
    { kind: 'orbit', around: 'nest', radius: 2, aggroRange: 4 },
    { kind: 'orbit', around: 'foe', radius: 3 },
    ...signalsOf(MAPS[map].kind, 'marks').map((mark): Mutable<DriveDef> => ({ kind: 'march', mark })),
  ]
  const options: Option[] = [
    { emoji: ICON.none, label: '原本的走法', chosen: d === undefined, run: () => set(undefined) },
    ...choices.map((c): Option => ({ emoji: c.kind === 'march' ? ICON.mark : ICON.drive, label: driveText(c), chosen: d !== undefined && driveText(d) === driveText(c), run: () => set(c) })),
  ]
  return [pick('走法', d ? driveText(d) : '原本的走法', '换一种走法', options, { icon: ICON.drive, hint: '换掉这种敌人原本怎么走' }), ...(d ? driveParams(d) : [])]
}

/** 打死后掉在地上的效果：这张图的效果池里有的极性 */
function carryRows(g: Mutable<GroupTraits>, map: MapId): Row[] {
  const names: Readonly<Record<Polarity, string>> = { buff: '增益', debuff: '减益' }
  const have = new Set<Polarity>(POOLS[map].map((p) => p.polarity))
  if (g.carry) have.add(g.carry)
  if (have.size === 0) return []
  const options: Option[] = [
    { emoji: ICON.none, label: '不带', chosen: g.carry === undefined, run: () => delete g.carry },
    ...keysOf(names)
      .filter((p) => have.has(p))
      .map((p): Option => ({ emoji: ICON[p], label: `带${names[p]}`, chosen: g.carry === p, run: () => (g.carry = p) })),
  ]
  return [pick('身上带的效果', g.carry ? `带${names[g.carry]}` : '不带', '身上带什么效果', options, { icon: g.carry ? ICON[g.carry] : ICON.none, hint: '每只带一个这张图效果池里的效果，打死掉在地上' })]
}

/** 战利品倍率：都回到 1 就整个去掉 */
function lootRows(g: Mutable<GroupTraits>): Row[] {
  const factor = { min: 0, max: 10, step: 0.1, format: times }
  const set = (key: keyof Loot, v: number): void => {
    const l = (g.loot ??= {})
    put(l, key, v === 1 ? undefined : v)
    if (keysOf(l).length === 0) delete g.loot
  }
  return optional<Mutable<Loot>>('战利品倍率', g.loot, () => ({ coins: 2 }), (l) => put(g, 'loot', l), (l) =>
    rowsOf<Loot>({
      xp: [num('经验', l.xp ?? 1, factor, (v) => set('xp', v), { sub: true })],
      coins: [num('金币', l.coins ?? 1, factor, (v) => set('coins', v), { sub: true })],
    }),
  { hint: '乘在它们掉的经验与金币上' })
}

/** 一批敌人共有的特征：bosses 为真时能指定头目 */
export function traitEach(g: Mutable<GroupTraits>, map: MapId, phaseMix: readonly MixEntry[] | undefined, bosses: boolean): Each<GroupTraits> {
  const mode = g.enemy ? 'one' : g.mix ? 'own' : 'phase'
  const pool = bosses ? ALL_ENEMIES : ENEMY_DEFS
  return {
    enemy: [
      field({
        kind: 'choice',
        label: '敌人',
        hint: mode === 'one' ? '只放这一种' : mode === 'own' ? '按这一批自己的配比抽' : '按这一阶段的配比抽',
        options: [
          {
            label: '阶段配比',
            chosen: mode === 'phase',
            run: () => {
              delete g.enemy
              delete g.mix
              delete g.drive
            },
          },
          {
            label: '指定',
            chosen: mode === 'one',
            run: () => {
              g.enemy ??= pool[0]!.kind
              delete g.mix
            },
          },
          {
            label: '自带配比',
            chosen: mode === 'own',
            run: () => {
              delete g.enemy
              delete g.drive
              g.mix ??= structuredClone(phaseMix ?? [{ kind: ENEMY_DEFS[0]!.kind, weight: 1 }]) as Mutable<MixEntry>[]
            },
          },
        ],
      }),
      ...(g.enemy ? [enemyField('哪一种', g.enemy, pool, (kind) => (g.enemy = kind), undefined, true)] : []),
    ],
    mix: g.mix ? mixRows(g.mix, () => (g.mix ??= []), () => delete g.mix, true) : [],
    drive: g.enemy ? driveRows(g, map) : [],
    stats: modsRows('它们的属性修正', g.stats, (m) => put(g, 'stats', m), '只给这一批敌人'),
    eliteChance: [num('精英几率', g.eliteChance ?? 0, { min: 0, max: 1, step: 0.05, format: pct }, (v) => put(g, 'eliteChance', v > 0 ? v : undefined), { hint: '每只是精英的几率' })],
    huntLeader: [flag('盯着队长', g.huntLeader === true, (on) => put(g, 'huntLeader', on || undefined), { hint: '里面追人的都去追队长' })],
    loot: lootRows(g),
    carry: carryRows(g, map),
  }
}

/** 跟着一队一起放出的护卫：不算悬赏目标，也不带这一队的特征 */
function escortRows(sq: Mutable<Squad>): Row[] {
  return optional<Mutable<Escort>>('护卫', sq.escort, () => ({ enemy: ENEMY_DEFS[0]!.kind, count: 3 }), (e) => put(sq, 'escort', e), (e) =>
    rowsOf<Escort>({
      enemy: [enemyField('护卫', e.enemy, ENEMY_DEFS, (kind) => (e.enemy = kind), undefined, true)],
      count: [num('只数', e.count, { min: 1, max: 40, step: 1, format: unit('只'), whole: true }, (v) => (e.count = v), { sub: true })],
      elite: [flag('都是精英', e.elite === true, (on) => put(e, 'elite', on || undefined), { sub: true })],
      stats: modsRows('护卫的属性修正', e.stats, (m) => put(e, 'stats', m), '只给护卫'),
    }),
  { hint: '跟这一队一起放出的另一种敌人' })
}

/** 一队敌人 */
export function squadEach(sq: Mutable<Squad>, map: MapId, phaseMix: readonly MixEntry[] | undefined): Each<Squad> {
  const t = traitEach(sq, map, phaseMix, true)
  return {
    enemy: t.enemy,
    mix: t.mix,
    at: atRows(sq, map),
    count: [num('只数', sq.count, { min: 1, max: 80, step: 1, format: unit('只'), whole: true }, (v) => (sq.count = v))],
    elites: [num('精英', sq.elites ?? 0, { min: 0, max: Math.max(1, sq.count), step: 1, format: unit('只'), whole: true }, (v) => put(sq, 'elites', v > 0 ? v : undefined), { hint: '前几只必是精英' })],
    spreadMs: [num('放出用时', (sq.spreadMs ?? 0) / 1000, { min: 0, max: 20, step: 0.5, format: (v) => `${v} 秒` }, (v) => put(sq, 'spreadMs', v > 0 ? Math.round(v * 1000) : undefined), { hint: '在这段时间里一只接一只放出' })],
    bounty: [flag('悬赏目标', sq.bounty === true, (on) => put(sq, 'bounty', on || undefined), { hint: '结束规则里的悬赏目标就是它们' })],
    drive: t.drive,
    eliteChance: t.eliteChance,
    huntLeader: t.huntLeader,
    loot: t.loot,
    carry: t.carry,
    escort: escortRows(sq),
    stats: t.stats,
  }
}

/** 成组敌人里的一组：一队敌人加上它的横幅 */
export function waveSquadRows(sq: WaveSquad, map: MapId, phaseMix: readonly MixEntry[] | undefined): Row[] {
  return rowsOf<WaveSquad>({ ...squadEach(sq, map, phaseMix), banner: bannerRows('横幅', sq.banner, (b) => put(sq, 'banner', b), '这一组来时打出') })
}
