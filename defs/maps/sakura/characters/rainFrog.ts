import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring } from '../../../kit.ts'

// 🐸 雨蛙：吐出的水泡落到敌人身上炸开一圈，把扎堆的敌人一齐浇湿；技能在敌人头上落一片梅雨，雨里的敌人一直是湿的
const pop = (radius: number) => [{ kind: 'blast', radius, ratio: 1, knockback: 0, ring: ring(0x4fc3f7) }] as const

const rainFrogBubble = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 6.5,
  damage: 13,
  fireSfx: 'bubble',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1fae7', size: 0.6 }, fromAbove: 2.5, dropMs: 450, staggerMs: 0 },
  onHit: pop(1.4),
} satisfies AbilityDef

const rainFrogBubble2 = { ...rainFrogBubble, onHit: pop(1.9) } satisfies AbilityDef

const rainFrogBubble3 = { ...rainFrogBubble2, repeat: { count: 2, delayMs: 300 } } satisfies AbilityDef

const rainFrogRain = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 10,
  fireSfx: 'wash',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f327', size: 1.6 }, fromAbove: 3, dropMs: 600, staggerMs: 0 },
  onHit: [{ kind: 'ground', def: patch(3.5, 6000, 0x64b5f6, undefined, 4, 500) }],
} satisfies AbilityDef

export const abilities = { rainFrogBubble, rainFrogBubble2, rainFrogBubble3, rainFrogRain } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f438',
  name: '雨蛙',
  element: 'water',
  desc: '叫来雨水的雨蛙：吐出的水泡落到最近的敌人身上炸开，溅到身边一圈的敌人，溅到的都被浇湿 5 秒，烧着的被浇灭；水泡伤害不高，图的是把扎堆的敌人一齐浇湿，好让队友一冰冻一片、一电电一片；本身一直是湿的，点不着火，却一冰就冻、一电就麻；技能在敌人头上落一片梅雨，雨里的敌人一直挨淋、一直是湿的',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 0.95 },
  skill: {
    name: '梅雨',
    icon: '1f327',
    desc: '在 8 格内最近的敌人头上落一片 3.5 格的梅雨，6 秒内雨里的敌人每半秒挨一下，一直是湿的',
    cdMs: 14_000,
    ability: 'rainFrogRain',
  },
  weapons: [],
  innate: [
    {
      name: '水泡',
      icon: '1fae7',
      base: 'rainFrogBubble',
      upgrades: [
        { ability: 'rainFrogBubble2', card: { icon: '1f388', name: '大泡泡', desc: '水泡炸开的范围从 1.4 格扩到 1.9 格' } },
        { ability: 'rainFrogBubble3', card: { icon: '1f3b6', name: '回音', desc: '一次吐两颗水泡，第二颗隔 0.3 秒落到最近的敌人身上' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
