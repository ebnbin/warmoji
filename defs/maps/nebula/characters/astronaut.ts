import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🧑‍🚀 宇航员：推进拳一次两拳，同一个敌人挨满三拳就被电晕；技能背着喷射背包跳进敌群
const astronautPunch = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 1.9,
  damage: 11,
  knockback: 1,
  fireSfx: 'hit',
  shape: { kind: 'segment', reach: 1.8, radius: 0.45, ms: 140 },
  repeat: { count: 2, delayMs: 150 },
} satisfies AbilityDef

const astronautPunch2 = {
  ...astronautPunch,
  range: 3.3,
  shape: { kind: 'segment', reach: 1.8, radius: 0.45, ms: 200, lungeDist: 1.5 },
  repeat: { count: 2, delayMs: 200 },
} satisfies AbilityDef

const astronautPunch3 = {
  ...astronautPunch2,
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'stun', durationMs: 800 }, { kind: 'damage', amount: 18 }] }],
} satisfies AbilityDef

const astronautJet = {
  trigger: 'manual',
  aim: 'stick',
  damage: 38,
  fireSfx: 'jump',
  color: 0xffd54f,
  shape: { kind: 'leap', distance: 5, ms: 500, height: 1.6, radius: 1.8 },
  onHit: [{ kind: 'knockup', durationMs: 600, height: 1 }],
} satisfies AbilityDef

export const abilities = { astronautPunch, astronautPunch2, astronautPunch3, astronautJet } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f680',
  name: '宇航员',
  element: 'thunder',
  desc: '穿着宇航服的斗士：推进拳一次两拳，同一个敌人挨满三拳就被电得发晕；背着喷射背包，随时跳进敌群把一圈敌人掀上天',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.8, mass: 1.3 },
  stats: { moveSpeed: 5.6, maxStamina: 120, staminaRegen: 65, exertion: 1 },
  skill: { name: '喷射背包', icon: '1f392', desc: '朝摇杆方向喷射跳出 5 格，落地砸中 1.8 格内的敌人，每个挨 38 点并被击飞 0.6 秒', cdMs: 9_000, ability: 'astronautJet', aim: true },
  weapons: [],
  innate: [
    {
      name: '推进拳',
      icon: '1f44a',
      base: 'astronautPunch',
      upgrades: [
        { ability: 'astronautPunch2', card: { icon: '1f680', name: '助推', desc: '出拳时往前一冲 1.5 格，拳头够得着 3.3 格远' } },
        { ability: 'astronautPunch3', card: { icon: '1f9f2', name: '电磁拳', desc: '同一个敌人挨满三拳就眩晕 0.8 秒，再挨 18 点伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
