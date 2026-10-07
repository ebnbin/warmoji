import { CHARACTERS, ROSTER_IDS, TEAM } from '../data/characters'
import { MAX_CHAR_LEVEL } from '../data/charLevel'
import { BOSSES, CURVE, ENEMIES, ENEMY_DEFS } from '../data/enemies'
import { MAP_IDS, MAPS } from '../data/maps'
import type { Path } from '../data/runCheck'
import { TAGS } from '../data/tags'
import { WAVE } from '../data/waves'
import type { OutlineKind } from '../emoji/svg'
import type { EnemyDef, EnemyKind } from '../types/enemies'
import type { MapDef } from '../types/maps'
import type { BatchRule, Between, GroupTraits, RunRules, SpawnAt, Squad, StreamRule } from '../types/runs'
import { keysOf } from '../util/record'
import { endText } from '../scene/runLines'
import { defaultTeam, isStage } from './draft'
import type { Draft, End, Mutable, Phase, Stage, Step, Waves } from './draft'
import { END_KINDS, ICON, SPAWN_KINDS } from './kinds'
import type { Node, Target } from './outline'

/** 弹出选择里的一项 */
export interface Option {
  readonly emoji: string
  readonly outline?: OutlineKind
  readonly label: string
  /** 眼下选的就是它 */
  readonly chosen?: boolean
  readonly run: () => void
  /** 选了它之后改选导航里的这一项 */
  readonly select?: Path
}

/** 一个操作：直接做，或者先弹出选择再做选的那一项 */
export type Action = {
  readonly label: string
  readonly enabled?: boolean
  /** add 是加东西，remove 是删东西 */
  readonly role?: 'add' | 'remove'
} & (
  | { readonly kind: 'do'; readonly run: () => void; readonly select?: Path; readonly confirm?: string }
  | { readonly kind: 'menu'; readonly title: string; readonly options: readonly Option[] }
)

/** 行末的小图标按钮 */
export interface Tool {
  readonly icon: string
  readonly run: () => void
}

interface FieldBase {
  readonly label: string
  readonly hint?: string
  readonly icon?: string
  readonly outline?: OutlineKind
  /** 由上一行打开的从属参数 */
  readonly sub?: boolean
  readonly tools?: readonly Tool[]
}

/** 一个参数：数值、开关、几选一、弹出选择，或者只是看看 */
export type Field = FieldBase &
  (
    | {
        readonly kind: 'number'
        readonly value: number
        readonly min: number
        readonly max: number
        readonly step: number
        readonly format: (v: number) => string
        readonly set: (v: number) => void
      }
    | { readonly kind: 'flag'; readonly value: boolean; readonly set: (on: boolean) => void }
    | { readonly kind: 'choice'; readonly options: readonly { readonly label: string; readonly chosen: boolean; readonly run: () => void }[] }
    | { readonly kind: 'pick'; readonly value: string; readonly title: string; readonly options: readonly Option[] }
    | { readonly kind: 'info'; readonly value?: string }
  )

/** 右边一行：分节标题、一个参数或一排操作 */
export type Row =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'field'; readonly field: Field }
  | { readonly kind: 'actions'; readonly actions: readonly Action[] }

type More = Omit<FieldBase, 'label'>

interface Range {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly format: (v: number) => string
}

const heading = (text: string): Row => ({ kind: 'heading', text })
const actions = (list: readonly Action[]): Row => ({ kind: 'actions', actions: list })
const field = (f: Field): Row => ({ kind: 'field', field: f })
const num = (label: string, value: number, range: Range, set: (v: number) => void, more: More = {}): Row => field({ kind: 'number', label, value, ...range, set, ...more })
const flag = (label: string, value: boolean, set: (on: boolean) => void, more: More = {}): Row => field({ kind: 'flag', label, value, set, ...more })
const info = (label: string, value?: string, more: More = {}): Row => field({ kind: 'info', label, value, ...more })

const sec = (v: number): string => `${v} 秒`
const moment = (v: number): string => `第 ${v} 秒`
const pct = (v: number): string => `${Math.round(v * 100)}%`
const unit =
  (u: string) =>
  (v: number): string =>
    `${v} ${u}`

