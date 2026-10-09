import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 💂 近卫：长戟一刺穿透一排，刺中的冲不动也闪不走，顶到墙上就围起来关住；技能立起盾墙，把周围的敌人引到自己身上
const royalGuardStab = {
  trigger: 'auto',
  cooldownMs: 1150,
  aim: 'nearest',
  range: 2.3,
  damage: 17,
  knockback: 2,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 2.2, radius: 0.5, ms: 160 },
} satisfies AbilityDef

const royalGuardStab2 = { ...royalGuardStab, onHit: [{ kind: 'grounded', durationMs: 2500 }] } satisfies AbilityDef

const besieged = [
  { kind: 'stun', durationMs: 1200 },
  { kind: 'damage', amount: 0, ratio: 0.8 },
  { kind: 'barrier', shape: 'ring', length: 1.3, durationMs: 2000, bodies: 'all', shots: false, color: 0xffe082 },
] as const

const royalGuardStab3 = { ...royalGuardStab2, knockback: 0, onHit: [{ kind: 'shove', distance: 2.4, ms: 260, onWall: besieged }, { kind: 'grounded', durationMs: 2500 }] } satisfies AbilityDef

const royalGuardWard = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  fireSfx: 'clank',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 2500 }],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'barrier', shape: 'wall', length: 4, offset: 1.5, durationMs: 5000, bodies: 'foes', shots: true, color: 0xffe082 },
        { kind: 'guard', mul: 0.6, durationMs: 5000 },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { royalGuardStab, royalGuardStab2, royalGuardStab3, royalGuardWard } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f482',
  name: '近卫',
  element: 'light',
  desc: '持戟的近卫：长戟一刺穿透一排敌人，把贴上来的顶开；升级后刺中的冲不动也闪不走，顶到墙上的被一圈墙关住；技能在身前立起盾墙，把周围的敌人都引到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.7 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 50, exertion: 1.2 },
  skill: {
    name: '御前守卫',
    icon: '1f451',
    desc: '朝最近的敌人在身前 1.5 格立起一道 4 格长的盾墙 5 秒，挡住敌人与敌方弹体；4 格内的敌人嘲讽 2.5 秒，自己 5 秒内受到的伤害减四成',
    cdMs: 14_000,
    ability: 'royalGuardWard',
  },
  weapons: [],
  innate: [
    {
      name: '戟刺',
      icon: '1f531',
      base: 'royalGuardStab',
      upgrades: [
        { ability: 'royalGuardStab2', card: { icon: '26d3', name: '禁锢', desc: '被戟刺中的敌人 2.5 秒内不能冲刺、跳跃、闪现' } },
        { ability: 'royalGuardStab3', card: { icon: '1f3f0', name: '围城', desc: '戟刺改成把敌人顶出 2.4 格：撞上墙的眩晕 1.2 秒、再挨这一下八成的伤害，四周围起一圈 1.3 格的墙 2 秒，谁也进出不得' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
