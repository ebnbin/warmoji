import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐻‍❄️ 北极熊：一掌把挡路的拍出老远，第三下砸冰冻住一圈；一声咆哮把敌人都招到自己身上
const polarBearPaw = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2,
  damage: 17,
  knockback: 3,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 1.9, arcDeg: 110, ms: 180 },
} satisfies AbilityDef

const blubber = [{ on: 'fire', to: 'self', effects: [{ kind: 'guard', mul: 0.85, durationMs: 1000 }] }] as const

const polarBearPaw2 = { ...polarBearPaw, reactions: blubber } satisfies AbilityDef

const polarBearSmash = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2,
  damage: 20,
  fireSfx: 'shatter',
  color: 0x81d4fa,
  shape: { kind: 'disc', radius: 2, at: 'self' },
  onHit: [{ kind: 'status', status: 'frozen', ms: 800 }],
  reactions: blubber,
} satisfies AbilityDef

const polarBearPaw3 = { ...polarBearPaw2, cycle: [polarBearPaw2, polarBearSmash] } satisfies AbilityDef

const polarBearRoar = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'rumble',
  color: 0x81d4fa,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.3, ms: 5000 }, { kind: 'unstoppable', durationMs: 2000 }] }],
} satisfies AbilityDef

export const abilities = { polarBearPaw, polarBearPaw2, polarBearPaw3, polarBearRoar } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43b_200d_2744_fe0f',
  name: '北极熊',
  element: 'ice',
  traits: ['coldproof'],
  desc: '冰原上的霸主，不怕冰水：一掌把挡路的拍出三格远，第三下砸冰冻住身边一圈；一声咆哮把附近的敌人都招到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '北极之王', icon: '1f451', desc: '咆哮一声：4.5 格内的敌人嘲讽 3 秒，自己挂上生命 30% 的护盾 5 秒，并霸体 2 秒', cdMs: 13_000, ability: 'polarBearRoar' },
  weapons: [],
  innate: [
    {
      name: '熊掌',
      icon: '1f43e',
      base: 'polarBearPaw',
      upgrades: [
        { ability: 'polarBearPaw2', card: { icon: '1f9c8', name: '厚脂', desc: '每拍一掌，接下来 1 秒受到的伤害 ×0.85' } },
        { ability: 'polarBearPaw3', card: { icon: '1f9ca', name: '冰爪', desc: '每第三下改成砸冰：身周 2 格的敌人吃 20 点伤害并冻结 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
