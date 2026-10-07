import type { MapId } from '../types/maps'
import type { RunDef } from '../types/runs'

/** 沙盒：挑一张地图打一局，队员、敌人、规模与强度都由开发面板的旋钮决定 */
export const SANDBOX = { emoji: '1f3d6', name: '沙盒', desc: '队员、敌人、规模与强度都由开发面板的旋钮决定，不计时、不结束' } as const

/** 这张图上的一局沙盒：队伍与刷怪都看旋钮，只有一个不结束的阶段，金币用不完 */
export function sandboxRun(map: MapId): RunDef {
  return { ...SANDBOX, team: 'knobs', coins: 999_999, steps: [{ kind: 'fight', fight: { name: SANDBOX.name, map, phases: [{ spawns: [], ends: [] }] } }] }
}
