import { CHARACTERS, ROSTER_IDS, TEAM } from '../data/characters'
import { MAX_CHAR_LEVEL } from '../data/charLevel'
import { CURVE, ENEMY_DEFS } from '../data/enemies'
import { HAZARD_NAMES, MAP_IDS, MAPS } from '../data/maps'
import type { Path } from '../data/runCheck'
import { signalsOf } from '../data/signals'
import { TAG_IDS, TAGS } from '../data/tags'
import { XP } from '../data/waves'
import { emojiIdOf, emojiTextOf } from '../emoji/textures'
import type { CharacterTag } from '../types/characters'
import type { MapCue } from '../data/signals'
import type { MapId } from '../types/maps'
import type { BatchRule, CueRule, FightDef, FightReward, FightRules, PhaseDef, RunDef, RunRules, StarRule, StepDef, StreamRule, TeamDef, TeamLevelDef, WavesRule } from '../types/runs'
import type { DifficultyCurve } from '../types/waves'
import { keysOf } from '../util/record'
import { defaultTeam } from './draft'
import type { Draft, Fight, Mutable, Phase, Step, Waves } from './draft'
import { endRows, signalPick } from './ends'
import { atRows, mixRows, squadEach, traitEach, waveSquadRows } from './groups'
import { END_KINDS, ICON, newCue, SPAWN_KINDS, STAR_KINDS } from './kinds'
import { modsRows } from './mods'
import type { Node, Target } from './outline'
import {
  actions,
  bannerRows,
  field,
  flag,
  heading,
  info,
  listActions,
  moment,
  msNum,
  num,
  optional,
  pct,
  pick,
  put,
  rowsOf,
  sec,
  text,
  times,
  unit,
} from './rows'
import type { Each, Option, Row } from './rows'

export type { Action, Field, Option, Row, Tool } from './rows'

const cell = unit('格')

/** 新的阶段：接着上一个阶段的配比，一直刷，撑过一分钟 */
function newPhase(from: Phase | undefined): Phase {
  return { mix: structuredClone(from?.mix ?? [{ kind: ENEMY_DEFS[0]!.kind, weight: 1 }]), spawns: [{ kind: 'stream' }], ends: [{ kind: 'time', ms: 60_000 }] }
}

/** 新的一场：章节里打在这一章的图上，别处接着上一场的地图；各场都定了难度时钟就排在上一场之后一分钟 */
function newFight(d: Draft): Step {
  const fights = d.steps.flatMap((s) => (s.kind === 'fight' ? [s.fight] : []))
  const last = fights.at(-1)
  const clock = last?.clockSec !== undefined && fights.every((f) => f.clockSec !== undefined) ? { clockSec: last.clockSec + 60 } : {}
  return { kind: 'fight', fight: { name: `第 ${fights.length + 1} 场`, map: d.chapter ?? last?.map ?? MAP_IDS[0]!, phases: [newPhase(last?.phases.at(-1))], ...clock } }
}

/** 新的招募：比眼下最多的人数再多一人 */
function newRecruit(d: Draft): Step {
  const most = Math.max(0, ...d.steps.map((s) => (s.kind === 'recruit' ? s.upTo : 0)))
  return { kind: 'recruit', upTo: Math.min(TEAM.maxSize, most + 1) }
}

/** 这一局是哪张图的一章：选了就把各场都挪到这张图上 */
function chapterRow(d: Draft): Row {
  const set = (map: MapId | undefined): void => {
    put(d, 'chapter', map)
    if (map) for (const s of d.steps) if (s.kind === 'fight') s.fight.map = map
  }
  const options: Option[] = [
    { emoji: ICON.none, label: '不是章节', chosen: d.chapter === undefined, run: () => set(undefined) },
    ...MAP_IDS.map((id): Option => ({ emoji: MAPS[id].emoji, label: MAPS[id].name, chosen: d.chapter === id, run: () => set(id) })),
  ]
  return pick('章节', d.chapter ? `${MAPS[d.chapter].name}的一章` : '不是章节', '选这一章的地图', options, {
    icon: d.chapter ? MAPS[d.chapter].emoji : ICON.chapter,
    hint: '冒险里的一章：各场都打在这张图上，每逛完一次商店换一片新生成的场地',
  })
}

