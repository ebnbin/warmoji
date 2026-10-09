import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🐞 瓢虫：星粉蚜弹把敌人变成一只什么都做不了的绵羊；技能撒下七颗星，把一片敌人变羊钉住
const sheep = (durationMs: number) => ({ kind: 'morph', durationMs, morphEmoji: '1f411' }) as const satisfies Effect

const ladybugSpit = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('2728', 10, 0.4), lifeMs: 1500 },
  onHit: [sheep(2500)],
} satisfies AbilityDef

const ladybugSpit2 = { ...ladybugSpit, shape: { ...ladybugSpit.shape, pierce: 1 }, onHit: [sheep(4000)] } satisfies AbilityDef

const ladybugSpit3 = { ...ladybugSpit2, onHit: [{ ...sheep(4000), vulnMul: 1.4 }] } satisfies AbilityDef

const ladybugStars = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 20,
  fireSfx: 'chirp',
  shape: { kind: 'drop', targets: 7, look: { emoji: '2b50', size: 0.8 }, fromAbove: 3, dropMs: 500, staggerMs: 90 },
  onHit: [sheep(3000), { kind: 'root', durationMs: 1500 }],
} satisfies AbilityDef

export const abilities = { ladybugSpit, ladybugSpit2, ladybugSpit3, ladybugStars } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f41e',
  name: '瓢虫',
  element: 'wood',
  desc: '背上驮着七颗星的瓢虫：星粉蚜弹把打中的敌人变成一只什么都做不了的绵羊 2.5 秒，变回来后 5 秒内不会再变，头目不会变；技能往最近的 7 个敌人头上各落一颗星，砸中的变羊 3 秒、定身 1.5 秒',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.8, maxStamina: 90, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '七星阵', icon: '2b50', desc: '在最近的 7 个敌人头上各落一颗星：砸中的挨 20 点，变成绵羊 3 秒、定身 1.5 秒；头目不会变羊，只被定身', cdMs: 14_000, ability: 'ladybugStars' },
  weapons: [],
  innate: [
    {
      name: '星粉蚜弹',
      icon: '1f41e',
      base: 'ladybugSpit',
      upgrades: [
        { ability: 'ladybugSpit2', card: { icon: '1f411', name: '长效', desc: '变羊改成 4 秒，蚜弹还能穿过 1 个敌人打中后面的' } },
        { ability: 'ladybugSpit3', card: { icon: '1f494', name: '待宰羔羊', desc: '变成绵羊的敌人受到的伤害 ×1.4' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