const ALL_ENEMIES: readonly EnemyDef[] = [...ENEMY_DEFS, ...BOSSES]

/** 写上一项，给 undefined 就去掉它 */
function put<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete obj[key]
  else obj[key] = value
}

function move<T>(list: T[], from: number, to: number): void {
  list.splice(to, 0, ...list.splice(from, 1))
}

/** 列表里的一项：上移、下移、删除；选中跟着它走，删掉后选中上一层 */
function listActions(list: unknown[], i: number, node: Node, noun: string): Row {
  const to = (j: number): Path => [...node.at.slice(0, -1), j]
  return actions([
    { kind: 'do', label: '上移', enabled: i > 0, run: () => move(list, i, i - 1), select: to(i - 1) },
    { kind: 'do', label: '下移', enabled: i < list.length - 1, run: () => move(list, i, i + 1), select: to(i + 1) },
    { kind: 'do', label: `删除${noun}`, role: 'remove', confirm: `删除「${node.title}」？`, run: () => list.splice(i, 1), select: node.parent },
  ])
}

/** 选一种敌人：第一项是不指定 */
function enemyField(current: EnemyKind | undefined, none: { readonly label: string; readonly icon: string }, pool: readonly EnemyDef[], set: (kind: EnemyKind | undefined) => void): Row {
  const cur = current === undefined ? undefined : ENEMIES[current]
  const options: Option[] = [
    { emoji: none.icon, label: none.label, chosen: cur === undefined, run: () => set(undefined) },
    ...pool.map((e): Option => ({ emoji: e.emoji, outline: 'enemy', label: e.name, chosen: e.kind === current, run: () => set(e.kind) })),
  ]
  return field({ kind: 'pick', label: '敌人', value: cur?.name ?? none.label, title: '选敌人', options, icon: cur?.emoji ?? none.icon, outline: cur ? 'enemy' : undefined })
}

/** 一批敌人从哪抽：指定一种就不再用配比 */
function groupEnemy(g: Mutable<GroupTraits>, bosses: boolean): Row {
  return enemyField(g.enemy, { label: '按配比', icon: ICON.random }, bosses ? ALL_ENEMIES : ENEMY_DEFS, (kind) => {
    put(g, 'enemy', kind)
    if (kind) delete g.mix
  })
}

/** 一批敌人共有的特征 */
function traitRows(g: Mutable<GroupTraits>): Row[] {
  return [
    num('精英几率', g.eliteChance ?? 0, { min: 0, max: 1, step: 0.05, format: pct }, (v) => put(g, 'eliteChance', v > 0 ? v : undefined), { hint: '每只是精英的几率' }),
    flag('盯着队长', g.huntLeader === true, (on) => put(g, 'huntLeader', on || undefined), { hint: '里面追人的都去追队长' }),
  ]
}

/** 站位怎么说 */
function atText(at: SpawnAt | undefined, map: MapDef): { readonly label: string; readonly icon: string } {
  if (!at) return { label: '看得见队伍', icon: ICON.near }
  switch (at.kind) {
    case 'far':
      return { label: '远处', icon: ICON.far }
    case 'ring':
      return { label: '围一圈', icon: ICON.ring }
    case 'behind':
      return { label: '身后', icon: ICON.behind }
    case 'point':
      return { label: '定点', icon: ICON.point }
    case 'gate':
      return { label: `出怪口 · ${map.gates?.kinds[at.gate]?.name ?? `${at.gate}（这张图没有）`}`, icon: ICON.gate }
  }
}