function runRows(d: Draft): Row[] {
  const fights = d.steps.filter((s) => s.kind === 'fight').length
  const next: Path = ['steps', d.steps.length]
  return rowsOf<RunDef>({
    emoji: [
      text('图标', emojiTextOf(d.emoji), (t) => (d.emoji = emojiIdOf(t)!), {
        icon: d.emoji,
        hint: '输入或粘贴一个 emoji',
        check: (t) => (emojiIdOf(t) === undefined ? '要恰好一个有图的 emoji' : undefined),
        shown: '',
      }),
    ],
    name: [text('名字', d.name, (t) => (d.name = t))],
    desc: [text('简介', d.desc, (t) => (d.desc = t), { lines: 4 })],
    note: [text('设计备注', d.note ?? '', (t) => put(d, 'note', t === '' ? undefined : t), { lines: 3, check: () => undefined })],
    chapter: [chapterRow(d)],
    team: [],
    rules: [],
    teamLevel: [],
    curve: [],
    stars: [],
    coins: [num('开局金币', d.coins ?? 0, { min: 0, max: 500, step: 10, format: unit('金币'), whole: true }, (v) => put(d, 'coins', v > 0 ? v : undefined))],
    steps: [
      heading('加一步'),
      actions([
        { kind: 'do', label: '+ 招募', role: 'add', run: () => d.steps.push(newRecruit(d)), select: next },
        { kind: 'do', label: '+ 商店', role: 'add', run: () => d.steps.push({ kind: 'shop', tier: fights + 1 }), select: next },
        { kind: 'do', label: '+ 战斗', role: 'add', run: () => d.steps.push(newFight(d)), select: next },
      ]),
    ],
  })
}

const tagsText = (tags: readonly CharacterTag[]): string => tags.map((t) => TAGS[t].name).join('、')

function teamRows(d: Draft): Row[] {
  const team = d.team === 'knobs' ? undefined : d.team
  const rows = [flag('预设队伍', team !== undefined, (on) => put(d, 'team', on ? (defaultTeam() ?? { slots: [ROSTER_IDS[0]!] }) : undefined), { hint: '开局就按它组队、满血开打；不预设就靠招募步骤组建' })]
  if (!team) return rows
  const slots = team.slots
  const slotRows = slots.flatMap((s, i): Row[] => {
    const tools = [...(i > 0 ? [{ icon: ICON.leader, run: () => slots.unshift(...slots.splice(i, 1)) }] : []), { icon: ICON.remove, run: () => slots.splice(i, 1) }]
    const lead = i === 0 ? '队长' : undefined
    if (typeof s === 'string') return [info(CHARACTERS[s].name, lead, { icon: CHARACTERS[s].emoji, outline: 'player', tools })]
    const flip = (t: CharacterTag): void => {
      if (!s.tags.includes(t)) s.tags.push(t)
      else if (s.tags.length > 1) s.tags = s.tags.filter((x) => x !== t)
    }
    const options = TAG_IDS.map((t): Option => ({ emoji: TAGS[t].icon, label: TAGS[t].name, chosen: s.tags.includes(t), run: () => flip(t) }))
    return [info(`随机一名${tagsText(s.tags)}`, lead, { icon: ICON.random, tools }), pick('标签', tagsText(s.tags), '点一个标签加上或去掉', options, { sub: true, hint: '从同时带着这些标签的角色里随机一名' })]
  })
  const free = ROSTER_IDS.filter((id) => !slots.includes(id))
  const full = slots.length >= TEAM.maxSize
  return [
    ...rows,
    ...rowsOf<TeamDef>({
      slots: [
        ...slotRows,
        actions([
          { kind: 'menu', label: '+ 队员', role: 'add', enabled: !full, title: '加一名队员', options: free.map((id): Option => ({ emoji: CHARACTERS[id].emoji, outline: 'player', label: CHARACTERS[id].name, run: () => slots.push(id) })) },
          { kind: 'menu', label: '+ 随机一名', role: 'add', enabled: !full, title: '从带着这个标签的角色里随机', options: TAG_IDS.map((t): Option => ({ emoji: TAGS[t].icon, label: TAGS[t].name, run: () => slots.push({ tags: [t] }) })) },
        ]),
      ],
      level: [num('等级下限', team.level ?? 1, { min: 1, max: MAX_CHAR_LEVEL, step: 1, format: unit('级'), whole: true }, (v) => put(team, 'level', v > 1 ? v : undefined), { hint: '队员不到这一级时按这一级算' })],
    }),
  ]
}

