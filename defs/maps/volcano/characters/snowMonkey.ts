import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐒 雪猴：一出手就是两拳，拳拳到肉，砸在冻住的敌人身上把冰敲碎；技能从高处扑下来，把落点的敌人砸得飞起来
const snowMonkeyPunch = {
  trigger: 'auto',
  cooldownMs: 750,
  aim: 'nearest',
  range: 1.9,
  damage: 13,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.7, radius: 0.5, ms: 140 },
  repeat: { count: 2, delayMs: 180, ratio: 0.7 },
} satisfies AbilityDef

const snowMonkeyPunch2 = { ...snowMonkeyPunch, onHit: [{ kind: 'stack', max: 4, durationMs: 3000, then: [{ kind: 'stun', durationMs: 800 }] }] } satisfies AbilityDef

const snowMonkeyPunch3 = { ...snowMonkeyPunch2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.05 }] }] } satisfies AbilityDef

const snowMonkeyAvalanche = {
  trigger: 'manual',
  aim: 'stick',
  damage: 44,
  color: 0xb3e5fc,
  fireSfx: 'jump',
  breach: 0.5,
  shape: { kind: 'leap', distance: 4, ms: 420, height: 1.4, radius: 2 },
  onHit: [{ kind: 'knockup', durationMs: 800, height: 1.2 }],
} satisfies AbilityDef

export const abilities = { snowMonkeyPunch, snowMonkeyPunch2, snowMonkeyPunch3, snowMonkeyAvalanche } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.02 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.04 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f412',
  name: '雪猴',
  desc: '山里泡温泉长大的雪猴，靠打人吸血续命，中了毒就续不上：一出手就是两拳，拳拳到肉，砸在冻住的敌人身上能把冰敲碎；技能从高处扑下来，把落点的敌人砸得飞起来',
  role: 'bruiser',
  tags: ['damage', 'melee', 'control'],
  body: { drag: 4.5, mass: 1.1 },
  stats: { moveSpeed: 6.2, maxStamina: 120, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '雪崩拳', icon: '1f3d4', desc: '朝摇杆方向扑出 4 格，落地砸中 2 格内的敌人并掀飞 0.8 秒，连墙也砸塌一块', cdMs: 10_000, ability: 'snowMonkeyAvalanche', aim: true },
  weapons: [],
  innate: [
    {
      name: '雪拳',
      icon: '1f94a',
      base: 'snowMonkeyPunch',
      upgrades: [
        { ability: 'snowMonkeyPunch2', card: { icon: '1f4ab', name: '打懵', desc: '同一个敌人 3 秒内挨满 4 拳就晕 0.8 秒' } },
        { ability: 'snowMonkeyPunch3', card: { icon: '1f6c0', name: '泡温泉', desc: '打死敌人时回复自己 5% 的生命' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
