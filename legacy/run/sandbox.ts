import { MAP_ROSTER, TEAM } from '../data/characters'
import { MAPS } from '../data/maps'
import { pickSandbox } from '../ecs/sandbox/knobs'
import type { MapId } from '../types/maps'
import type { RunDef } from '../types/runs'

/** 沙盒：挑一张地图打一局，队员、敌人、规模与强度都由开发面板的旋钮决定 */
export const SANDBOX = { emoji: '1f3d6', name: '沙盒', desc: '队员、敌人、规模与强度都由开发面板的旋钮决定，不计时、不结束' } as const

/** 进图时随机抽几种小怪 */
const FOE_KINDS = { min: 4, max: 6 } as const

/** 从 list 里不重样地随机取 n 个，顺序也随机 */
function draw<T>(list: readonly T[], n: number): T[] {
  const pool = [...list]
  const k = Math.min(n, pool.length)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, k)
}

/** 进一张图的沙盒时重抽：这张图对应的角色里随机凑满一队，小怪里随机抽 4 到 6 种，头目里随机抽一个 */
export function rollSandbox(map: MapId): void {
  const m = MAPS[map]
  const kinds = FOE_KINDS.min + Math.floor(Math.random() * (FOE_KINDS.max - FOE_KINDS.min + 1))
  pickSandbox(draw(MAP_ROSTER[map], TEAM.maxSize), [...draw(m.foes, kinds), ...draw(m.bosses, 1)])
}

/** 这张图上的一局沙盒：队伍与刷怪都看旋钮，只有一个不结束的阶段，金币用不完 */
export function sandboxRun(map: MapId): RunDef {
  return { ...SANDBOX, team: 'knobs', coins: 999_999, steps: [{ kind: 'fight', fight: { name: SANDBOX.name, map, phases: [{ spawns: [], ends: [] }] } }] }
}
