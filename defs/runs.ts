import type { Banner, FightDef, RunDef, SpawnRule, StepDef } from '../src/types/runs'
import { DIFFICULTY } from './difficulty.ts'
import { TEAM_BASELINE } from './team.ts'

/** 正式局：每波撑多久、哪几波来精英潮、从第几波起小怪可能是精英、头目波刷怪放慢几倍、每波带光圈的敌人几只 */
const CLASSIC = {
  waveSec: [20, 20, 25, 25, 30, 30, 40, 40, 40, 60, 50, 50, 50, 50, 70, 60, 60, 90],
  surgeWaves: [10, 15],
  eliteFrom: 10,
  eliteChance: 0.15,
  bossRelief: 2,
  carriers: {
    boss: { buff: 1, debuff: 2 },
    tiers: [
      { upToWave: 3, buff: 2, debuff: 1 },
      { upToWave: 8, buff: 2, debuff: 2 },
    ],
    fallback: { buff: 3, debuff: 3 },
  },
} as const

const SURGE_BANNER: Banner = { title: '精英来袭', sub: '敌人潮涌来，小心金边强敌！' }
/** 精英潮与头目在开打后多久登场 */
const EVENT_MS = 600

/** 带光圈的敌人几只：头目波按头目的，其余按波次档 */
function carrierBudget(wave: number, boss: boolean): { buff: number; debuff: number } {
  const cb = CLASSIC.carriers
  if (boss) return cb.boss
  return cb.tiers.find((t) => wave <= t.upToWave) ?? cb.fallback
}

/** 正式局的第 wave 波：撑过时长；第 2 波起有带光圈的敌人，精英波来一次精英潮，最后一波头目登场、打倒它也算过关 */
function classicFight(wave: number, sec: number, last: boolean): FightDef {
  const ms = sec * 1000
  const eliteChance = wave >= CLASSIC.eliteFrom ? { eliteChance: CLASSIC.eliteChance } : {}
  const spawns: SpawnRule[] = [{ kind: 'stream', ...(last ? { intervalMul: CLASSIC.bossRelief } : {}), ...eliteChance }]
  if (wave >= 2) {
    const { buff, debuff } = carrierBudget(wave, last)
    spawns.push({ kind: 'carriers', buff, debuff, atMs: ms * 0.12, spanMs: ms * 0.7 })
  }
  if ((CLASSIC.surgeWaves as readonly number[]).includes(wave)) {
    const { count, elites, spreadMs } = DIFFICULTY.surge
    spawns.push({ kind: 'batch', atMs: EVENT_MS, squad: { count, elites, spreadMs, ...eliteChance }, banner: SURGE_BANNER })
  }
  if (last) spawns.push({ kind: 'boss', atMs: EVENT_MS })
  return { name: `第 ${wave} 波`, spawns, ends: last ? [{ kind: 'time', ms }, { kind: 'boss' }] : [{ kind: 'time', ms }] }
}

/** 正式局的步骤：第 k 波之前招到 k 人直到满编，第 2 波起每波之前进一次商店 */
function classicSteps(): StepDef[] {
  const secs = CLASSIC.waveSec
  return secs.flatMap((sec, i): StepDef[] => {
    const wave = i + 1
    const before: StepDef[] = []
    if (wave <= TEAM_BASELINE.team.maxSize) before.push({ kind: 'recruit', upTo: wave })
    if (wave > 1) before.push({ kind: 'shop' })
    return [...before, { kind: 'fight', fight: classicFight(wave, sec, wave === secs.length) }]
  })
}

export const RUNS = {
  classic: {
    emoji: '2694',
    name: '正式局',
    desc: '从一名首发起步，每波之间招募与购物，撑过十八波，终波击败或撑过头目',
    record: true,
    steps: classicSteps(),
  },
  sandbox: {
    emoji: '1f3af',
    name: '试炼场',
    desc: '队员、敌人、规模与强度都由开发者面板的旋钮决定，不计时、不结束',
    team: 'knobs',
    coins: 999_999,
    steps: [{ kind: 'fight', fight: { spawns: [{ kind: 'knobs' }], ends: [] } }],
  },
} as const satisfies Record<string, RunDef>
