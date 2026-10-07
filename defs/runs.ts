import type { ExperimentDef, FightDef, FightReward, PhaseDef, RunDef } from '../src/types/runs'
import { mapValues } from '../src/util/record.ts'
import { EXPERIMENTS } from './experiments.ts'

/** 冒险的全队升级曲线 */
const TEAM_LEVEL = { base: 26, growth: 1.24, maxLevel: 15 } as const

/** 冒险里的一场就是一个实验的那一场：名字、难度时钟与过关奖励按这一章排，before 与 after 是接在实验前后的阶段 */
function stage(
  e: ExperimentDef,
  name: string,
  clockSec: number,
  extra: { readonly before?: readonly PhaseDef[]; readonly after?: readonly PhaseDef[]; readonly reward?: FightReward } = {},
): FightDef {
  return { ...e.fight, name, clockSec, phases: [...(extra.before ?? []), ...e.fight.phases, ...(extra.after ?? [])], ...(extra.reward ? { reward: extra.reward } : {}) }
}

/** 草甸的开场：三小批敌人，让首发攒够经验招到两三名队员，学会去捡升级道具 */
const MEADOW_WARMUP: PhaseDef = {
  intro: { title: '第一章 · 草甸', sub: '清掉三小批敌人；升级时走过去捡起掉落的升级道具' },
  mix: [
    { kind: 'zombie', weight: 3 },
    { kind: 'locust', weight: 2 },
  ],
  spawns: [
    {
      kind: 'waves',
      atMs: 2500,
      gapMs: 2000,
      squads: [
        { count: 5, enemy: 'zombie', at: { kind: 'gate', gate: 'woods' } },
        { count: 8, enemy: 'locust', at: { kind: 'gate', gate: 'swarm' }, banner: { title: '蝗群', sub: '跳蝗从天上落下来，血薄却扑得急' } },
        { count: 10, spreadMs: 3000, at: { kind: 'gate', gate: 'grass' }, banner: { title: '草丛', sub: '四周的草里钻出来一群' } },
      ],
    },
  ],
  ends: [{ kind: 'cleared' }],
}

/** 接力的收尾：击杀数到了，倒木后面再翻过来一队，连同场上剩下的清干净；击杀再快，这一场也打满一分钟上下 */
const MEADOW_RELAY_END: PhaseDef = {
  intro: { title: '最后一棒', sub: '倒木后面翻过来一头精英野猪和一群跟班，把场上的都清掉' },
  spawns: [{ kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'boar', elites: 1, escort: { enemy: 'zombie', count: 6 }, at: { kind: 'gate', gate: 'log' } } }],
  ends: [{ kind: 'cleared' }],
}

/** 草甸的头目战：先清掉蛛后产下的卵，她从林缘爬出来，打到一半暴走，坡顶也冲下野猪 */
const MEADOW_BOSS: FightDef = {
  name: '1-4 蛛后',
  map: 'meadow',
  clockSec: 300,
  phases: [
    {
      intro: { title: '蛛卵', sub: '草地上到处是蛛后产下的卵，6 秒内不打破就结成缠人的蛛网；清空草地，她就会爬出来' },
      mix: [
        { kind: 'zombie', weight: 3 },
        { kind: 'locust', weight: 2 },
      ],
      spawns: [
        { kind: 'stream', intervalMs: 1500, untilMs: 22_000 },
        { kind: 'batch', atMs: 1500, every: 6000, times: 4, squad: { count: 4, enemy: 'sapling', at: { kind: 'ring', dist: 5 } } },
      ],
      ends: [{ kind: 'cleared' }],
    },
    {
      mix: [
        { kind: 'zombie', weight: 3 },
        { kind: 'locust', weight: 2 },
        { kind: 'snake', weight: 1 },
      ],
      spawns: [
        { kind: 'stream', intervalMs: 2200 },
        { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'treant', stats: { mul: { maxHp: 0.7 } } }, banner: { title: '蛛后现身', sub: '她从林缘爬出来了：打破她一路产下的卵，别被蛛网缠住' } },
      ],
      ends: [{ kind: 'bossHp', below: 0.5 }],
    },
    {
      intro: { title: '蛛后暴走', sub: '她只剩一半了，林子里的东西全涌了出来；一口气打倒她' },
      mix: [
        { kind: 'zombie', weight: 2 },
        { kind: 'locust', weight: 2 },
        { kind: 'boar', weight: 1 },
      ],
      spawns: [
        { kind: 'stream', intervalMs: 1300 },
        { kind: 'batch', atMs: 800, squad: { count: 8, enemy: 'locust', at: { kind: 'gate', gate: 'swarm' } }, banner: { title: '蝗群', sub: '一大群跳蝗从天上扑下来' } },
        { kind: 'batch', atMs: 12_000, squad: { count: 5, enemy: 'boar', at: { kind: 'gate', gate: 'bank' } }, banner: { title: '坡顶', sub: '野猪从坡顶冲下来了' } },
      ],
      ends: [{ kind: 'boss' }],
    },
  ],
}

/** 冒险：一张地图一章，每章单独开局；各场用这张图的实验，章末打这张图的头目 */
const ADVENTURE = {
  meadowChapter: {
    emoji: '1f33c',
    name: '草甸',
    desc: '林子边上的一片草甸：守住闩着的栅栏门，轮流当队长清怪，顶住从坡顶抛下来的敌人，最后打倒从林缘爬出来的蛛后。选一名首发出发，击杀攒全队经验，升级时招人或给队员升级；每逛完一次商店，回到战场就是一片新生成的草甸',
    chapter: 'meadow',
    stars: [{ kind: 'downs', count: 5 }, { kind: 'time', ms: 380_000 }],
    rules: { between: 'rest' },
    teamLevel: TEAM_LEVEL,
    steps: [
      { kind: 'recruit', upTo: 1 },
      { kind: 'fight', fight: stage(EXPERIMENTS.gateGuard, '1-1 守栅门', 0, { before: [MEADOW_WARMUP], reward: { coins: 40 } }) },
      { kind: 'shop', tier: 4 },
      { kind: 'fight', fight: stage(EXPERIMENTS.relay, '1-2 接力', 120, { after: [MEADOW_RELAY_END], reward: { coins: 50 } }) },
      { kind: 'shop', tier: 8 },
      { kind: 'fight', fight: stage(EXPERIMENTS.bankRaid, '1-3 坡顶来敌', 210, { reward: { coins: 60, heal: true } }) },
      { kind: 'shop', tier: 12 },
      { kind: 'fight', fight: MEADOW_BOSS },
    ],
  },
} as const satisfies Record<string, RunDef>

/** B 的 id 和 A 的都不重名才是 B 本身，否则是 never */
type Disjoint<A, B> = [keyof A & keyof B] extends [never] ? B : never

/** 单独试玩一个实验：按它的预设队伍打它那一场；用实验的 id，和冒险的章重名就编译不过 */
const TRIALS: Disjoint<typeof ADVENTURE, Record<keyof typeof EXPERIMENTS, RunDef>> = mapValues(EXPERIMENTS, (e): RunDef => ({
  emoji: e.emoji,
  name: e.name,
  desc: e.desc,
  note: e.note,
  team: e.team,
  stars: e.stars,
  steps: [{ kind: 'fight', fight: e.fight }],
}))

export const RUNS = { ...ADVENTURE, ...TRIALS } as const satisfies Record<string, RunDef>