/** 一个开关：一局里只分开与关，一场里多一个照这一局 */
function toggle(label: string, value: boolean | undefined, set: (v: boolean | undefined) => void, normal: boolean, inFight: boolean, hint?: string): Row {
  if (!inFight) return flag(label, value ?? normal, (on) => set(on === normal ? undefined : on), { hint })
  return field({
    kind: 'choice',
    label,
    hint,
    options: [
      { label: '照这一局', chosen: value === undefined, run: () => set(undefined) },
      { label: '是', chosen: value === true, run: () => set(true) },
      { label: '否', chosen: value === false, run: () => set(false) },
    ],
  })
}

/** 我方规则：写在一局上对每一场生效，写在一场上只管这一场、盖过一局写的；改空了就整份去掉 */
function rulesEach(owner: { rules?: Mutable<FightRules> }, inFight: boolean): Each<FightRules> {
  const r: Mutable<FightRules> = owner.rules ?? {}
  const change = (f: (r: Mutable<FightRules>) => void): void => {
    const w = (owner.rules ??= {})
    f(w)
    if (w.leader && keysOf(w.leader).length === 0) delete w.leader
    if (keysOf(w).length === 0) delete owner.rules
  }
  const leader = (f: (l: NonNullable<Mutable<FightRules>['leader']>) => void): void => change((w) => f((w.leader ??= {})))
  const sameAsRun = inFight ? '；不开就照这一局' : ''
  return {
    rescue: optional('队长扶起倒下的队员', r.rescue, () => ({ ms: 2_000, radius: 1.2 }), (v) => change((w) => put(w, 'rescue', v)), (v) => [
      msNum('站满', v.ms, { min: 0.5, max: 10, step: 0.5, format: sec }, (x) => (v.ms = x), { sub: true }),
      num('离他多近', v.radius, { min: 0.5, max: 3, step: 0.05, format: cell }, (x) => (v.radius = x), { sub: true }),
    ], { hint: `队长在倒下的队员身边站满一段时间${sameAsRun}` }),
    leader: [
      toggle('不能换队长', r.leader?.lock, (v) => leader((l) => put(l, 'lock', v)), false, inFight),
      toggle('队长倒下就输', r.leader?.critical, (v) => leader((l) => put(l, 'critical', v)), false, inFight),
      ...optional('换队长冷却', r.leader?.switchCdMs, () => 3_000, (v) => leader((l) => put(l, 'switchCdMs', v)), (v) => [
        msNum('冷却', v, { min: 0.5, max: 60, step: 0.5, format: sec }, (x) => leader((l) => (l.switchCdMs = x)), { sub: true }),
      ], { hint: `手动换一次队长后要等这么久${sameAsRun}` }),
    ],
    surprise: [toggle('敌人现身不打预兆', r.surprise, (v) => change((w) => put(w, 'surprise', v)), false, inFight)],
    skills: [toggle('能放主动技能', r.skills, (v) => change((w) => put(w, 'skills', v)), true, inFight)],
    vision: optional('限定视野', r.vision, () => 6, (v) => change((w) => put(w, 'vision', v)), (v) => [
      num('视野', v, { min: 1, max: 20, step: 0.5, format: cell }, (x) => change((w) => (w.vision = x)), { sub: true }),
    ], { hint: `只看得见队长身边这么远，外面一片漆黑${sameAsRun}` }),
    harmless: [toggle('伤不了敌人', r.harmless, (v) => change((w) => put(w, 'harmless', v)), false, inFight, '出手照样命中、击退与控制照常，只是不掉血，敌人只能死于地图上的危害')],
    relay: optional('自动轮换队长', r.relay, () => 10_000, (v) => change((w) => put(w, 'relay', v)), (v) => [
      msNum('每隔', v, { min: 1, max: 120, step: 1, format: sec }, (x) => change((w) => (w.relay = x)), { sub: true }),
    ], { hint: `每隔一段时间把队长交给名单上的下一名活着的队员${sameAsRun}` }),
    mods: modsRows('给队伍的修正', r.mods, (m) => change((w) => put(w, 'mods', m)), inFight ? '只管这一场，和一局写的叠加' : '每一场都生效，商店里也算'),
  }
}