/** 一批敌人从哪来：看得见队伍、远处、围一圈、身后，或这张图的一种出怪口；有出怪口的地图上，前几种定下的点会吸附到附近的出怪口 */
function atRows(g: { at?: Mutable<SpawnAt> }, map: MapDef): Row[] {
  const at = g.at
  const set = (v: Mutable<SpawnAt> | undefined): void => put(g, 'at', v)
  const now = atText(at, map)
  const options: Option[] = [
    { emoji: ICON.near, label: '看得见队伍', chosen: at === undefined, run: () => set(undefined) },
    { emoji: ICON.far, label: '远处', chosen: at?.kind === 'far', run: () => set({ kind: 'far' }) },
    { emoji: ICON.ring, label: '围一圈', chosen: at?.kind === 'ring', run: () => set({ kind: 'ring', dist: 6 }) },
    { emoji: ICON.behind, label: '身后', chosen: at?.kind === 'behind', run: () => set({ kind: 'behind', dist: 4 }) },
    ...Object.entries(map.gates?.kinds ?? {}).map(
      ([id, k]): Option => ({ emoji: ICON.gate, label: `出怪口 · ${k.name}`, chosen: at?.kind === 'gate' && at.gate === id, run: () => set({ kind: 'gate', gate: id }) }),
    ),
  ]
  const hint = map.gates ? '定下的点会吸附到附近的出怪口，按出怪口的样子进场' : '这张图没有出怪口，敌人在定下的点原地冒出来'
  const rows: Row[] = [field({ kind: 'pick', label: '站位', value: now.label, title: '选站位', options, icon: now.icon, hint })]
  if (at?.kind === 'ring' || at?.kind === 'behind') rows.push(num('离队长', at.dist, { min: 1, max: 15, step: 0.5, format: unit('格') }, (v) => (at.dist = v), { sub: true }))
  return rows
}

function squadRows(sq: Mutable<Squad>, map: MapDef): Row[] {
  return [
    groupEnemy(sq, true),
    ...atRows(sq, map),
    num('只数', sq.count, { min: 1, max: 80, step: 1, format: unit('只') }, (v) => (sq.count = v)),
    num('精英', sq.elites ?? 0, { min: 0, max: Math.max(1, sq.count), step: 1, format: unit('只') }, (v) => put(sq, 'elites', v > 0 ? v : undefined), { hint: '前几只必是精英' }),
    num('放出用时', (sq.spreadMs ?? 0) / 1000, { min: 0, max: 20, step: 0.5, format: sec }, (v) => put(sq, 'spreadMs', v > 0 ? Math.round(v * 1000) : undefined), {
      hint: '在这段时间里一只接一只放出',
    }),
    flag('悬赏目标', sq.bounty === true, (on) => put(sq, 'bounty', on || undefined), { hint: '结束规则里的悬赏目标就是它们' }),
    ...traitRows(sq),
  ]
}

/** 新的阶段：接着上一个阶段的配比，一直刷，撑过一分钟 */
function newPhase(from: Phase | undefined): Phase {
  return { mix: structuredClone(from?.mix ?? [{ kind: ENEMY_DEFS[0]!.kind, weight: 1 }]), spawns: [{ kind: 'stream' }], ends: [{ kind: 'time', ms: 60_000 }] }
}

/** 新的一场：接着上一场的地图与配比 */
function newFight(d: Draft): Step {
  const stages = d.steps.flatMap((s) => (s.kind === 'fight' && isStage(s.fight) ? [s.fight] : []))
  const last = stages.at(-1)
  return { kind: 'fight', fight: { name: `第 ${stages.length + 1} 场`, map: last?.map ?? MAP_IDS[0]!, phases: [newPhase(last?.phases.at(-1))] } }
}

/** 新的招募：比眼下最多的人数再多一人 */
function newRecruit(d: Draft): Step {
  const team = d.team && d.team !== 'knobs' ? d.team.slots.length : 0
  const most = Math.max(team, ...d.steps.map((s) => (s.kind === 'recruit' ? s.upTo : 0)))
  return { kind: 'recruit', upTo: Math.min(TEAM.maxSize, most + 1) }
}

function runRows(d: Draft): Row[] {
  const fights = d.steps.filter((s) => s.kind === 'fight').length
  const next: Path = ['steps', d.steps.length]
  return [
    info('名字', d.name),
    num('开局金币', d.coins ?? 0, { min: 0, max: 500, step: 10, format: unit('金币') }, (v) => put(d, 'coins', v > 0 ? v : undefined)),
    heading('加一步'),
    actions([
      { kind: 'do', label: '+ 招募', role: 'add', run: () => d.steps.push(newRecruit(d)), select: next },
      { kind: 'do', label: '+ 商店', role: 'add', run: () => d.steps.push({ kind: 'shop', tier: fights + 1 }), select: next },
      { kind: 'do', label: '+ 战斗', role: 'add', run: () => d.steps.push(newFight(d)), select: next },
    ]),
  ]
}

