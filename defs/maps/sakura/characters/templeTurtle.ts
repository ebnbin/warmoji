import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🐢 寺龟：抛出睡莲叶让敌人睡着，落处起一团催眠的池雾；玄武时全队爬上龟背，自己霸体硬扛
const SLEEP = { kind: 'sleep', durationMs: 3000, wakeMul: 2 } as const

const templeTurtleLotus = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 7,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1fab7', 9), lifeMs: 1000 },
  onHit: [SLEEP],
} satisfies AbilityDef

const templeTurtleLotus2 = {
  ...templeTurtleLotus,
  onHit: [SLEEP, { kind: 'ground', def: patch(1.5, 2500, 0xa5d6a7, [{ kind: 'sleep', durationMs: 1200, wakeMul: 1.5 }], 0, 600) }],
} satisfies AbilityDef

const templeTurtleLotus3 = {
  ...templeTurtleLotus,
  onHit: [
    SLEEP,
    {
      kind: 'ground',
      def: {
        ...patch(1.5, 3000, 0xa5d6a7, undefined, 0, 0),
        dwell: { ms: 1000, effects: [{ kind: 'sleep', durationMs: 2500, wakeMul: 2 }] },
        onExpire: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }],
      },
    },
  ],
} satisfies AbilityDef

const templeTurtleXuanwu = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'wash',
  color: 0x4fc3f7,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'attach', ms: 4000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 4000 }, { kind: 'guard', mul: 0.5, durationMs: 4000 }] }],
} satisfies AbilityDef

export const abilities = { templeTurtleLotus, templeTurtleLotus2, templeTurtleLotus3, templeTurtleXuanwu } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.15 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.35 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f422',
  name: '寺龟',
  element: 'water',
  desc: '寺院池子里的老龟，走得慢、背壳硬：抛出睡莲叶，打中的敌人睡 3 秒，叫醒的那一下伤害 ×2；技能玄武让全队爬上龟背 4 秒，队友谁也选不中却照常出手，自己霸体、受到的伤害 ×0.5',
  role: 'tank',
  tags: ['defense', 'control', 'ranged'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 3.9, maxStamina: 150, staminaRegen: 42, exertion: 1.25 },
  skill: {
    name: '玄武',
    icon: '1f6e1',
    desc: '4 秒内全体队友贴在龟背上，谁也选不中，照常出手；自己霸体 4 秒，受到的伤害 ×0.5',
    cdMs: 16_000,
    ability: 'templeTurtleXuanwu',
  },
  weapons: [],
  innate: [
    {
      name: '睡莲',
      icon: '1fab7',
      base: 'templeTurtleLotus',
      upgrades: [
        { ability: 'templeTurtleLotus2', card: { icon: '1f32b', name: '池雾', desc: '睡莲叶落处起一团 1.5 格的雾，留 2.5 秒，雾里的敌人每 0.6 秒睡 1.2 秒' } },
        { ability: 'templeTurtleLotus3', card: { icon: '1f6cc', name: '龟眠', desc: '雾改成留 3 秒：在雾里连续待满 1 秒的敌人睡 2.5 秒，叫醒的那一下伤害 ×2；雾散时还在雾里的减速 50%，持续 1.5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