function rulesRows(d: Draft): Row[] {
  const lives = d.rules?.lives
  const setLives = (v: number | undefined): void => {
    const w: Mutable<RunRules> = (d.rules ??= {})
    put(w, 'lives', v)
    if (keysOf(w).length === 0) delete d.rules
  }
  return rowsOf<RunRules>({
    lives: optional('限定命数', lives, () => 3, setLives, (v) => [num('命数', v, { min: 1, max: 9, step: 1, format: unit('次'), whole: true }, setLives, { sub: true })], {
      hint: '全队一共能起来几次：被扶起来、被技能救起来都算',
    }),
    ...rulesEach(d, false),
  })
}

function teamLevelRows(d: Draft): Row[] {
  return optional('全队升级', d.teamLevel, () => ({ ...XP }), (v) => put(d, 'teamLevel', v), (t) =>
    rowsOf<TeamLevelDef>({
      first: [num('第一次要的经验', t.first, { min: 1, max: 500, step: 1, format: String, whole: true }, (v) => (t.first = v), { sub: true })],
      ratio: [num('后期倍数', t.ratio, { min: 1, max: 20, step: 0.5, format: times }, (v) => (t.ratio = v), { sub: true, hint: '后期每级要的经验是第一次的几倍' })],
      k: [num('过渡快慢', t.k, { min: 0.5, max: 20, step: 0.5, format: String }, (v) => (t.k = v), { sub: true, hint: '越小越快从前期过渡到后期' })],
    }),
  { hint: '击杀攒全队经验，每升一级掉一个升级道具：给场上一人升一级，或让一人满生命上场' })
}

function curveRows(d: Draft): Row[] {
  const c = d.curve
  return optional('自定义难度曲线', c, () => ({ ...CURVE }), (v) => put(d, 'curve', v), (c) =>
    rowsOf<DifficultyCurve>({
      hpGrowthPerMin: [num('血量增长', c.hpGrowthPerMin, { min: 0, max: 3, step: 0.05, format: (v) => `每分钟 +${pct(v)}` }, (v) => (c.hpGrowthPerMin = v))],
      startIntervalMs: [num('起始刷怪间隔', c.startIntervalMs, { min: 20, max: 3_000, step: 10, format: unit('毫秒') }, (v) => (c.startIntervalMs = v))],
      minIntervalMs: [num('最短刷怪间隔', c.minIntervalMs, { min: 10, max: 1_000, step: 5, format: unit('毫秒') }, (v) => (c.minIntervalMs = v))],
      rampSeconds: [num('收紧用时', c.rampSeconds, { min: 10, max: 1_800, step: 10, format: sec }, (v) => (c.rampSeconds = v), { hint: '刷怪间隔在这段时间里从起始收紧到最短' })],
      teamFactorBase: [num('人数系数', c.teamFactorBase, { min: 0.05, max: 2, step: 0.01, format: (v) => `${v}` }, (v) => (c.teamFactorBase = v), { hint: '刷怪间隔再除以 系数 + 每人 × 队伍人数' })],
      teamFactorPerMember: [num('每人', c.teamFactorPerMember, { min: 0, max: 1, step: 0.01, format: (v) => `${v}` }, (v) => (c.teamFactorPerMember = v), { sub: true })],
      coinDropChanceMin: [num('掉币几率下限', c.coinDropChanceMin, { min: 0, max: 1, step: 0.05, format: pct }, (v) => (c.coinDropChanceMin = v))],
      coinDropChanceHalfLifeSec: [num('掉币几率衰减', c.coinDropChanceHalfLifeSec, { min: 10, max: 1_800, step: 10, format: sec }, (v) => (c.coinDropChanceHalfLifeSec = v), { hint: '越短，击杀掉金币的几率降得越快' })],
    }),
  { hint: '敌人血量、刷怪间隔与掉币几率都跟着难度时钟走；不自定义就按默认的一条' })
}