function teamRows(d: Draft): Row[] {
  const team = d.team === 'knobs' ? undefined : d.team
  const rows = [flag('预设队伍', team !== undefined, (on) => put(d, 'team', on ? (defaultTeam() ?? { slots: [ROSTER_IDS[0]!] }) : undefined), { hint: '开局就按它组队、满血开打；不预设就靠招募步骤组建' })]
  if (!team) return rows
  const slots = team.slots
  slots.forEach((s, i) => {
    const tools: Tool[] = [...(i > 0 ? [{ icon: ICON.leader, run: () => move(slots, i, 0) }] : []), { icon: ICON.remove, run: () => slots.splice(i, 1) }]
    const lead = i === 0 ? '队长' : undefined
    if (typeof s === 'string') rows.push(info(CHARACTERS[s].name, lead, { icon: CHARACTERS[s].emoji, outline: 'player', tools }))
    else rows.push(info(`随机一名${s.tags.map((t) => TAGS[t].name).join('、')}`, lead, { icon: ICON.random, tools }))
  })
  const free = ROSTER_IDS.filter((id) => !slots.includes(id))
  rows.push(
    actions([
      {
        kind: 'menu',
        label: '+ 队员',
        role: 'add',
        enabled: slots.length < TEAM.maxSize,
        title: '加一名队员',
        options: free.map((id): Option => ({ emoji: CHARACTERS[id].emoji, outline: 'player', label: CHARACTERS[id].name, run: () => slots.push(id) })),
      },
    ]),
    num('等级下限', team.level ?? 1, { min: 1, max: MAX_CHAR_LEVEL, step: 1, format: unit('级') }, (v) => put(team, 'level', v > 1 ? v : undefined), { hint: '买道具攒的等级比它低时按它算' }),
  )
  return rows
}

const BETWEEN: Readonly<Record<Between, { readonly label: string; readonly hint: string }>> = {
  carry: { label: '带伤', hint: `活着的带着残血，倒下的回 ${pct(WAVE.reviveHpRatio)} 血` },
  rest: { label: '休整', hint: `每人回复 ${pct(WAVE.restRatio)} 损失的生命，倒下的也起来` },
  full: { label: '满血', hint: '每一场都满血开打' },
  permadeath: { label: '阵亡', hint: '一场打完时还倒着的，这一局都回不来' },
}

function rulesRows(d: Draft): Row[] {
  const r: Mutable<RunRules> = d.rules ?? {}
  const w = (): Mutable<RunRules> => (d.rules ??= {})
  const leader = (): NonNullable<Mutable<RunRules>['leader']> => (w().leader ??= {})
  const between = r.between ?? 'carry'
  const rescue = r.rescue
  return [
    field({
      kind: 'choice',
      label: '场与场之间',
      hint: BETWEEN[between].hint,
      options: keysOf(BETWEEN).map((k) => ({ label: BETWEEN[k].label, chosen: k === between, run: () => put(w(), 'between', k === 'carry' ? undefined : k) })),
    }),
    flag('限定命数', r.lives !== undefined, (on) => put(w(), 'lives', on ? 3 : undefined), { hint: '全队一共能起来几次：自己起来、被扶起来、被技能救起来都算' }),
    ...(r.lives !== undefined ? [num('命数', r.lives, { min: 1, max: 9, step: 1, format: unit('次') }, (v) => (w().lives = v), { sub: true })] : []),
    flag('倒下自己起来', r.revive !== false, (on) => put(w(), 'revive', on ? undefined : false)),
    flag('队长扶起倒下的队员', rescue !== undefined, (on) => put(w(), 'rescue', on ? { ms: 2_000, radius: 1.2 } : undefined), { hint: '队长在倒下的队员身边站满一段时间' }),
    ...(rescue
      ? [
          num('站满', rescue.ms / 1000, { min: 0.5, max: 10, step: 0.5, format: sec }, (v) => (rescue.ms = Math.round(v * 1000)), { sub: true }),
          num('离他多近', rescue.radius, { min: 0.5, max: 3, step: 0.05, format: unit('格') }, (v) => (rescue.radius = v), { sub: true }),
        ]
      : []),
    flag('能放主动技能', r.skills !== false, (on) => put(w(), 'skills', on ? undefined : false)),
    flag('敌人现身不打预兆', r.surprise === true, (on) => put(w(), 'surprise', on || undefined)),
    flag('不能换队长', r.leader?.lock === true, (on) => put(leader(), 'lock', on || undefined)),
    flag('队长倒下就输', r.leader?.critical === true, (on) => put(leader(), 'critical', on || undefined)),
    flag('限定视野', r.vision !== undefined, (on) => put(w(), 'vision', on ? 6 : undefined), { hint: '只看得见队长身边这么远，外面一片漆黑' }),
    ...(r.vision !== undefined ? [num('视野', r.vision, { min: 1, max: 20, step: 0.5, format: unit('格') }, (v) => (w().vision = v), { sub: true })] : []),
    flag('限定等级上限', r.maxLevel !== undefined, (on) => put(w(), 'maxLevel', on ? 1 : undefined)),
    ...(r.maxLevel !== undefined ? [num('等级上限', r.maxLevel, { min: 1, max: MAX_CHAR_LEVEL - 1, step: 1, format: unit('级') }, (v) => (w().maxLevel = v), { sub: true })] : []),
  ]
}

