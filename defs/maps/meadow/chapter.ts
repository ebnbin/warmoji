import type { FightDef, PhaseDef, RunDef } from '../../../src/types/runs'
import { stage, TEAM_LEVEL } from '../../chapter.ts'
import { FIGHTS } from './fights.ts'

/** 草甸的开场：三小批敌人，让首发攒够经验招到两三名队员，学会去捡升级道具 */
const MEADOW_WARMUP: PhaseDef = {
  intro: { title: '第一章 · 草甸', sub: '清掉三小批敌人；升级时走过去捡起掉落的升级道具' },
  mix: [
    { kind: 'wolf', weight: 3 },
    { kind: 'goat', weight: 2 },
  ],
  spawns: [
    {
      kind: 'waves',
      atMs: 2500,
      gapMs: 2000,
      squads: [
        { count: 5, enemy: 'wolf', at: { kind: 'gate', gate: 'woods' } },
        { count: 8, enemy: 'sandLocust', at: { kind: 'gate', gate: 'swarm' }, banner: { title: '蝗群', sub: '沙蝗从天上落下来，血薄却扑得急' } },
        { count: 10, spreadMs: 3000, at: { kind: 'gate', gate: 'grass' }, banner: { title: '草丛', sub: '四周的草里钻出来一群' } },
      ],
    },
  ],
  ends: [{ kind: 'cleared' }],
}

/** 接力的收尾：击杀数到了，倒木后面再翻过来一队，连同场上剩下的清干净；击杀再快，这一场也打满一分钟上下 */
const MEADOW_RELAY_END: PhaseDef = {
  intro: { title: '最后一棒', sub: '倒木后面翻过来一头精英野猪和一群狼，把场上的都清掉' },
  spawns: [{ kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'tusker', elites: 1, escort: { enemy: 'wolf', count: 6 }, at: { kind: 'gate', gate: 'log' } } }],
  ends: [{ kind: 'cleared' }],
}

/** 草甸的头目战：先清掉蛛后产下的卵，她从林缘爬出来，打到一半暴走，坡顶也冲下野猪 */
const MEADOW_BOSS: FightDef = {
  name: '1-4 蛛后',
  map: 'meadow',
  clockSec: 300,
  phases: [
    {
      intro: { title: '蛛卵', sub: '草地上到处是蛛后产下的卵，6 秒内不打破就结成缠人的蜘蛛网；清空草地，她就会爬出来' },
      mix: [
        { kind: 'wolf', weight: 3 },
        { kind: 'goat', weight: 2 },
      ],
      spawns: [
        { kind: 'stream', intervalMs: 1500, untilMs: 22_000 },
        { kind: 'batch', atMs: 1500, every: 6000, times: 4, squad: { count: 4, enemy: 'spiderEgg', at: { kind: 'ring', dist: 5 } } },
      ],
      ends: [{ kind: 'cleared' }],
    },
    {
      mix: [
        { kind: 'wolf', weight: 3 },
        { kind: 'goat', weight: 2 },
        { kind: 'grassSnake', weight: 1 },
      ],
      spawns: [
        { kind: 'stream', intervalMs: 2200 },
        { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'spiderQueen', stats: { mul: { maxHp: 0.7 } } }, banner: { title: '蛛后现身', sub: '她从林缘爬出来了：打破她一路产下的卵，别被蜘蛛网缠住' } },
      ],
      ends: [{ kind: 'bossHp', below: 0.5 }],
    },
    {
      intro: { title: '蛛后暴走', sub: '她只剩一半了，林子里的东西全涌了出来；一口气打倒她' },
      mix: [
        { kind: 'wolf', weight: 2 },
        { kind: 'goat', weight: 2 },
        { kind: 'tusker', weight: 1 },
      ],
      spawns: [
        { kind: 'stream', intervalMs: 1300 },
        { kind: 'batch', atMs: 800, squad: { count: 8, enemy: 'sandLocust', at: { kind: 'gate', gate: 'swarm' } }, banner: { title: '蝗群', sub: '一大群沙蝗从天上扑下来' } },
        { kind: 'batch', atMs: 12_000, squad: { count: 5, enemy: 'tusker', at: { kind: 'gate', gate: 'bank' } }, banner: { title: '坡顶', sub: '野猪从坡顶冲下来了' } },
      ],
      ends: [{ kind: 'boss' }],
    },
  ],
}

/** 第一章：草甸 */
export const CHAPTER = {
  emoji: '1f33c',
  name: '草甸',
  desc: '林子边上的一片草甸：守住闩着的栅栏门，轮流当队长清怪，顶住从坡顶抛下来的敌人，最后打倒从林缘爬出来的蛛后。选一名首发出发，击杀攒全队经验，升级时给场上一人升级，或让一人满生命上场：招募、替换、恢复；场与场之间不休整，倒下的要靠升级时复活或换下；每逛完一次商店，回到战场就是一片新生成的草甸',
  chapter: 'meadow',
  stars: [{ kind: 'downs', count: 5 }, { kind: 'time', ms: 380_000 }],
  teamLevel: TEAM_LEVEL,
  steps: [
    { kind: 'recruit', upTo: 1 },
    { kind: 'fight', fight: stage(FIGHTS.gateGuard, '1-1 守栅门', 0, { before: [MEADOW_WARMUP], reward: { coins: 40 } }) },
    { kind: 'shop', tier: 4 },
    { kind: 'fight', fight: stage(FIGHTS.relay, '1-2 接力', 120, { after: [MEADOW_RELAY_END], reward: { coins: 50 } }) },
    { kind: 'shop', tier: 8 },
    { kind: 'fight', fight: stage(FIGHTS.bankRaid, '1-3 坡顶来敌', 210, { reward: { coins: 60 } }) },
    { kind: 'shop', tier: 12 },
    { kind: 'fight', fight: MEADOW_BOSS },
  ],
} as const satisfies RunDef