type Star<K extends StarRule['kind']> = Extract<StarRule, { kind: K }>

/** 一条星级条件自己的参数 */
function starParams(s: Mutable<StarRule>): Row[] {
  const tally = (label: string, value: number, set: (v: number) => void, min: number, max: number, u: string): Row => num(label, value, { min, max, step: 1, format: unit(u), whole: true }, set, { sub: true })
  switch (s.kind) {
    case 'downs':
    case 'switches':
    case 'skills':
      return rowsOf<Star<'downs' | 'switches' | 'skills'>>({ kind: [], count: [tally('次数', s.count, (v) => (s.count = v), 0, 50, '次')] })
    case 'kills':
      return rowsOf<Star<'kills'>>({ kind: [], count: [tally('击杀', s.count, (v) => (s.count = v), 1, 2_000, '只')] })
    case 'time':
      return rowsOf<Star<'time'>>({ kind: [], ms: [msNum('用时', s.ms, { min: 5, max: 1_800, step: 5, format: sec }, (v) => (s.ms = v), { sub: true })] })
    case 'hazard': {
      const options = keysOf(HAZARD_NAMES).map((h): Option => ({ emoji: ICON.hazard, label: HAZARD_NAMES[h], chosen: s.by === h, run: () => (s.by = h) }))
      return rowsOf<Star<'hazard'>>({
        kind: [],
        by: [pick('危害', HAZARD_NAMES[s.by], '选危害', options, { icon: ICON.hazard, sub: true })],
        damage: [num('伤害', s.damage, { min: 0, max: 5_000, step: 10, format: String }, (v) => (s.damage = v), { sub: true, hint: '全队受到这种危害的伤害不超过这么多' })],
      })
    }
  }
}

function starRows(d: Draft): Row[] {
  return optional<NonNullable<Draft['stars']>>('评星', d.stars, () => [STAR_KINDS.downs.make(), STAR_KINDS.time.make()], (v) => put(d, 'stars', v), (stars) =>
    stars.flatMap((s, i) => {
      const options = keysOf(STAR_KINDS).map((k): Option => ({ emoji: STAR_KINDS[k].icon, label: STAR_KINDS[k].name, chosen: s.kind === k, run: () => (stars[i] = s.kind === k ? s : STAR_KINDS[k].make()) }))
      return [heading(`第 ${i + 1} 条`), pick('条件', STAR_KINDS[s.kind].name, '选星级条件', options, { icon: STAR_KINDS[s.kind].icon }), ...starParams(s)]
    }),
  { hint: '赢下得一星，两条条件各再得一星' })
}

function stepRows(t: Extract<Target, { kind: 'step' }>, node: Node, d: Draft): Row[] {
  const s = t.step
  const own = ((): Row[] => {
    switch (s.kind) {
      case 'recruit':
        return rowsOf<Extract<StepDef, { kind: 'recruit' }>>({ kind: [], upTo: [num('招募到', s.upTo, { min: 1, max: TEAM.maxSize, step: 1, format: unit('人'), whole: true }, (v) => (s.upTo = v), { hint: '队伍不到这么多人就进招募页补上' })] })
      case 'shop':
        return rowsOf<Extract<StepDef, { kind: 'shop' }>>({ kind: [], tier: [num('物价档位', s.tier, { min: 1, max: 30, step: 1, format: (v) => `第 ${v} 档`, whole: true }, (v) => (s.tier = v), { hint: '物价与稀有度按第几波算' })] })
      case 'fight':
        return rowsOf<Extract<StepDef, { kind: 'fight' }>>({ kind: [], fight: fightRows(s.fight, node, d) })
    }
  })()
  return [...own, heading('这一步'), listActions(t.list, t.index, node, '这一步')]
}