function curveRows(d: Draft): Row[] {
  const c = d.curve
  const own = flag('自定义难度曲线', c !== undefined, (on) => put(d, 'curve', on ? { ...CURVE } : undefined), { hint: '敌人血量、刷怪间隔与掉币几率都跟着难度时钟走；不自定义就按默认的一条' })
  if (!c) return [own]
  const factor = (v: number): string => v.toFixed(2)
  return [
    own,
    num('血量增长', c.hpGrowthPerMin, { min: 0, max: 3, step: 0.05, format: (v) => `每分钟 +${pct(v)}` }, (v) => (c.hpGrowthPerMin = v)),
    num('起始刷怪间隔', c.startIntervalMs, { min: 20, max: 3_000, step: 10, format: unit('毫秒') }, (v) => (c.startIntervalMs = v)),
    num('最短刷怪间隔', c.minIntervalMs, { min: 10, max: 1_000, step: 5, format: unit('毫秒') }, (v) => (c.minIntervalMs = v)),
    num('收紧用时', c.rampSeconds, { min: 10, max: 1_800, step: 10, format: sec }, (v) => (c.rampSeconds = v), { hint: '刷怪间隔在这段时间里从起始收紧到最短' }),
    num('人数系数', c.teamFactorBase, { min: 0.05, max: 2, step: 0.01, format: factor }, (v) => (c.teamFactorBase = v), { hint: '刷怪间隔再除以 系数 + 每人 × 队伍人数' }),
    num('每人', c.teamFactorPerMember, { min: 0, max: 1, step: 0.01, format: factor }, (v) => (c.teamFactorPerMember = v), { sub: true }),
    num('掉币几率下限', c.coinDropChanceMin, { min: 0, max: 1, step: 0.05, format: pct }, (v) => (c.coinDropChanceMin = v)),
    num('掉币几率衰减', c.coinDropChanceHalfLifeSec, { min: 10, max: 1_800, step: 10, format: sec }, (v) => (c.coinDropChanceHalfLifeSec = v), { hint: '越短，击杀掉金币的几率降得越快' }),
  ]
}

