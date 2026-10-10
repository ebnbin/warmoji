import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🐞 瓢虫：带毒的星粉蚜弹叠一层毒，还把敌人变成一只什么都做不了的绵羊；技能撒下七颗星，把一片敌人变羊钉在毒粉里
const sheep = (durationMs: number) => ({ kind: 'morph', durationMs, morphEmoji: '1f411' }) as const satisfies Effect

const ladybugSpit = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('2728', 10, 0.4), lifeMs: 1500 },
  onHit: [sheep(2500)],
} satisfies AbilityDef

const ladybugSpit2 = { ...ladybugSpit, shape: { ...ladybugSpit.shape, pierce: 1 }, onHit: [sheep(4000)] } satisfies AbilityDef

const ladybugSpit3 = { ...ladybugSpit2, onHit: [sheep(5000)] } satisfies AbilityDef

const ladybugStars = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 16,
  fireSfx: 'chirp',
  shape: { kind: 'drop', targets: 7, look: { emoji: '2b50', size: 0.8 }, fromAbove: 3, dropMs: 500, staggerMs: 90 },
  onHit: [sheep(3000), { kind: 'root', durationMs: 1500 }, { kind: 'ground', def: patch(1.2, 4000, 0x9ccc65, undefined, 2, 500) }],
} satisfies AbilityDef

export const abilities = { ladybugSpit, ladybugSpit2, ladybugSpit3, ladybugStars } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f41e',
  name: '瓢虫',
  element: 'poison',
  desc: '背上驮着七颗星的瓢虫，背壳硬、本身不会中毒：星粉蚜弹带毒，打中叠一层中毒，还把敌人变成一只什么都做不了的绵羊 2.5 秒，变回来后 5 秒内不会再变，头目不会变；技能往最近的 7 个敌人头上各落一颗星，砸中的变羊 3 秒、定身 1.5 秒，落处留下一团毒粉，火一点就炸',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.8, maxStamina: 90, staminaRegen: 75, exertion: 0.9, armor: 4 },
  skill: {
    name: '七星阵',
    icon: '2b50',
    desc: '在最近的 7 个敌人头上各落一颗星：砸中的挨 16 点、叠一层中毒，变成绵羊 3 秒、定身 1.5 秒；落处留下一团 1.2 格的毒粉 4 秒，里面的敌人每半秒掉 2 点血、叠一层中毒；头目不会变羊，只被定身',
    cdMs: 14_000,
    ability: 'ladybugStars',
  },
  weapons: [],
  innate: [
    {
      name: '星粉蚜弹',
      icon: '1f41e',
      base: 'ladybugSpit',
      upgrades: [
        { ability: 'ladybugSpit2', card: { icon: '1f411', name: '长效', desc: '变羊改成 4 秒，蚜弹还能穿过 1 个敌人打中后面的' } },
        { ability: 'ladybugSpit3', card: { icon: '1f494', name: '待宰羔羊', desc: '变羊再延长到 5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