function fightRows(f: Fight, node: Node, d: Draft): Row[] {
  const map = MAPS[f.map]
  const reward = f.reward
  const setReward = (v: number): void => {
    put((f.reward ??= {}), 'coins', v > 0 ? v : undefined)
    if (keysOf(f.reward).length === 0) delete f.reward
  }
  return rowsOf<FightDef>({
    name: [text('名字', f.name, (t) => (f.name = t))],
    map: [
      d.chapter
        ? info('地图', map.name, { icon: map.emoji, hint: '这一章的各场都打在这张图上' })
        : pick('地图', map.name, '选地图', MAP_IDS.map((id): Option => ({ emoji: MAPS[id].emoji, label: MAPS[id].name, chosen: id === f.map, run: () => (f.map = id) })), { icon: map.emoji }),
    ],
    clockSec: optional('定难度时钟', f.clockSec, () => 0, (v) => put(f, 'clockSec', v), (v) => [num('难度时钟', v, { min: 0, max: 1_800, step: 10, format: moment }, (x) => (f.clockSec = x), { sub: true })], {
      hint: '开打时难度时钟从第几秒走起；不定就接着这一局累计打过的时长',
    }),
    chaseLeader: [flag('敌人都盯着队长', f.chaseLeader === true, (on) => put(f, 'chaseLeader', on || undefined))],
    reward: rowsOf<FightReward>({ coins: [num('过关金币', reward?.coins ?? 0, { min: 0, max: 300, step: 5, format: unit('金币'), whole: true }, setReward)] }),
    enemyMods: modsRows('敌人修正', f.enemyMods, (m) => put(f, 'enemyMods', m), '给这一场所有的敌人'),
    rules: [],
    phases: [heading('阶段'), actions([{ kind: 'do', label: '+ 阶段', role: 'add', run: () => f.phases.push(newPhase(f.phases.at(-1))), select: [...node.at, 'fight', 'phases', f.phases.length] }])],
  })
}

function phaseRows(t: Extract<Target, { kind: 'phase' }>, node: Node): Row[] {
  const p = t.phase
  const map = t.fight.map
  const ends = keysOf(END_KINDS).flatMap((k): Option[] => {
    const made = END_KINDS[k].make(map)
    return made ? [{ emoji: END_KINDS[k].icon, label: END_KINDS[k].name, run: () => p.ends.push(made), select: [...node.at, 'ends', p.ends.length] }] : []
  })
  const cue = newCue(map)
  return rowsOf<PhaseDef>({
    intro: bannerRows('开场横幅', p.intro, (b) => put(p, 'intro', b), '这一阶段开始时打出'),
    mix: [
      heading('配比'),
      ...(p.mix ? [] : [info('还没有配比', undefined, { hint: '没指定敌人的刷怪都按配比抽' })]),
      ...mixRows(p.mix, () => (p.mix ??= []), () => delete p.mix, false),
    ],
    need: [heading('刷怪与结束'), flag('结束规则全部达成才算', p.need === 'all', (on) => put(p, 'need', on ? 'all' : undefined), { hint: '不开的话，达成任意一条就算' })],
    spawns: [],
    cues: [],
    ends: [
      actions([
        { kind: 'menu', label: '+ 刷怪', role: 'add', title: '加一条刷怪', options: keysOf(SPAWN_KINDS).map((k): Option => ({ emoji: SPAWN_KINDS[k].icon, label: SPAWN_KINDS[k].name, run: () => p.spawns.push(SPAWN_KINDS[k].make(map)!), select: [...node.at, 'spawns', p.spawns.length] })) },
        { kind: 'menu', label: '+ 结束规则', role: 'add', title: '加一条结束规则', options: ends },
        ...(cue ? [{ kind: 'do' as const, label: '+ 地图指令', role: 'add' as const, run: () => (p.cues ??= []).push({ ...cue }), select: [...node.at, 'cues', p.cues?.length ?? 0] }] : []),
      ]),
    ],
  }).concat([heading('这一阶段'), listActions(t.list, t.index, node, '这一阶段')])
}