function stageRows(f: Stage, node: Node): Row[] {
  const map = MAPS[f.map]
  const reward = (): NonNullable<Stage['reward']> => (f.reward ??= {})
  return [
    field({
      kind: 'pick',
      label: '地图',
      value: map.name,
      title: '选地图',
      icon: map.emoji,
      options: MAP_IDS.map((id): Option => ({ emoji: MAPS[id].emoji, label: MAPS[id].name, chosen: id === f.map, run: () => (f.map = id) })),
    }),
    flag('定难度时钟', f.clockSec !== undefined, (on) => put(f, 'clockSec', on ? 0 : undefined), { hint: '开打时难度时钟从第几秒走起；不定就接着这一局累计打过的时长' }),
    ...(f.clockSec !== undefined ? [num('难度时钟', f.clockSec, { min: 0, max: 1_800, step: 10, format: moment }, (v) => (f.clockSec = v), { sub: true })] : []),
    flag('敌人都盯着队长', f.chaseLeader === true, (on) => put(f, 'chaseLeader', on || undefined)),
    num('过关金币', f.reward?.coins ?? 0, { min: 0, max: 300, step: 5, format: unit('金币') }, (v) => put(reward(), 'coins', v > 0 ? v : undefined)),
    flag('过关回满血', f.reward?.heal === true, (on) => put(reward(), 'heal', on || undefined)),
    heading('阶段'),
    actions([{ kind: 'do', label: '+ 阶段', role: 'add', run: () => f.phases.push(newPhase(f.phases.at(-1))), select: [...node.at, 'fight', 'phases', f.phases.length] }]),
  ]
}

function stepRows(t: Extract<Target, { kind: 'step' }>, node: Node): Row[] {
  const s = t.step
  const own = ((): Row[] => {
    switch (s.kind) {
      case 'recruit':
        return [num('招募到', s.upTo, { min: 1, max: TEAM.maxSize, step: 1, format: unit('人') }, (v) => (s.upTo = v), { hint: '队伍不到这么多人就进招募页补上' })]
      case 'shop':
        return [num('物价档位', s.tier ?? 1, { min: 1, max: 30, step: 1, format: (v) => `第 ${v} 档` }, (v) => (s.tier = v), { hint: '物价与稀有度按第几波算' })]
      case 'fight':
        return isStage(s.fight) ? stageRows(s.fight, node) : [info('旧写法的一场', '编辑器还不支持')]
      case 'repeat':
        return [info('按轮重复', '编辑器还不支持')]
    }
  })()
  return [...own, heading('这一步'), listActions(t.list, t.index, node, '这一步')]
}

function phaseRows(t: Extract<Target, { kind: 'phase' }>, node: Node): Row[] {
  const p = t.phase
  const mix = p.mix ?? []
  const total = mix.reduce((n, m) => n + m.weight, 0)
  const used = new Set(mix.map((m) => m.kind))
  return [
    heading('配比'),
    ...mix.map((m, i) =>
      num(ENEMIES[m.kind].name, m.weight, { min: 1, max: 10, step: 1, format: String }, (v) => (m.weight = v), {
        icon: ENEMIES[m.kind].emoji,
        outline: 'enemy',
        hint: `权重 · 占 ${pct(m.weight / total)}`,
        tools: [
          {
            icon: ICON.remove,
            run: () => {
              mix.splice(i, 1)
              if (mix.length === 0) delete p.mix
            },
          },
        ],
      }),
    ),
    ...(mix.length === 0 ? [info('还没有配比', undefined, { hint: '没指定敌人的刷怪都按配比抽' })] : []),
    actions([
      {
        kind: 'menu',
        label: '+ 敌人',
        role: 'add',
        title: '加一种敌人',
        options: ENEMY_DEFS.filter((e) => !used.has(e.kind)).map((e): Option => ({ emoji: e.emoji, outline: 'enemy', label: e.name, run: () => (p.mix ??= []).push({ kind: e.kind, weight: 1 }) })),
      },
    ]),
    heading('刷怪与结束'),
    flag('结束规则全部达成才算', p.need === 'all', (on) => put(p, 'need', on ? 'all' : undefined), { hint: '不开的话，达成任意一条就算' }),
    actions([
      {
        kind: 'menu',
        label: '+ 刷怪',
        role: 'add',
        title: '加一条刷怪',
        options: keysOf(SPAWN_KINDS).map((k): Option => ({ emoji: SPAWN_KINDS[k].icon, label: SPAWN_KINDS[k].name, run: () => p.spawns.push(SPAWN_KINDS[k].make()), select: [...node.at, 'spawns', p.spawns.length] })),
      },
      {
        kind: 'menu',
        label: '+ 结束规则',
        role: 'add',
        title: '加一条结束规则',
        options: keysOf(END_KINDS).map((k): Option => ({ emoji: END_KINDS[k].icon, label: END_KINDS[k].name, run: () => p.ends.push(END_KINDS[k].make()), select: [...node.at, 'ends', p.ends.length] })),
      },
    ]),
    heading('这一阶段'),
    listActions(t.list, t.index, node, '这一阶段'),
  ]
}

