import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧽 海绵：本身是水；隔一会儿把身边一圈敌人吸一口、浇湿，每吸一口给自己挂层薄盾，第三口把水挤出来；技能鼓成一团把敌人都招过来，霸体硬扛
const spongeSoak = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2,
  damage: 13,
  fireSfx: 'thud',
  color: 0x4fc3f7,
  shape: { kind: 'disc', radius: 1.8, at: 'self' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.04, ms: 2000 }] }],
} satisfies AbilityDef

const spongeSoak2 = { ...spongeSoak, range: 2.6, shape: { kind: 'disc', radius: 2.4, at: 'self' } } satisfies AbilityDef

const spongeSqueeze = {
  ...spongeSoak2,
  range: 3.2,
  damage: 14,
  knockback: 3,
  fireSfx: 'splash',
  shape: { kind: 'disc', radius: 3, at: 'self' },
} satisfies AbilityDef

const spongeSoak3 = { ...spongeSoak2, cycle: [spongeSoak2, spongeSqueeze] } satisfies AbilityDef

const spongeSwell = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'gulp',
  color: 0x4fc3f7,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'unstoppable', durationMs: 4000 },
        { kind: 'shield', amount: 0, ratio: 0.25, ms: 4000 },
        { kind: 'mend', amount: 0, ratio: 0.02, tickMs: 500, durationMs: 4000 },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { spongeSoak, spongeSoak2, spongeSoak3, spongeSwell } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 25, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 60, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9fd',
  name: '海绵',
  element: 'water',
  desc: '本身是水，一直湿着：点不着，可一冰就冻、一电一片；软乎乎地挡在前面，隔一会儿把身边一圈的敌人吸一口、浇得湿透，给队友的冰和雷铺路，每吸一口给自己挂一层薄盾；技能鼓成一团，把敌人都招到自己身上，霸体硬扛、一边回血',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.6 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '海绵体', icon: '1f6e1', desc: '4.5 格内的敌人嘲讽 3 秒；自己 4 秒内霸体，冻不住也推不动，挂上生命 25% 的护盾，每半秒回 2% 生命', cdMs: 13_000, ability: 'spongeSwell' },
  weapons: [],
  innate: [
    {
      name: '吸水',
      icon: '1f9fd',
      base: 'spongeSoak',
      upgrades: [
        { ability: 'spongeSoak2', card: { icon: '1f4a7', name: '吸饱', desc: '吸水的范围从 1.8 格扩到 2.4 格' } },
        { ability: 'spongeSoak3', card: { icon: '1f4a6', name: '挤水', desc: '每第三口把吸的水挤出来：3 格内的敌人挨一下、浇湿、被冲开' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