/** 间隔：按难度曲线算再乘倍率，或固定的时长（可以渐变） */
function intervalRows(s: Mutable<StreamRule>): Row[] {
  const fixed = s.intervalMs !== undefined
  return [
    field({
      kind: 'choice',
      label: '间隔',
      hint: fixed ? '每隔固定的时长放一只' : '按这一局的难度曲线、队伍人数与昼夜算',
      options: [
        {
          label: '按曲线',
          chosen: !fixed,
          run: () => {
            delete s.intervalMs
            delete s.ramp
          },
        },
        {
          label: '固定',
          chosen: fixed,
          run: () => {
            s.intervalMs = 1_000
            delete s.intervalMul
          },
        },
      ],
    }),
    s.intervalMs === undefined
      ? num('间隔倍率', s.intervalMul ?? 1, { min: 0.25, max: 4, step: 0.05, format: times }, (v) => put(s, 'intervalMul', v === 1 ? undefined : v), { sub: true, hint: '乘在按曲线算出的间隔上' })
      : msNum('每只间隔', s.intervalMs, { min: 0.05, max: 10, step: 0.05, format: sec }, (v) => (s.intervalMs = v), { sub: true }),
  ]
}

function streamRows(s: Mutable<StreamRule>, map: MapId, phaseMix: PhaseDef['mix']): Row[] {
  const t = traitEach(s, map, phaseMix, false)
  const intervalMs = s.intervalMs
  return rowsOf<StreamRule>({
    kind: [],
    enemy: t.enemy,
    mix: t.mix,
    at: atRows(s, map),
    intervalMs: intervalRows(s),
    intervalMul: [],
    ramp:
      intervalMs === undefined
        ? []
        : optional('间隔渐变', s.ramp, () => ({ toMs: Math.max(50, Math.round(intervalMs / 2)), overMs: 60_000 }), (v) => put(s, 'ramp', v), (r) => [
            msNum('变到', r.toMs, { min: 0.05, max: 10, step: 0.05, format: sec }, (v) => (r.toMs = v), { sub: true }),
            msNum('用时', r.overMs, { min: 1, max: 600, step: 1, format: sec }, (v) => (r.overMs = v), { sub: true, hint: '间隔在这段时间里匀速变到目标' }),
          ]),
    fromMs: [msNum('开始', s.fromMs ?? 0, { min: 0, max: 600, step: 1, format: moment }, (v) => put(s, 'fromMs', v > 0 ? v : undefined), { hint: '这一阶段开始后第几秒起刷' })],
    untilMs: optional('到点停', s.untilMs, () => (s.fromMs ?? 0) + 60_000, (v) => put(s, 'untilMs', v), (v) => [msNum('停在', v, { min: 1, max: 900, step: 1, format: moment }, (x) => (s.untilMs = x), { sub: true })]),
    total: optional('限总数', s.total, () => 50, (v) => put(s, 'total', v), (v) => [num('总数', v, { min: 1, max: 500, step: 1, format: unit('只'), whole: true }, (x) => (s.total = x), { sub: true })], { hint: '放满这么多只就停' }),
    cap: optional('场上上限', s.cap, () => 100, (v) => put(s, 'cap', v), (v) => [num('上限', v, { min: 1, max: 400, step: 1, format: unit('只'), whole: true }, (x) => (s.cap = x), { sub: true })], { hint: '场上敌人到这么多就先不刷' }),
    drive: t.drive,
    eliteChance: t.eliteChance,
    huntLeader: t.huntLeader,
    loot: t.loot,
    carry: t.carry,
    stats: t.stats,
  })
}

function batchRows(s: Mutable<BatchRule>, map: MapId, phaseMix: PhaseDef['mix']): Row[] {
  const events = signalsOf(MAPS[map].kind, 'events')
  const repeat = s.every !== undefined || s.on !== undefined
  return rowsOf<BatchRule>({
    kind: [],
    on:
      events.length > 0 || s.on !== undefined
        ? optional('按地图事件放出', s.on, () => events[0] as BatchRule['on'], (v) => {
            put(s, 'on', v)
            delete s.every
            delete s.times
          }, (v) => [signalPick('哪件事', map, 'events', v!, (x) => (s.on = x as BatchRule['on']))], { hint: '每当地图上发生一次这件事，过一会儿放出一队' })
        : [],
    atMs: [msNum('登场', s.atMs, { min: 0, max: 600, step: 0.5, format: moment }, (v) => (s.atMs = v), { hint: s.on ? '事件发生后第几秒放出' : '这一阶段开始后第几秒放出' })],
    every: s.on
      ? []
      : optional('一再放出', s.every, () => 30_000, (v) => {
          put(s, 'every', v)
          if (v === undefined) delete s.times
        }, (v) => [msNum('每隔', v, { min: 1, max: 300, step: 1, format: sec }, (x) => (s.every = x), { sub: true })]),
    times: repeat
      ? optional('限次数', s.times, () => 3, (v) => put(s, 'times', v), (v) => [num('一共', v, { min: 1, max: 50, step: 1, format: unit('队'), whole: true }, (x) => (s.times = x), { sub: true })], { sub: true, hint: '不限就一直放到这一阶段结束' })
      : [],
    banner: bannerRows('横幅', s.banner, (b) => put(s, 'banner', b), '第一队登场时打出'),
    squad: [heading('这一队'), ...rowsOf(squadEach(s.squad, map, phaseMix))],
  })
}

