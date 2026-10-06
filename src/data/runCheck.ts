import type { Polarity } from '../types/battlefield'
import type { CharacterTag } from '../types/characters'
import type { EnemyDef, EnemyKind } from '../types/enemies'
import type { ItemRarity } from '../types/items'
import type { FightDef, FightRules, GroupTraits, LegacyPhaseDef, LegacySquad, LevelPick, MixEntry, RepeatDef, Rounds, RunDef, SpawnAt, StarRule, StepDef, TeamDef } from '../types/runs'
import type { DifficultyCurve } from '../types/waves'
// 构建脚本也跑这些检查，本地模块写全扩展名
import { cycleOf, roundPicks, roundsOf } from './rounds.ts'

/** 定义里的位置：一层层的属性名与下标 */
export type Path = readonly (string | number)[]

/** 查出的一个问题：在哪，为什么 */
export interface Issue {
  readonly at: Path
  readonly why: string
}

/** 查关卡要用到的资料：构建期取自 defs，运行时取自生成的 assets */
export interface RunCatalog {
  readonly enemies: Readonly<Record<string, EnemyDef>>
  /** 地图：只看它的名字与有哪几种出怪口 */
  readonly maps: Readonly<Record<string, { readonly name: string; readonly gates?: { readonly kinds: Readonly<Record<string, unknown>> } }>>
  readonly pools: Readonly<Record<string, readonly { readonly polarity: Polarity }[]>>
  readonly characters: Readonly<Record<string, { readonly tags: readonly CharacterTag[] }>>
  readonly maxCharLevel: number
  /** 队伍的编制与体型：满编几人，队长与队员的体型倍率 */
  readonly team: { readonly maxSize: number; readonly leaderSizeMul: number; readonly followerSizeMul: number }
  /** 队员身体的半径 */
  readonly radius: number
  /** 队员跟在队长身后的距离 */
  readonly fanDistance: number
}

/** 一种敌人，连同它的巢穴生出的与死后分裂出的 */
export function withNested(e: EnemyDef): EnemyDef[] {
  return [e, ...(e.spawner ? withNested(e.spawner.into) : []), ...(e.onDeath ?? []).flatMap((fx) => (fx.kind === 'split' ? withNested(fx.into) : []))]
}

/** 位置里各层的说法；带下标的层写成第几个 */
const PLACES: Readonly<Record<string, (n: number | undefined) => string>> = {
  phases: (n) => `第 ${n} 阶段`,
  spawns: (n) => `第 ${n} 条刷怪`,
  ends: (n) => `第 ${n} 条结束规则`,
  squad: () => '这一队',
  squads: (n) => `第 ${n} 组`,
  escort: () => '护卫',
  mix: (n) => (n === undefined ? '配比' : `配比第 ${n} 项`),
  team: () => '队伍',
  slots: (n) => `第 ${n} 位`,
  rules: () => '我方规则',
  curve: () => '难度曲线',
  teamLevel: () => '全队升级',
  stars: (n) => `第 ${n} 条星级`,
}

/** 位置的说法：第几步、第几阶段、第几条规则……重复里的步骤说成每轮第几步；空位置是这一局本身 */
export function pathText(at: Path): string {
  const out: string[] = []
  let steps = 0
  for (let i = 0; i < at.length; i++) {
    const key = at[i]
    if (typeof key !== 'string') continue
    const next = at[i + 1]
    const n = typeof next === 'number' ? next + 1 : undefined
    if (key === 'steps') out.push(steps++ === 0 ? `第 ${n} 步` : `每轮第 ${n} 步`)
    else {
      const place = PLACES[key]
      if (place) out.push(place(n))
    }
  }
  return out.length > 0 ? out.join(' · ') : '这一局'
}

const inUnit = (x: number | undefined): boolean => x === undefined || (x >= 0 && x <= 1)

const RARITY_RANK: Record<ItemRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

/** 轮次条件的每一项都是正整数，起点不晚于终点 */
const roundsOk = (g: Rounds): boolean => [g.from, g.to, g.every].every((n) => n === undefined || (Number.isInteger(n) && n >= 1)) && (g.from ?? 1) <= (g.to ?? Infinity)

