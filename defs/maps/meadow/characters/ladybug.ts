import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🐞 瓢虫：吐黏糊糊的蚜弹，同一个敌人挨满三发就被粘在原地；技能撒下七颗星把一片敌人钉住
const ladybugSpit = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 6.5,
  damage: 11,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f7e2', 10, 0.32), lifeMs: 1500 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'root', durationMs: 1000 }] }],
} satisfies AbilityDef

const ladybugSpit2 = { ...ladybugSpit, onHit: [{ kind: 'slow', factor: 0.75, durationMs: 1000 }, ...ladybugSpit.onHit] } satisfies AbilityDef

const ladybugSpit3 = {
  ...ladybugSpit,
  onHit: [{ kind: 'slow', factor: 0.75, durationMs: 1000 }, { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'root', durationMs: 1500 }, { kind: 'damage', amount: 0, ratio: 1 }] }],
} satisfies AbilityDef

const ladybugStars = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 20,
  fireSfx: 'chirp',
  shape: { kind: 'drop', targets: 7, look: { emoji: '2b50', size: 0.8 }, fromAbove: 3, dropMs: 500, staggerMs: 90 },
  onHit: [{ kind: 'root', durationMs: 1500 }],
} satisfies AbilityDef

export const abilities = { ladybugSpit, ladybugSpit2, ladybugSpit3, ladybugStars } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f41e',
  name: '瓢虫',
  element: 'wood',
  desc: '吐黏糊糊的蚜弹，同一个敌人挨满三发就被粘在原地；技能撒下七颗星，把一片敌人钉住',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.8, maxStamina: 90, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '七星阵', icon: '2b50', desc: '在最近的七个敌人头上各落一颗星，砸中的定身 1.5 秒', cdMs: 13_000, ability: 'ladybugStars' },
  weapons: [],
  innate: [
    {
      name: '蚜弹',
      icon: '1f41e',
      base: 'ladybugSpit',
      upgrades: [
        { ability: 'ladybugSpit2', card: { icon: '1f4a7', name: '黏液', desc: '打中的敌人减速 25% 1 秒' } },
        { ability: 'ladybugSpit3', card: { icon: '2b50', name: '七星', desc: '挨满三发时定身改成 1.5 秒，再补一下等于这一发的伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