function streamRows(s: Mutable<StreamRule>, map: MapDef): Row[] {
  return [
    groupEnemy(s, false),
    ...atRows(s, map),
    field({
      kind: 'choice',
      label: '间隔',
      hint: s.intervalMs === undefined ? '按这一局的难度曲线、队伍人数与昼夜算' : '每隔固定的时长放一只',
      options: [
        {
          label: '按曲线',
          chosen: s.intervalMs === undefined,
          run: () => {
            delete s.intervalMs
            delete s.ramp
          },
        },
        {
          label: '固定',
          chosen: s.intervalMs !== undefined,
          run: () => {
            s.intervalMs = 1_000
            delete s.intervalMul
          },
        },
      ],
    }),
    s.intervalMs === undefined
      ? num('间隔倍率', s.intervalMul ?? 1, { min: 0.25, max: 4, step: 0.05, format: (v) => `× ${v}` }, (v) => put(s, 'intervalMul', v === 1 ? undefined : v), { sub: true, hint: '乘在按曲线算出的间隔上' })
      : num('每只间隔', s.intervalMs / 1000, { min: 0.05, max: 10, step: 0.05, format: sec }, (v) => (s.intervalMs = Math.round(v * 1000)), { sub: true }),
    num('开始', (s.fromMs ?? 0) / 1000, { min: 0, max: 600, step: 1, format: moment }, (v) => put(s, 'fromMs', v > 0 ? v * 1000 : undefined), { hint: '这一阶段开始后第几秒起刷' }),
    flag('到点停', s.untilMs !== undefined, (on) => put(s, 'untilMs', on ? (s.fromMs ?? 0) + 60_000 : undefined)),
    ...(s.untilMs !== undefined ? [num('停在', s.untilMs / 1000, { min: 1, max: 900, step: 1, format: moment }, (v) => (s.untilMs = v * 1000), { sub: true })] : []),
    flag('限总数', s.total !== undefined, (on) => put(s, 'total', on ? 50 : undefined), { hint: '放满这么多只就停' }),
    ...(s.total !== undefined ? [num('总数', s.total, { min: 1, max: 500, step: 1, format: unit('只') }, (v) => (s.total = v), { sub: true })] : []),
    flag('场上上限', s.cap !== undefined, (on) => put(s, 'cap', on ? 100 : undefined), { hint: '场上敌人到这么多就先不刷' }),
    ...(s.cap !== undefined ? [num('上限', s.cap, { min: 1, max: 400, step: 1, format: unit('只') }, (v) => (s.cap = v), { sub: true })] : []),
    ...traitRows(s),
  ]
}

function batchRows(s: Mutable<BatchRule>, map: MapDef): Row[] {
  return [
    num('登场', s.atMs / 1000, { min: 0, max: 600, step: 1, format: moment }, (v) => (s.atMs = v * 1000), { hint: '这一阶段开始后第几秒放出' }),
    ...squadRows(s.squad, map),
    flag('一再放出', s.every !== undefined, (on) => {
      put(s, 'every', on ? 30_000 : undefined)
      if (!on) delete s.times
    }),
    ...(s.every !== undefined
      ? [
          num('每隔', s.every / 1000, { min: 1, max: 300, step: 1, format: sec }, (v) => (s.every = v * 1000), { sub: true }),
          flag('限次数', s.times !== undefined, (on) => put(s, 'times', on ? 3 : undefined), { sub: true, hint: '不限就一直放到这一阶段结束' }),
          ...(s.times !== undefined ? [num('一共', s.times, { min: 2, max: 50, step: 1, format: unit('队') }, (v) => (s.times = v), { sub: true })] : []),
        ]
      : []),
  ]
}

