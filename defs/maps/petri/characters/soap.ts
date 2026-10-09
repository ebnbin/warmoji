import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring } from '../../../kit.ts'

// 🧼 肥皂：泡泡落到敌人头上炸开一片，落点留一滩打滑的泡沫；技能一把大扫除把身前的敌人推开
const FOAM = 0xe1f5fe
const pop = (radius: number) => ({ kind: 'blast', radius, ratio: 1, knockback: 0, ring: ring(FOAM) }) as const
const foam = { ...patch(1.2, 2000, FOAM), traction: 0.4 }
const slick = { ...foam, effects: [{ kind: 'slow', factor: 0.7, durationMs: 500 }] } as const

const soapBubble = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 6,
  damage: 16,
  fireSfx: 'bubble',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f535', size: 0.6 }, fromAbove: 2.5, dropMs: 350, staggerMs: 0 },
  onHit: [pop(1.5), { kind: 'ground', def: foam }],
} satisfies AbilityDef

const soapBubble2 = { ...soapBubble, onHit: [pop(2), { kind: 'ground', def: foam }] } satisfies AbilityDef

const soapBubble3 = { ...soapBubble, onHit: [pop(2), { kind: 'ground', def: slick }] } satisfies AbilityDef

const soapScrub = {
  trigger: 'manual',
  aim: 'nearest',
  range: 5,
  damage: 35,
  fireSfx: 'wash',
  color: 0x81d4fa,
  shape: { kind: 'sector', radius: 5, arcDeg: 120, ms: 240 },
  onHit: [
    { kind: 'shove', distance: 3, ms: 320 },
    { kind: 'attune', element: 'water', ms: 4000 },
  ],
} satisfies AbilityDef

export const abilities = { soapBubble, soapBubble2, soapBubble3, soapScrub } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2 } }, { add: { maxHp: 25 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9fc',
  name: '肥皂',
  element: 'water',
  desc: '吹出泡泡落到最近的敌人头上炸开一片，落点留下一滩滑溜溜的泡沫，谁踩上去都站不稳；技能一把大扫除，把身前一大片敌人推开、浇成水元素',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 4.2, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '大扫除', icon: '1f9f9', desc: '朝最近的敌人扫出 5 格、120 度的一大片：每个挨一下、被推开 3 格，4 秒内变成水元素', cdMs: 12_000, ability: 'soapScrub' },
  weapons: [],
  innate: [
    {
      name: '泡泡',
      icon: '1f9fc',
      base: 'soapBubble',
      upgrades: [
        { ability: 'soapBubble2', card: { icon: '1f4ad', name: '泡沫', desc: '泡泡炸开的范围从 1.5 格扩到 2 格' } },
        { ability: 'soapBubble3', card: { icon: '1f6c1', name: '打滑', desc: '踩在泡沫上的敌人减速 30%' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
