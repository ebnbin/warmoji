import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🦁 狮子座：狮爪拍开挡路的，第三下改成怒吼吓跑一圈；技能挂上护盾，把敌人都招到自己身上
const leoClaw = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2.1,
  damage: 17,
  knockback: 2.5,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 2, arcDeg: 110, ms: 180 },
} satisfies AbilityDef

const KING = [{ on: 'fire', to: 'self', effects: [{ kind: 'guard', mul: 0.85, durationMs: 1000 }] }] as const

const leoClaw2 = { ...leoClaw, reactions: KING } satisfies AbilityDef

const leoRoar = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 3,
  damage: 12,
  fireSfx: 'boom',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 3, at: 'self' },
  onHit: [{ kind: 'fear', durationMs: 800 }],
  reactions: KING,
} satisfies AbilityDef

const leoClaw3 = { ...leoClaw2, cycle: [leoClaw2, leoRoar] } satisfies AbilityDef

const leoGuard = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'shield', amount: 0, ratio: 0.3, ms: 5000 },
        { kind: 'to', who: { side: 'allies', radius: 5 }, then: [{ kind: 'guard', mul: 0.8, durationMs: 3000 }] },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { leoClaw, leoClaw2, leoClaw3, leoGuard } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.15 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.35 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f981',
  name: '狮子座',
  element: 'light',
  desc: '从星座里走下来的狮子：狮爪把贴上来的拍开，每第三下改成怒吼吓跑一圈；技能给自己挂上厚厚的护盾，把身边的敌人都招到自己身上，还替队友挡下两成伤害',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 4.2, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '星座守护', icon: '264c', desc: '自己挂上生命 30% 的护盾 5 秒，4.5 格内的敌人嘲讽 3 秒；自己和 5 格内的队友 3 秒内受到的伤害 ×0.8', cdMs: 14_000, ability: 'leoGuard' },
  weapons: [],
  innate: [
    {
      name: '狮爪',
      icon: '1f981',
      base: 'leoClaw',
      upgrades: [
        { ability: 'leoClaw2', card: { icon: '1f451', name: '王者', desc: '每次出手后 1 秒内，自己受到的伤害 ×0.85' } },
        { ability: 'leoClaw3', card: { icon: '1f4e2', name: '狮吼', desc: '每第三下改成怒吼：身周 3 格内的敌人挨一下并恐惧 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
