import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🐧 企鹅：远远扔出冻得梆硬的鱼，一次扔三条，同一个敌人挨满三条就冻住；招来一场冰雹
const emperorPenguinFish = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 7.5,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f41f', 11, 0.45), lifeMs: 1100 },
} satisfies AbilityDef

// 同时散开的几发不按 repeat.ratio 打折
const emperorPenguinFish2 = { ...emperorPenguinFish, damage: 10, repeat: { count: 3, spreadDeg: 20 } } satisfies AbilityDef

const emperorPenguinFish3 = {
  ...emperorPenguinFish2,
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'status', status: 'frozen', ms: 800 }] }],
} satisfies AbilityDef

const emperorPenguinHail = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 22,
  fireSfx: 'tink',
  shape: { kind: 'drop', targets: 6, look: { emoji: '1f539', size: 0.8 }, fromAbove: 4, dropMs: 500, staggerMs: 100 },
  onHit: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }],
} satisfies AbilityDef

export const abilities = { emperorPenguinFish, emperorPenguinFish2, emperorPenguinFish3, emperorPenguinHail } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f427',
  name: '企鹅',
  element: 'water',
  desc: '一摇一摆的帝企鹅，远远扔出冻得梆硬的鱼；技能招来一场冰雹，砸中的敌人走不动',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.7 },
  stats: { moveSpeed: 5.2, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '冰雹', icon: '1f539', desc: '在最近的六个敌人头上各落一颗冰雹，每颗 22 点伤害，砸中的减速 50%，持续 1.5 秒', cdMs: 11_000, ability: 'emperorPenguinHail' },
  weapons: [],
  innate: [
    {
      name: '冰鱼',
      icon: '1f41f',
      base: 'emperorPenguinFish',
      upgrades: [
        { ability: 'emperorPenguinFish2', card: { icon: '1f420', name: '群射', desc: '一次扔出三条鱼，散开 20 度，每条 10 点伤害' } },
        { ability: 'emperorPenguinFish3', card: { icon: '2744', name: '冻鱼', desc: '同一个敌人 3 秒内挨满三条就冻结 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