function wavesRows(s: Waves, node: Node): Row[] {
  return [
    num('首组登场', s.atMs / 1000, { min: 0, max: 600, step: 1, format: moment }, (v) => (s.atMs = v * 1000), { hint: '这一阶段开始后第几秒来第一组' }),
    num('组间隔', s.gapMs / 1000, { min: 0, max: 30, step: 0.5, format: sec }, (v) => (s.gapMs = Math.round(v * 1000)), { hint: '场上清空后再隔这么久来下一组' }),
    info('一共', `${s.squads.length} 组`, { hint: '在导航里选中一组来调它' }),
    actions([{ kind: 'do', label: '+ 一组', role: 'add', run: () => s.squads.push({ count: s.squads.at(-1)?.count ?? 6 }), select: [...node.at, 'squads', s.squads.length] }]),
  ]
}

function spawnRows(t: Extract<Target, { kind: 'spawn' }>, node: Node): Row[] {
  const s = t.spawn
  const map = MAPS[t.stage.map]
  const own = s.kind === 'stream' ? streamRows(s, map) : s.kind === 'batch' ? batchRows(s, map) : wavesRows(s, node)
  return [...own, heading('这一条'), listActions(t.list, t.index, node, '这一条')]
}

function endOwnRows(e: End): Row[] {
  switch (e.kind) {
    case 'time':
      return [
        num('时长', e.ms / 1000, { min: 5, max: 900, step: 5, format: sec }, (v) => (e.ms = v * 1000)),
        flag('到点算输', e.lose === true, (on) => put(e, 'lose', on || undefined), { hint: '不开是撑到时间就算达成' }),
      ]
    case 'kills':
      return [
        num('击杀数', e.count, { min: 1, max: 1_000, step: 1, format: unit('只') }, (v) => (e.count = v)),
        enemyField(e.enemy, { label: '任意敌人', icon: END_KINDS.kills.icon }, ALL_ENEMIES, (kind) => put(e, 'enemy', kind)),
      ]
    case 'cleared':
      return [info('清场', undefined, { hint: '定时与成组的敌人都放完、连续刷怪也停了、场上一个不剩' })]
    case 'boss':
      return [info('打倒头目', undefined, { hint: '头目要在这一阶段或这一场更早的阶段登场：给一队敌人指定头目' })]
    case 'bossHp':
      return [num('头目血量降到', e.below, { min: 0.05, max: 0.95, step: 0.05, format: pct }, (v) => (e.below = v))]
    case 'bounty':
      return [info('悬赏目标', undefined, { hint: '悬赏目标都倒下就达成：在一队敌人里打开“悬赏目标”' })]
    case 'hold':
      return [
        num('站满', e.ms / 1000, { min: 1, max: 300, step: 1, format: sec }, (v) => (e.ms = v * 1000), { hint: '队长在据点圈里累计站满这么久' }),
        num('圈的半径', e.radius, { min: 0.5, max: 8, step: 0.5, format: unit('格') }, (v) => (e.radius = v)),
        info('据点', `${e.points.length} 处`, { hint: '圈依次换位置，每处分到一样长' }),
      ]
    case 'coins':
      return [num('金币', e.count, { min: 1, max: 500, step: 1, format: unit('枚') }, (v) => (e.count = v), { hint: '捡到这么多金币就达成' })]
    case 'downs':
      return [num('倒下次数', e.count, { min: 1, max: 20, step: 1, format: unit('次') }, (v) => (e.count = v), { hint: '队员累计倒下这么多次就输' })]
    case 'event':
    case 'gauge':
    case 'visit':
    case 'leak':
      return [info(endText(e), undefined, { hint: '编辑器还写不了这种读地图信号的结束规则' })]
  }
}

/** 选中的一项摊开的参数与操作：改动直接写进草稿 */
export function inspect(d: Draft, node: Node): Row[] {
  const t = node.target
  switch (t.kind) {
    case 'run':
      return runRows(d)
    case 'team':
      return teamRows(d)
    case 'rules':
      return rulesRows(d)
    case 'curve':
      return curveRows(d)
    case 'step':
      return stepRows(t, node)
    case 'phase':
      return phaseRows(t, node)
    case 'spawn':
      return spawnRows(t, node)
    case 'squad':
      return [...squadRows(t.squad, MAPS[t.stage.map]), heading('这一组'), listActions(t.list, t.index, node, '这一组')]
    case 'end':
      return [...endOwnRows(t.end), heading('这一条'), listActions(t.list, t.index, node, '这一条')]
  }
}
