import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐢 寺龟：甩一圈水泼慢身边的敌人；玄武护体时硬得像石头，把四周的敌人招到身上，身周的水幕把飞来的弹体弹回去
const templeTurtleJar = {
  trigger: 'auto',
  cooldownMs: 1250,
  aim: 'nearest',
  range: 2.2,
  damage: 18,
  fireSfx: 'splash',
  color: 0x42a5f5,
  shape: { kind: 'disc', radius: 2, at: 'self' },
  onHit: [{ kind: 'slow', factor: 0.75, durationMs: 1000 }],
} satisfies AbilityDef

const templeTurtleJar2 = { ...templeTurtleJar, reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.04, ms: 2000 }] }] } satisfies AbilityDef

const templeTurtleJar3 = { ...templeTurtleJar2, onHit: [...templeTurtleJar.onHit, { kind: 'attune', element: 'water', ms: 4000 }] } satisfies AbilityDef

const templeTurtleXuanwu = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'wash',
  color: 0x4fc3f7,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'guard', mul: 0.4, durationMs: 4000 },
        { kind: 'barrier', shape: 'ring', length: 2.2, durationMs: 3000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x4fc3f7 },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { templeTurtleJar, templeTurtleJar2, templeTurtleJar3, templeTurtleXuanwu } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.15 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.35 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f422',
  name: '寺龟',
  element: 'water',
  desc: '寺院池子里的老龟，走得慢、背壳硬：甩一圈水泼慢身边的敌人；玄武护体时受到的伤害大减，把四周的敌人都招到自己身上，身周的水幕把飞来的弹体弹回去',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 3.9, maxStamina: 150, staminaRegen: 42, exertion: 1.25 },
  skill: {
    name: '玄武',
    icon: '1f6e1',
    desc: '4 秒内受到的伤害 ×0.4，4 格内的敌人嘲讽 3 秒，身周立起一圈 2.2 格的水幕跟着自己 3 秒，把敌方的弹体反弹回去',
    cdMs: 14_000,
    ability: 'templeTurtleXuanwu',
  },
  weapons: [],
  innate: [
    {
      name: '水缸',
      icon: '1f3fa',
      base: 'templeTurtleJar',
      upgrades: [
        { ability: 'templeTurtleJar2', card: { icon: '26f2', name: '清泉', desc: '每甩一次水，给自己挂一层生命 4% 的护盾 2 秒' } },
        { ability: 'templeTurtleJar3', card: { icon: '1f4a7', name: '龟息', desc: '泼中的敌人 4 秒内变成水元素，挨雷、冰打更疼' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
