import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧽 海绵：隔一会儿把身边一圈敌人吸一口，每吸一口给自己挂层薄盾，第三口把水挤出来；技能鼓成一团把敌人都招过来硬扛
const spongeSoak = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2,
  damage: 17,
  fireSfx: 'thud',
  color: 0x4fc3f7,
  shape: { kind: 'disc', radius: 1.8, at: 'self' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.04, ms: 2000 }] }],
} satisfies AbilityDef

const spongeSoak2 = { ...spongeSoak, onHit: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }] } satisfies AbilityDef

const spongeSqueeze = {
  ...spongeSoak2,
  range: 2.4,
  damage: 18,
  knockback: 3,
  fireSfx: 'splash',
  shape: { kind: 'disc', radius: 2.4, at: 'self' },
  onHit: [...spongeSoak2.onHit, { kind: 'attune', element: 'water', ms: 4000 }],
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
        { kind: 'guard', mul: 0.4, durationMs: 4000 },
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
  desc: '软乎乎地挡在前面，隔一会儿把身边一圈的敌人吸一口，每吸一口给自己挂一层薄盾；技能鼓成一团，把敌人都招到自己身上，一边硬扛一边回血',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.6 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '海绵体', icon: '1f6e1', desc: '4.5 格内的敌人嘲讽 3 秒；自己 4 秒内受到的伤害 ×0.4，每半秒回 2% 生命', cdMs: 13_000, ability: 'spongeSwell' },
  weapons: [],
  innate: [
    {
      name: '吸水',
      icon: '1f9fd',
      base: 'spongeSoak',
      upgrades: [
        { ability: 'spongeSoak2', card: { icon: '1f4a7', name: '吸饱', desc: '被吸的敌人减速 30% 1 秒' } },
        { ability: 'spongeSoak3', card: { icon: '1f4a6', name: '挤水', desc: '每第三口把吸的水挤出来：2.4 格内的敌人挨一下、被冲开，4 秒内变成水元素' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
