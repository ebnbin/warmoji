import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🦐 螳螂虾：一出手就是两拳，同一个敌人挨满几拳就被打晕；技能朝一个方向打出六连重拳
const KO = [{ kind: 'stun', durationMs: 800 }, { kind: 'damage', amount: 18 }] as const

const mantisShrimpPunch = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  range: 1.7,
  damage: 10,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.6, radius: 0.5, ms: 100 },
  repeat: { count: 2, delayMs: 120 },
  onHit: [{ kind: 'stack', max: 4, durationMs: 3000, then: KO }],
} satisfies AbilityDef

const mantisShrimpPunch2 = {
  ...mantisShrimpPunch,
  knockback: 1.5,
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: KO }],
} satisfies AbilityDef

const mantisShrimpPunch3 = {
  ...mantisShrimpPunch2,
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [...KO, { kind: 'blast', radius: 1.5, ratio: 0.8, knockback: 2, ring: ring(0x4fc3f7) }] }],
} satisfies AbilityDef

const mantisShrimpBarrage = {
  trigger: 'manual',
  aim: 'stick',
  damage: 15,
  knockback: 1,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 2.4, radius: 0.6, ms: 90 },
  repeat: { count: 6, delayMs: 100 },
} satisfies AbilityDef

export const abilities = { mantisShrimpPunch, mantisShrimpPunch2, mantisShrimpPunch3, mantisShrimpBarrage } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f990',
  name: '螳螂虾',
  element: 'water',
  desc: '出拳比子弹还快的螳螂虾：一出手就是两拳，同一个敌人 3 秒内挨满四拳就晕 0.8 秒，再多挨 18 点；技能朝一个方向打出六连重拳',
  role: 'bruiser',
  tags: ['damage', 'melee'],
  body: { drag: 4.8, mass: 1 },
  stats: { moveSpeed: 5.8, maxStamina: 110, staminaRegen: 65, exertion: 1 },
  skill: { name: '连环重拳', icon: '1f94a', desc: '朝摇杆方向连打六拳，每拳 15 点，把敌人往前推', cdMs: 9_000, ability: 'mantisShrimpBarrage', aim: true },
  weapons: [],
  innate: [
    {
      name: '碎壳拳',
      icon: '1f990',
      base: 'mantisShrimpPunch',
      upgrades: [
        { ability: 'mantisShrimpPunch2', card: { icon: '1f4a8', name: '空泡', desc: '拳拳把敌人震退，挨满三拳就晕' } },
        { ability: 'mantisShrimpPunch3', card: { icon: '1f4a5', name: '音爆', desc: '打晕时在敌人身上炸开，1.5 格内的敌人各吃这一拳八成的伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
