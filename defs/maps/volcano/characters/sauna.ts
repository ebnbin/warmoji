import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🧖 温泉客：身周冒蒸汽，熏得敌人出手发慢，熏满三下就睡过去；技能就地泡出一池温泉，泡久了的敌人睡着
const saunaSteam = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 2.2,
  damage: 10,
  color: 0xeceff1,
  fireSfx: 'gust',
  shape: { kind: 'disc', radius: 2.2, at: 'self' },
  onHit: [{ kind: 'attackSlow', mul: 1.3, durationMs: 1200 }],
} satisfies AbilityDef

const saunaSteam2 = {
  ...saunaSteam,
  onHit: [...saunaSteam.onHit, { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'sleep', durationMs: 2000, wakeMul: 1.5 }] }],
} satisfies AbilityDef

const saunaSteam3 = { ...saunaSteam2, range: 2.8, shape: { ...saunaSteam2.shape, radius: 2.8 } } satisfies AbilityDef

const saunaSpring = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'bubble',
  shape: {
    kind: 'zone',
    radius: 3.5,
    durationMs: 6000,
    tickMs: 500,
    who: 'foes',
    dwell: { ms: 1200, effects: [{ kind: 'sleep', durationMs: 2500, wakeMul: 1.5 }] },
    visual: zoneLook(0x80deea),
  },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 600 }],
} satisfies AbilityDef

export const abilities = { saunaSteam, saunaSteam2, saunaSteam3, saunaSpring } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.45, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d6',
  name: '温泉客',
  element: 'water',
  desc: '裹着浴巾的温泉客：身周冒着蒸汽，熏得贴身的敌人出手发慢，熏满三下就睡过去；技能就地泡出一池温泉，在里面泡久了的敌人睡着',
  role: 'controller',
  tags: ['control', 'area'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.2, maxStamina: 110, staminaRegen: 70, exertion: 0.8 },
  skill: {
    name: '温泉',
    icon: '2668',
    desc: '在脚下泡出 3.5 格的温泉 6 秒：池里的敌人移速 ×0.6，连续泡满 1.2 秒就睡 2.5 秒，叫醒那一下伤害 ×1.5',
    cdMs: 14_000,
    ability: 'saunaSpring',
  },
  weapons: [],
  innate: [
    {
      name: '蒸汽',
      icon: '1f32b',
      base: 'saunaSteam',
      upgrades: [
        { ability: 'saunaSteam2', card: { icon: '1f4a4', name: '桑拿', desc: '同一个敌人 3 秒内被熏满 3 下就睡 2 秒，叫醒那一下伤害 ×1.5' } },
        { ability: 'saunaSteam3', card: { icon: '1f975', name: '热气', desc: '蒸汽扩到身周 2.8 格' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
