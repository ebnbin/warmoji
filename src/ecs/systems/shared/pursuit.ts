import { defineDevChoice, defineDevFlag } from '../../../devtools'
import { PURSUIT } from '../../../data/feel'

export const PURSUIT_FLAGS = { pursuit: 'team.pursuit', orbit: 'team.orbit', separation: 'team.separation' } as const

export const pursuitOn = defineDevFlag({
  id: PURSUIT_FLAGS.pursuit,
  group: '队伍',
  label: '物理跟随',
  desc: '满员阵型下队员用自己的移速跑向队形位；关闭则回到弹簧粘合',
  default: true,
})
export const orbitOn = defineDevFlag({
  id: PURSUIT_FLAGS.orbit,
  group: '队伍',
  label: '队形环绕',
  desc: '队形位随威胁方向绕队长旋转',
  default: true,
})
export const separationOn = defineDevFlag({
  id: PURSUIT_FLAGS.separation,
  group: '队伍',
  label: '队员分离',
  desc: '物理跟随时重叠的队员互相推开',
  default: true,
})

const leash = defineDevChoice({
  id: 'team.leash',
  group: '队伍',
  label: '牵绳',
  desc: '离队长超过多少格改为直奔队长并加速',
  options: [...[4, 6, 8].map((n) => ({ id: String(n), label: `${n} 格` })), { id: '0', label: '不追赶' }],
  default: String(PURSUIT.leash),
})
const catchUp = defineDevChoice({
  id: 'team.catchUp',
  group: '队伍',
  label: '追赶加速',
  desc: '牵绳外的移速倍率',
  options: [1, 1.5, 2].map((m) => ({ id: String(m), label: `×${m}` })),
  default: String(PURSUIT.catchUpMul),
})

export function pursuitLeash(): number {
  const n = Number(leash())
  return n > 0 ? n : Infinity
}

export function pursuitCatchUp(): number {
  return Number(catchUp())
}
