import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐻‍❄️ 北极熊：一身冰碴，近战打它的反被冻一层；熊掌是物理，把挡路的拍出老远、把冻住的拍碎，第三下砸冰冷一圈；一声咆哮把敌人都招到自己身上
const polarBearPaw = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2,
  damage: 17,
  knockback: 3,
  element: 'physical',
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 1.9, arcDeg: 110, ms: 180 },
} satisfies AbilityDef

const polarBearPaw2 = { ...polarBearPaw, onHit: [{ kind: 'taunt', durationMs: 1500 }] } satisfies AbilityDef

const polarBearSmash = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 2,
  damage: 16,
  fireSfx: 'shatter',
  color: 0x81d4fa,
  shape: { kind: 'disc', radius: 2.2, at: 'self' },
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

export const levels = [{ add: { maxHp: 30, armor: 2, thorns: 3 }, mul: { damage: 1.2 } }, { add: { maxHp: 70, armor: 4, thorns: 6 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43b_200d_2744_fe0f',
  name: '北极熊',
  element: 'ice',
  desc: '冰原上的霸主，本身是冰，冻不住、不怕冰水；浑身挂着冰碴，近战打它的敌人反吃 5 点、冷一层，挨满三层就冻住。一掌是物理，把挡路的拍出三格远，冻住的一掌拍碎、伤害翻倍；第三下砸冰，身边一圈的敌人冷一层；一声咆哮把附近的敌人都招到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 45, exertion: 1.2, thorns: 5 },
  skill: { name: '北极之王', icon: '1f451', desc: '咆哮一声：4.5 格内的敌人嘲讽 3 秒，都冲上来往冰碴上撞；自己挂上生命 30% 的护盾 5 秒，并霸体 2 秒', cdMs: 13_000, ability: 'polarBearRoar' },
  weapons: [],
  innate: [
    {
      name: '熊掌',
      icon: '1f43e',
      base: 'polarBearPaw',
      upgrades: [
        { ability: 'polarBearPaw2', card: { icon: '1f4a2', name: '挑衅', desc: '熊掌拍中的敌人嘲讽 1.5 秒，只追着你打，打上来就挨冰碴' } },
        { ability: 'polarBearPaw3', card: { icon: '1f9ca', name: '冰爪', desc: '每第三下改成砸冰：身周 2.2 格的敌人吃 16 点冰伤、冷一层' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