/** 一段重复要查的轮数：有限的查全部轮次，一直重复的查到每一种轮次组合都出现过；轮数或轮次写错了就不展开 */
const roundsToCheck = (s: RepeatDef): number => {
  if (!roundsOf(s).every(roundsOk)) return 0
  if (s.times === undefined) return cycleOf(s)
  return Number.isInteger(s.times) && s.times >= 1 ? s.times : 0
}

/** 按一份资料查关卡的几样检查，各自返回查出的问题 */
export interface RunChecks {
  /** 一局 */
  readonly run: (def: RunDef) => Issue[]
  /** 一份我方规则 */
  readonly rules: (r: FightRules | undefined) => Issue[]
  /** 一条难度曲线 */
  readonly curve: (c: DifficultyCurve) => Issue[]
}

export function runChecks(cat: RunCatalog): RunChecks {
  const teamSize = cat.team.maxSize
  /** 队长贴着倒下的队员站时两人中心的距离：身体互相挤开，靠不得更近 */
  const touch = cat.radius * (cat.team.leaderSizeMul + cat.team.followerSizeMul)
  /** 队员跟在队长身后时离队长中心最远的身体边缘：视野至少得罩住它 */
  const squadReach = cat.fanDistance + cat.radius * cat.team.followerSizeMul
  let sink: Issue[] = []
  const need = (ok: boolean, at: Path, why: string): void => {
    if (!ok) sink.push({ at, why })
  }
  /** 单独收下这一段检查查出的问题 */
  const collect = (check: () => void): Issue[] => {
    const outer = sink
    sink = []
    check()
    const found = sink
    sink = outer
    return found
  }

  const isBoss = (kind: EnemyKind | undefined): boolean => kind !== undefined && cat.enemies[kind]?.role === 'boss'

  /** 配比：不为空，引用非头目的敌人，权重为正 */
  const checkMix = (mix: readonly MixEntry[], path: Path): void => {
    need(mix.length > 0, path, '配比不能为空')
    mix.forEach((m, i) => need(cat.enemies[m.kind] !== undefined && !isBoss(m.kind) && m.weight > 0, [...path, i], `配比须引用非头目的敌人、权重为正：${m.kind}`))
  }

  /** 查一批敌人时的上下文：在哪张图上打（一场、一局都没写是 undefined），这一场是不是按阶段写的，这一阶段的配比 */
  type Where = { readonly map: string | undefined; readonly staged: boolean; readonly mix: readonly MixEntry[] | undefined }

  /** 站位的距离与散开范围；指定出怪口的，这一场得定下地图、那张图有这种出怪口 */
  const checkAt = (at: SpawnAt | undefined, where: Where, path: Path): void => {
    if (at?.kind === 'ring' || at?.kind === 'behind') need(at.dist > 0, path, '站位距离须为正')
    if (at?.kind === 'point') need((at.spread ?? 0) >= 0, path, '散开范围不为负')
    if (at?.kind !== 'gate') return
    if (where.map === undefined) {
      need(false, path, '指定出怪口的一场须定下地图')
      return
    }
    need(cat.maps[where.map]?.gates?.kinds[at.gate] !== undefined, path, `${where.map} 没有这种出怪口：${at.gate}`)
  }

  /** 一批敌人的特征：指定的敌人存在，指定了就不再写配比；按阶段写的一场里没指定敌人的得有配比可抽；换走法须指定敌人；几率与倍率在范围内；要带的效果这张图的效果池里有 */
  const checkTraits = (t: GroupTraits, where: Where, path: Path): void => {
    need(t.enemy === undefined || cat.enemies[t.enemy] !== undefined, path, `引用了不存在的敌人：${t.enemy}`)
    need(t.enemy === undefined || t.mix === undefined, path, '指定了敌人就不用再写配比')
    if (t.mix) checkMix(t.mix, [...path, 'mix'])
    need(!where.staged || t.enemy !== undefined || (t.mix ?? where.mix) !== undefined, path, '没指定敌人，这一批和这一阶段都没写配比')
    need(t.drive === undefined || t.enemy !== undefined, path, '换走法须指定敌人')
    need(inUnit(t.eliteChance), path, '精英几率须在 [0, 1] 内')
    need((t.stats?.mul?.maxHp ?? 1) > 0, path, '血量倍率须为正')
    need((t.loot?.xp ?? 0) >= 0 && (t.loot?.coins ?? 0) >= 0, path, '战利品倍率不为负')
    const pool = where.map === undefined ? undefined : cat.pools[where.map]
    need(t.carry === undefined || pool === undefined || pool.some((d) => d.polarity === t.carry), path, `要带的效果在 ${where.map} 的效果池里没有`)
  }

  /** 一队敌人：数量、精英、间隔与血量倍率在范围内，特征合规，护卫引用非头目的敌人 */
  const checkSquad = (sq: LegacySquad, where: Where, path: Path): void => {
    need(sq.count >= 1 && (sq.spreadMs ?? 0) >= 0, path, '一队敌人须至少一只，间隔不为负')
    need((sq.elites ?? 0) >= 0 && (sq.elites ?? 0) <= sq.count, path, '精英数须在 0 到这一队的只数之间')
    need((sq.hpMul ?? 1) > 0, path, '血量倍率须为正')
    checkTraits(sq, where, path)
    const e = sq.escort
    need(e === undefined || (cat.enemies[e.enemy] !== undefined && !isBoss(e.enemy) && e.count >= 1 && (e.stats?.mul?.maxHp ?? 1) > 0), [...path, 'escort'], '护卫须引用非头目的敌人、至少一只，血量倍率为正')
    checkAt(sq.at, where, path)
  }

  /** 这一阶段可能出现的敌人种类，连同巢穴生出的与死后分裂出的；有按地图抽的就说不准，是 null */
  const phaseKinds = (p: LegacyPhaseDef): Set<string> | null => {
    const out = new Set<string>()
    let open = false
    const kind = (k: EnemyKind): void => {
      const e = cat.enemies[k]
      if (e) for (const x of withNested(e)) out.add(x.kind)
    }
    const pool = (own: readonly MixEntry[] | undefined): void => {
      const rows = own ?? p.mix
      if (rows) for (const m of rows) kind(m.kind)
      else open = true
    }
    const group = (g: GroupTraits): void => (g.enemy ? kind(g.enemy) : pool(g.mix))
    for (const s of p.spawns) {
      if (s.kind === 'stream') group(s)
      else if (s.kind === 'batch' || s.kind === 'waves') {
        for (const sq of s.kind === 'batch' ? [s.squad] : s.squads) {
          group(sq)
          if (sq.escort) kind(sq.escort.enemy)
        }
      } else open = true
    }
    return open ? null : out
  }

  /** 我方规则：救援时长为正，救援范围大于队长贴着倒下队员的距离、小于队员跟在队长身后的距离（站着不动不会扶起来）；换队长的冷却为正；视野看得见跟在身后的队员 */
  const checkRules = (r: FightRules | undefined, path: Path): void => {
    need(r?.rescue === undefined || r.rescue.ms > 0, path, '救援时长须为正')
    need(r?.rescue === undefined || (r.rescue.radius > touch && r.rescue.radius < cat.fanDistance), path, `救援范围须在 ${touch} 到 ${cat.fanDistance} 格之间`)
    need((r?.leader?.switchCdMs ?? 1) > 0, path, '换队长冷却须为正')
    need((r?.vision ?? Infinity) > squadReach, path, `视野须大于 ${squadReach} 格，看得见跟在身后的队员`)
  }

  /** 星级条件：次数不为负，用时为正，击杀至少一只；剩下几次起来的机会须在命数以内 */
  const checkStar = (s: StarRule, lives: number | undefined, path: Path): void => {
    if (s.kind === 'time') need(s.ms > 0, path, '用时须为正')
    else if (s.kind === 'hazard') need(s.damage >= 0, path, '伤害不为负')
    else if (s.kind === 'kills' || s.kind === 'coins') need(s.count >= 1, path, '数目至少为 1')
    else if (s.kind === 'lives') need(lives !== undefined && s.count >= 1 && s.count <= lives, path, '要剩下起来的机会，须有命数且不超过它')
    else need(s.count >= 0, path, '次数不为负')
  }

  /**
   * 一个阶段：数值在范围内，结束规则都有着落——要打倒的头目得在这一阶段或这一场更早的阶段登场，悬赏目标与要数的那种敌人得在这一阶段出现，要清场就不能一直刷，一组一组来的后面几组要等场上清空，要全部达成的不能有到点就算达成的时限；只有最后一个阶段可以不结束。
   * 返回这一阶段有没有头目登场。
   */
  const checkPhase = (p: LegacyPhaseDef, last: boolean, bossBefore: boolean, where: Where, path: Path): boolean => {
    const at: Where = { ...where, mix: p.mix }
    const squads = p.spawns.flatMap((s) => (s.kind === 'batch' ? [s.squad] : s.kind === 'waves' ? s.squads : []))
    const endless = p.spawns.some(
      (s) => s.kind === 'knobs' || (s.kind === 'stream' && s.untilMs === undefined && s.total === undefined) || (s.kind === 'batch' && s.every !== undefined && s.times === undefined),
    )
    const boss = p.spawns.some((s) => s.kind === 'boss' || s.kind === 'knobs') || squads.some((sq) => isBoss(sq.enemy))
    if (p.mix) checkMix(p.mix, [...path, 'mix'])
    p.spawns.forEach((s, i) => {
      const sp = [...path, 'spawns', i]
      if (s.kind === 'stream') {
        need((s.intervalMul ?? 1) > 0 && (s.intervalMs ?? 1) > 0, sp, '连续刷怪间隔须为正')
        need(s.intervalMs === undefined || s.intervalMul === undefined, sp, '写了刷怪间隔就不用再写倍率')
        need(s.ramp === undefined || (s.intervalMs !== undefined && s.ramp.toMs > 0 && s.ramp.overMs > 0), sp, '间隔变化须有起始间隔，目标间隔与时长为正')
        need((s.fromMs ?? 0) >= 0 && (s.untilMs ?? Infinity) > (s.fromMs ?? 0), sp, '连续刷怪时段须从不早于这一阶段开始的时刻到更晚的时刻')
        need(s.total === undefined || (Number.isInteger(s.total) && s.total >= 1), sp, '连续刷怪总数须是正整数')
        need((s.cap ?? 1) >= 1, sp, '连续刷怪上限至少为 1')
        need(!isBoss(s.enemy), sp, '连续刷怪不能刷头目，头目按一队放出')
        checkTraits(s, at, sp)
        checkAt(s.at, at, sp)
      } else if (s.kind === 'batch') {
        need(s.atMs >= 0, sp, '一队敌人登场时刻不为负')
        need(s.every === undefined || s.every > 0, sp, '一再放出的间隔须为正')
        need(s.times === undefined || (Number.isInteger(s.times) && s.times >= 1 && (s.times === 1 || s.every !== undefined)), sp, '放出的次数须是正整数，多于一次要写间隔')
        checkSquad(s.squad, at, [...sp, 'squad'])
      } else if (s.kind === 'waves') {
        need(s.atMs >= 0 && s.gapMs >= 0 && s.squads.length > 0, sp, '成组敌人须至少一组，时刻与间隔不为负')
        need(s.squads.length === 1 || !endless, sp, '一直在刷怪时场上不会清空，成组的敌人只能有一组')
        s.squads.forEach((sq, k) => checkSquad(sq, at, [...sp, 'squads', k]))
      } else if (s.kind === 'boss') {
        need(s.atMs >= 0, sp, '头目登场时刻不为负')
      } else if (s.kind === 'carriers') {
        need(s.buff >= 0 && s.debuff >= 0 && s.atMs >= 0 && s.spanMs >= 0, sp, '带光圈敌人数与时刻不为负')
      }
    })
    need(p.ends.filter((e) => e.kind === 'time').length <= 1, path, '最多一条时限')
    need(p.ends.length > 0 || last, path, '不是最后一个阶段，须有结束规则')
    need(p.ends.length === 0 || p.ends.some((e) => e.kind !== 'downs' && !(e.kind === 'time' && e.lose)), path, '有结束规则就得有达成条件')
    need(p.need !== 'all' || !p.ends.some((e) => e.kind === 'time' && !e.lose), path, '要全部达成时，时限只能是到点就输的')
    const kinds = phaseKinds(p)
    p.ends.forEach((e, i) => {
      const ep = [...path, 'ends', i]
      if (e.kind === 'time') need(e.ms > 0, ep, '时限须为正')
      if (e.kind === 'boss' || e.kind === 'bossHp') need(boss || bossBefore, ep, '要打头目，须有头目在这一阶段或这一场更早的阶段登场')
      if (e.kind === 'bossHp') need(e.below > 0 && e.below < 1, ep, '头目血量的比例须在 (0, 1) 内')
      if (e.kind === 'bounty') need(squads.some((sq) => sq.bounty), ep, '要击倒悬赏目标，须有悬赏目标登场')
      if (e.kind === 'cleared') need(!endless, ep, '要清场，刷怪须有停下的时刻')
      if (e.kind === 'hold') need(e.ms > 0 && e.radius > 0 && e.points.length > 0, ep, '据点须至少一处，时长与半径为正')
      if (e.kind === 'kills' || e.kind === 'coins' || e.kind === 'downs') need(e.count >= 1, ep, `${e.kind}数至少为 1`)
      if (e.kind === 'kills' && e.enemy !== undefined) need(cat.enemies[e.enemy] !== undefined && (kinds === null || kinds.has(e.enemy)), ep, `要击杀的${e.enemy}不在这一阶段出现`)
      if (e.kind === 'kills') need(e.enemy === undefined || e.by === undefined, ep, '按死于哪种危害数，就不再按种类数')
    })
    return boss
  }

  /** 一场战斗：各阶段按先后查，外加这一场的规则、地图、奖励与难度时钟 */
  const checkFight = (f: FightDef, runMap: string | undefined, path: Path): void => {
    const phases: readonly LegacyPhaseDef[] = f.phases === undefined ? [f] : f.phases
    const where: Where = { map: f.map ?? runMap, staged: f.phases !== undefined, mix: undefined }
    need(phases.length > 0, path, '至少要有一个阶段')
    let boss = false
    phases.forEach((p, i) => {
      boss = checkPhase(p, i === phases.length - 1, boss, where, f.phases === undefined ? path : [...path, 'phases', i]) || boss
    })
    checkRules(f.rules, [...path, 'rules'])
    need(f.map === undefined || cat.maps[f.map] !== undefined, path, `引用了不存在的地图：${f.map}`)
    need((f.reward?.coins ?? 0) >= 0 && Number.isInteger(f.reward?.coins ?? 0), path, '奖励金币须是非负整数')
    need(f.clockSec === undefined || (Number.isFinite(f.clockSec) && f.clockSec >= 0), path, '难度时钟不为负')
  }

  /** 预设队伍：人数在满编以内，指定的不重复，随机的位置按最坏情况也挑得出人 */
  const checkTeam = (t: TeamDef, path: Path): void => {
    need(t.slots.length >= 1 && t.slots.length <= teamSize, path, '人数须在 1 到满编之间')
    const fixed = t.slots.filter((s) => typeof s === 'string')
    const taken = new Set<string>(fixed)
    need(taken.size === fixed.length, path, '指定角色不能重复')
    need((t.level ?? 1) >= 1 && (t.level ?? 1) <= cat.maxCharLevel, path, `等级下限须在 1 到 ${cat.maxCharLevel} 之间`)
    const picks = t.slots.length - fixed.length
    t.slots.forEach((s, i) => {
      if (typeof s === 'string') {
        need(cat.characters[s] !== undefined, [...path, 'slots', i], `引用了不存在的角色：${s}`)
        return
      }
      const pool = Object.entries(cat.characters).filter(([id, c]) => !taken.has(id) && s.tags.every((tag) => c.tags.includes(tag)))
      need(pool.length >= picks, [...path, 'slots', i], `随机位置 ${s.tags.join('+')} 可挑的角色不够`)
    })
  }

  /** 难度曲线：刷怪间隔从起点收紧到为正的终点、收紧时长为正，敌人血量不随时间变少，人数系数为正，掉金币的几率下限在 [0, 1] 内、衰减时长为正 */
  const checkCurve = (c: DifficultyCurve, path: Path): void => {
    need(c.minIntervalMs > 0 && c.startIntervalMs >= c.minIntervalMs && c.rampSeconds > 0, path, '刷怪间隔须从起点收紧到为正的终点，收紧时长为正')
    need(c.hpGrowthPerMin >= 0, path, '血量增长不为负')
    need(c.teamFactorBase > 0 && c.teamFactorPerMember >= 0, path, '人数系数须为正')
    need(c.coinDropChanceMin >= 0 && c.coinDropChanceMin <= 1 && c.coinDropChanceHalfLifeSec > 0, path, '掉金币几率的下限须在 [0, 1] 内，衰减时长为正')
  }

  /** 按轮重复：轮数是正整数，一直重复的只能是最后一步；轮次条件是正整数、起点不晚于终点、落在轮数以内；每一轮都得有一场战斗 */
  const checkRepeat = (s: RepeatDef, last: boolean, path: Path): void => {
    need(s.times === undefined || (Number.isInteger(s.times) && s.times >= 1), path, '轮数须是正整数')
    need(s.times !== undefined || last, path, '一直重复，只能是最后一步')
    for (const g of roundsOf(s)) {
      need(roundsOk(g), path, '轮次须是正整数，起点不晚于终点')
      need(s.times === undefined || Math.max(g.from ?? 1, g.to ?? 1) <= s.times, path, `轮次超出了 ${s.times} 轮`)
    }
    for (let k = 1; k <= roundsToCheck(s); k++) need(roundPicks(s, k).some((p) => p.step.kind === 'fight'), path, `第 ${k} 轮没有战斗`)
  }

  /** 一步：招募人数在满编以内，商店的物价档位是正整数，一场战斗按一场查 */
  const checkStep = (s: StepDef, runMap: string | undefined, path: Path): void => {
    if (s.kind === 'recruit') need(s.upTo >= 1 && s.upTo <= teamSize, path, '招募人数须在 1 到满编之间')
    if (s.kind === 'shop') need(s.tier === undefined || (Number.isInteger(s.tier) && s.tier >= 1), path, '商店的物价档位须是正整数')
    if (s.kind === 'fight') checkFight(s.fight, runMap, [...path, 'fight'])
  }

  /** 一局要走的每一步和它写在哪：重复的按轮展开，round 是第几轮 */
  const planned = (r: RunDef): { readonly step: StepDef; readonly at: Path; readonly round?: number }[] =>
    r.steps.flatMap((s, i) => {
      if (s.kind !== 'repeat') return [{ step: s, at: ['steps', i] }]
      return Array.from({ length: roundsToCheck(s) }, (_, k) => roundPicks(s, k + 1).map((p) => ({ step: p.step, at: ['steps', i, 'steps', p.index], round: k + 1 }))).flat()
    })

  const checkRun = (r: RunDef): void => {
    const plan = planned(r)
    const steps = plan.map((p) => p.step)
    const fights = steps.flatMap((s) => (s.kind === 'fight' ? [s.fight] : []))
    const first = steps.findIndex((s) => s.kind === 'fight')
    need(first >= 0, [], '至少要有一场战斗')
    need(r.team !== undefined || steps.slice(0, first).some((s) => s.kind === 'recruit'), ['team'], '没有预设队伍，第一场战斗之前须有招募')
    need(r.map === undefined || cat.maps[r.map] !== undefined, [], `引用了不存在的地图：${r.map}`)
    need(r.map === undefined || fights.every((f) => f.map === undefined), [], '固定了地图，各场就不能再换地图')
    const clocked = fights.map((f) => f.clockSec !== undefined)
    need(clocked.every((c) => c === clocked[0]), [], '难度时钟要么每场都定，要么都不定')
    need(r.start === undefined || (r.start.wave >= 1 && r.start.sec >= 0), [], '开局进度须从第 1 波、第 0 秒起')
    if (r.curve) checkCurve(r.curve, ['curve'])
    if (r.team && r.team !== 'knobs') checkTeam(r.team, ['team'])
    checkRules(r.rules, ['rules'])
    const lives = r.rules?.lives
    need(lives === undefined || (Number.isInteger(lives) && lives >= 1), ['rules'], '命数须是正整数')
    const rarity = r.rules?.shop?.rarity
    need(rarity === undefined || RARITY_RANK[rarity.min ?? 'common'] <= RARITY_RANK[rarity.max ?? 'legendary'], ['rules'], '商店的稀有度下限不能高于上限')
    const maxLevel = r.rules?.maxLevel
    const floor = r.team && r.team !== 'knobs' ? (r.team.level ?? 1) : 1
    need(maxLevel === undefined || (Number.isInteger(maxLevel) && maxLevel >= floor && maxLevel < cat.maxCharLevel), ['rules'], `等级上限须是整数，不低于队伍的等级下限、低于 ${cat.maxCharLevel}`)
    const t = r.teamLevel
    if (t) {
      need(t.base > 0 && t.growth >= 1, ['teamLevel'], '底数须为正，增长不小于 1：越往后升级越难')
      need(Number.isInteger(t.maxLevel) && t.maxLevel >= 2, ['teamLevel'], '满级须是不小于 2 的整数')
      const picks: readonly LevelPick[] = t.picks ?? ['recruit', 'upgrade']
      need(picks.length > 0 && new Set(picks).size === picks.length, ['teamLevel'], '可选项不能为空，也不能重复')
      // 每一次全队升级都得有得选：许招人时补满队伍的人数，加上许升级时每人还能升的级数，够用完升到满级的次数
      const free = Math.max(r.team && r.team !== 'knobs' ? r.team.slots.length : 0, ...steps.map((s) => (s.kind === 'recruit' ? s.upTo : 0)))
      const recruit = picks.includes('recruit')
      const room = (recruit ? teamSize - free : 0) + (picks.includes('upgrade') ? (recruit ? teamSize : free) * ((maxLevel ?? cat.maxCharLevel) - floor) : 0)
      need(room >= t.maxLevel - 1, ['teamLevel'], `靠全队升级，能选的只用得掉 ${room} 次，不够升到 ${t.maxLevel} 级的 ${t.maxLevel - 1} 次`)
    }
    if (fights.some((f) => f.phases !== undefined)) {
      need(fights.every((f) => f.phases !== undefined), [], '各场要么都按阶段写，要么都不按')
      need(r.map === undefined && r.start === undefined && r.record === undefined, [], '按阶段写的一局不固定地图、不给开局进度、不记最高分：地图与难度时钟写在每一场上')
      need(plan.every((p) => p.round !== undefined || p.step.kind !== 'shop' || p.step.tier !== undefined), [], '按阶段写的一局，重复之外的每家商店都要写物价档位')
    }
    need(r.stars === undefined || r.steps.every((s) => s.kind !== 'repeat' || s.times !== undefined), [], '一直重复的一局赢不了，不能有星级')
    r.stars?.forEach((s, i) => checkStar(s, lives, ['stars', i]))
    const only = r.rules?.recruit?.tags
    if (only) {
      // 预设里随机的位置与招募都从这些角色里挑，按最坏情况也得够
      const upTo = Math.max(0, ...steps.map((s) => (s.kind === 'recruit' ? s.upTo : 0)))
      const fixed = new Set<string>(r.team && r.team !== 'knobs' ? r.team.slots.filter((s) => typeof s === 'string') : [])
      const pool = Object.entries(cat.characters).filter(([cid, c]) => !fixed.has(cid) && only.every((tag) => c.tags.includes(tag)))
      need(only.length > 0 && upTo > 0, ['rules'], '限定了招募就得有招募步骤与标签')
      need(pool.length >= upTo - fixed.size, ['rules'], '限定的招募标签可挑的角色不够')
    }
    r.steps.forEach((s, i) => {
      if (s.kind === 'repeat') checkRepeat(s, i === r.steps.length - 1, ['steps', i])
    })
    // 重复里同一步每轮查出的同一个问题只报第一轮，位置落在写它的那一步上
    const seen = new Set<string>()
    for (const p of plan) {
      const found = collect(() => checkStep(p.step, r.map, p.at))
      if (p.round === undefined) {
        sink.push(...found)
        continue
      }
      for (const f of found) {
        const sub = f.at.slice(p.at.length)
        const phase = sub[0] === 'fight' && sub[1] === 'phases' && typeof sub[2] === 'number' ? ` 第 ${sub[2] + 1} 阶段` : ''
        const key = `${p.at.join('.')}|${phase}|${f.why}`
        if (seen.has(key)) continue
        seen.add(key)
        sink.push({ at: p.at, why: `第 ${p.round} 轮${phase}：${f.why}` })
      }
    }
  }

  return {
    run: (def) => collect(() => checkRun(def)),
    rules: (r) => collect(() => checkRules(r, [])),
    curve: (c) => collect(() => checkCurve(c, [])),
  }
}
