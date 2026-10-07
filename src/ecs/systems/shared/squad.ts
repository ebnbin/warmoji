import { numChoices } from './devNumbers'
import { SQUAD } from '../../../data/feel'
import { TEAM } from '../../../data/characters'

const numChoice = numChoices('队伍')

export const leaderGrip = numChoice('team.grip', '队长抓地', '推力与阻力同乘：极速不变，响应更快', [4, 8, 16], TEAM.leaderGrip, (v) => `×${v}`)
export const reverseGain = numChoice('team.reverseGain', '回头倍率', '速度背离目标位时的驱动力倍数', [1, 2, 3], SQUAD.reverseGain, (v) => `×${v}`)
export const turnRate = numChoice('team.turnRate', '转向速率', '目标位扇形随队长朝向转动的角速度', [120, 240, 360, 600], SQUAD.turnRateDeg, (v) => `${v}°/秒`)
export const seatHysteresis = numChoice('team.seatHysteresis', '换位滞后', '另一个目标位近出多少格才换', [0, 0.25, 0.5], SQUAD.seatHysteresis, (v) => `${v} 格`)
export const fanSpreadDeg = numChoice('team.fanSpread', '扇形角度', '', [90, 120, 150], SQUAD.fanSpreadDeg, (v) => `${v}°`)
export const fanDistance = numChoice('team.fanDistance', '扇形距离', '', [1, 1.5, 2], SQUAD.fanDistance, (v) => `${v} 格`)
export const recallDist = numChoice('team.recall', '掉队回收', '离队长超过多少格直接拉回目标位，唯一的非物理规则', [10, 14, 0], SQUAD.recallDist, (v) => (v === 0 ? '不回收' : `${v} 格`))

export const handoverMs = numChoice('team.handoverMs', '交接时长', '换队长时尺寸、相机与无敌的过渡时间', [250, 500, 800], SQUAD.handoverMs, (v) => `${v} ms`)