function wavesRows(s: Waves, node: Node): Row[] {
  return rowsOf<WavesRule>({
    kind: [],
    atMs: [msNum('首组登场', s.atMs, { min: 0, max: 600, step: 0.5, format: moment }, (v) => (s.atMs = v), { hint: '这一阶段开始后第几秒来第一组' })],
    gapMs: [msNum('组间隔', s.gapMs, { min: 0, max: 30, step: 0.5, format: sec }, (v) => (s.gapMs = v), { hint: '场上清空后再隔这么久来下一组' })],
    squads: [
      info('一共', `${s.squads.length} 组`, { hint: '在导航里选中一组来调它' }),
      actions([{ kind: 'do', label: '+ 一组', role: 'add', run: () => s.squads.push({ count: s.squads.at(-1)?.count ?? 6 }), select: [...node.at, 'squads', s.squads.length] }]),
    ],
  })
}

function spawnRows(t: Extract<Target, { kind: 'spawn' }>, node: Node): Row[] {
  const s = t.spawn
  const map = t.fight.map
  const own = s.kind === 'stream' ? streamRows(s, map, t.phase.mix) : s.kind === 'batch' ? batchRows(s, map, t.phase.mix) : wavesRows(s, node)
  return [...own, heading('这一条'), listActions(t.list, t.index, node, '这一条')]
}

function cueRows(t: Extract<Target, { kind: 'cue' }>, node: Node): Row[] {
  const c = t.cue
  return [
    ...rowsOf<CueRule>({
      cue: [signalPick('指令', t.fight.map, 'cues', c.cue, (v) => (c.cue = v as MapCue))],
      atMs: [msNum('第一次', c.atMs, { min: 0, max: 600, step: 0.5, format: moment }, (v) => (c.atMs = v), { hint: '这一阶段开始后第几秒' })],
      every: optional('一再下令', c.every, () => 20_000, (v) => {
        put(c, 'every', v)
        if (v === undefined) delete c.times
      }, (v) => [msNum('每隔', v, { min: 1, max: 300, step: 1, format: sec }, (x) => (c.every = x), { sub: true })]),
      times:
        c.every === undefined
          ? []
          : optional('限次数', c.times, () => 3, (v) => put(c, 'times', v), (v) => [num('一共', v, { min: 1, max: 50, step: 1, format: unit('次'), whole: true }, (x) => (c.times = x), { sub: true })], { sub: true, hint: '不限就一直做到这一阶段结束' }),
    }),
    heading('这一条'),
    listActions(t.list, t.index, node, '这一条', () => delete t.phase.cues),
  ]
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
    case 'teamLevel':
      return teamLevelRows(d)
    case 'curve':
      return curveRows(d)
    case 'stars':
      return starRows(d)
    case 'step':
      return stepRows(t, node, d)
    case 'fightRules':
      return rowsOf(rulesEach(t.fight, true))
    case 'phase':
      return phaseRows(t, node)
    case 'spawn':
      return spawnRows(t, node)
    case 'squad':
      return [...waveSquadRows(t.squad, t.fight.map, t.phase.mix), heading('这一组'), listActions(t.list, t.index, node, '这一组')]
    case 'cue':
      return cueRows(t, node)
    case 'end':
      return [...endRows(t.end, t.fight.map), heading('这一条'), listActions(t.list, t.index, node, '这一条')]
  }
}
