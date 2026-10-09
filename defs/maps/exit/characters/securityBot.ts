import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🤖 保安机器人：电警棍敲一下打断一下，电流再跳给旁边一个，随打随补装甲，每第三下放电电一圈；外壳通电，近身打它的挨电；技能立起电闸拦住敌人，再把身边的敌人都招到自己身上
const securityBotBaton = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 1.9,
  damage: 13,
  fireSfx: 'zap',
  shape: { kind: 'segment', reach: 1.8, radius: 0.5, ms: 160 },
} satisfies AbilityDef

const securityBotBaton2 = { ...securityBotBaton, reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.04, ms: 2000 }] }] } satisfies AbilityDef

const securityBotDischarge = {
  ...securityBotBaton2,
  range: 2.2,
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 2.2, at: 'self' },
} satisfies AbilityDef

const securityBotBaton3 = { ...securityBotBaton2, cycle: [securityBotBaton2, securityBotDischarge] } satisfies AbilityDef

const securityBotLockdown = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  fireSfx: 'zap',
  shape: { kind: 'world' },
  onHit: [
    { kind: 'barrier', shape: 'wall', length: 5, offset: 1.5, durationMs: 5000, bodies: 'foes', shots: true, color: 0xffd54f },
    { kind: 'to', who: { side: 'foes', radius: 4 }, then: [{ kind: 'taunt', durationMs: 3000 }] },
  ],
} satisfies AbilityDef

export const abilities = { securityBotBaton, securityBotBaton2, securityBotBaton3, securityBotLockdown } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.15 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.35 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f916',
  name: '保安机器人',
  element: 'thunder',
  desc: '巡逻的保安机器人，浑身带电：电警棍敲一下就打断敌人的出手，电流再跳给旁边一个；外壳通电，近身打它的挨 5 点电、出手被打断；装甲厚，怕燃烧、中毒这类不吃护甲的；技能立起一道电闸拦住敌人，再把身边的敌人都招到自己身上',
  role: 'tank',
  tags: ['defense', 'control', 'melee'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 4, maxStamina: 150, staminaRegen: 45, exertion: 1.25, thorns: 5 },
  skill: { name: '封锁', icon: '1f6a7', desc: '朝最近的敌人在身前 1.5 格立起一道 5 格长的电闸，5 秒内挡住敌人与敌方弹体；4 格内的敌人嘲讽 3 秒', cdMs: 14_000, ability: 'securityBotLockdown' },
  weapons: [],
  innate: [
    {
      name: '电警棍',
      icon: '26a1',
      base: 'securityBotBaton',
      upgrades: [
        { ability: 'securityBotBaton2', card: { icon: '1f6e1', name: '装甲', desc: '每次出手给自己挂一层生命 4% 的护盾 2 秒' } },
        { ability: 'securityBotBaton3', card: { icon: '1f578', name: '电网', desc: '每第三下改成放电：身周 2.2 格的敌人各挨一下电、出手被打断，湿的连成一片' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
