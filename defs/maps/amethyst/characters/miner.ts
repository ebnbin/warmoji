import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧔 矿工：矿镐刨中的敌人更吃痛，第三下砸地震晕一圈；技能撑起跟着自己的坑道支架，把敌人挡在圈外、招到自己身上
const minerPick = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 1.9,
  damage: 16,
  knockback: 1.5,
  fireSfx: 'chip',
  shape: { kind: 'sector', radius: 1.8, arcDeg: 100, ms: 180 },
  onHit: [{ kind: 'status', status: 'exposed', ms: 2000, value: 1.15 }],
} satisfies AbilityDef

const minerPick2 = {
  ...minerPick,
  onHit: [...minerPick.onHit, { kind: 'reveal', durationMs: 3000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'guard', mul: 0.85, durationMs: 1000 }] }],
} satisfies AbilityDef

const minerSlam = {
  ...minerPick2,
  range: 2,
  damage: 20,
  knockback: 2,
  fireSfx: 'crumble',
  color: 0x8d6e63,
  shape: { kind: 'disc', radius: 2, at: 'self' },
  onHit: [{ kind: 'stun', durationMs: 800 }],
} satisfies AbilityDef

const minerPick3 = { ...minerPick2, cycle: [minerPick2, minerSlam] } satisfies AbilityDef

const minerProps = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'creak',
  color: 0x8d6e63,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 2000 }],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'barrier', shape: 'ring', length: 2.5, durationMs: 5000, bodies: 'foes', shots: false, follow: true, color: 0x8d6e63 },
        { kind: 'shield', amount: 0, ratio: 0.25, ms: 5000 },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { minerPick, minerPick2, minerPick3, minerProps } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 25, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 60, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d4',
  name: '矿工',
  element: 'earth',
  desc: '在晶洞里挖了一辈子矿的老矿工：矿镐刨中的敌人更吃痛；撑起一圈坑道支架把队友护在里面，把敌人都招到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.7 },
  stats: { moveSpeed: 4, maxStamina: 150, staminaRegen: 45, exertion: 1.2 },
  skill: {
    name: '坑道支护',
    icon: '1f6a7',
    desc: '撑起一圈跟着自己走的支架 5 秒，半径 2.5 格，敌人进不来也出不去，弹体照样飞得过；自己挂上生命 25% 的护盾 5 秒，4 格内的敌人被嘲讽 2 秒',
    cdMs: 14_000,
    ability: 'minerProps',
  },
  weapons: [],
  innate: [
    {
      name: '矿镐',
      icon: '26cf',
      base: 'minerPick',
      upgrades: [
        { ability: 'minerPick2', card: { icon: '1f526', name: '矿灯', desc: '打中的敌人显形 3 秒；每次出手后 1 秒内自己受到的伤害 ×0.85' } },
        { ability: 'minerPick3', card: { icon: '1f4a5', name: '塌方', desc: '每第三下改成砸地：身边 2 格内的敌人挨 20 点并眩晕 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
