import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch } from '../../../kit.ts'

// 🐲 晶龙崽：本身是火，一口口吐晶焰点着成排的敌人，挤在一起的一个烧一个；攒热量，热过七成更猛并在地上留火，热满了得歇；技能化成晶龙，鳞甲加厚，喷龙焰烧地，甩尾是实打实的物理
const EMBERS = { kind: 'ground', def: patch(1.1, 2000, 0xff7043, undefined, 4, 400) } as const

const wyrmBreath = {
  trigger: 'auto',
  cooldownMs: 300,
  aim: 'nearest',
  range: 2.8,
  damage: 8,
  gain: 11,
  delivery: 'melee',
  fireSfx: 'whoosh',
  color: 0xff7043,
  shape: { kind: 'segment', reach: 2.8, radius: 0.5, ms: 180, beam: true },
} satisfies AbilityDef

const wyrmBreath2 = { ...wyrmBreath, boost: { at: 70, spend: 0, damageMul: 1.6, onHit: [EMBERS] } } satisfies AbilityDef

const wyrmBreath3 = { ...wyrmBreath2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'gain', amount: -40 }] }] } satisfies AbilityDef

const wyrmAscend = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'ignite',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'form', to: 0, ms: 6000 }, { kind: 'gain', amount: -100 }] }],
} satisfies AbilityDef

const wyrmBlast = {
  trigger: 'auto',
  cooldownMs: 500,
  aim: 'nearest',
  range: 4,
  damage: 18,
  delivery: 'melee',
  fireSfx: 'ignite',
  color: 0xff7043,
  shape: { kind: 'segment', reach: 4, radius: 0.9, ms: 220, beam: true },
  onHit: [{ kind: 'root', durationMs: 500 }, EMBERS],
} satisfies AbilityDef

const wyrmTail = {
  trigger: 'auto',
  cooldownMs: 1600,
  aim: 'nearest',
  range: 2.4,
  element: 'physical',
  damage: 30,
  knockback: 10,
  fireSfx: 'whoosh',
  shape: { kind: 'sector', radius: 2.6, arcDeg: 360, ms: 300 },
} satisfies AbilityDef

export const abilities = { wyrmBreath, wyrmBreath2, wyrmBreath3, wyrmAscend } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, armor: 2 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f432',
  name: '晶龙崽',
  element: 'fire',
  desc: '刚从晶蛋里破壳的小龙，本身是火，点不着、不怕岩浆：一口口吐出 2.8 格长的晶焰，一口能烧穿一排，打中的都着火，挤在一起的敌人一个烧一个；打在发冷的身上只化冰、打在湿的身上只蒸干；每口攒 11 点热量，停嘴 0.9 秒后才慢慢凉下来，攒满 100 就得歇 2.5 秒，歇着的时候最怕被围；技能化成晶龙 6 秒，体型变大、鳞甲加厚、热量清空，换上龙焰与甩尾',
  role: 'bruiser',
  tags: ['damage', 'melee', 'area'],
  body: { drag: 4.8, mass: 1.3 },
  stats: { moveSpeed: 5.4, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '化龙',
    icon: '1f409',
    desc: '化成晶龙 6 秒：体型 ×1.6、护甲 +4、热量清空；晶焰换成 4 格长的龙焰（打中的挨 18 点、着火、定身 0.5 秒，地上烧起一片火）与每 1.6 秒一次的甩尾（物理，身边 2.6 格的敌人挨 30 点、被远远甩开，冻住的当场碎冰）',
    cdMs: 18_000,
    ability: 'wyrmAscend',
  },
  weapons: [],
  innate: [
    {
      name: '晶焰',
      icon: '1f525',
      base: 'wyrmBreath',
      upgrades: [
        { ability: 'wyrmBreath2', card: { icon: '1f321', name: '焚晶', desc: '热量到 70 以上时晶焰伤害 ×1.6，打中的地方烧起 1.1 格的火 2 秒，每 0.4 秒烫 4 点，站在火里的一直烧着' } },
        { ability: 'wyrmBreath3', card: { icon: '1f4a8', name: '泄热', desc: '晶焰打死敌人时散掉 40 点热量' } },
      ],
    },
  ],
  resource: { kind: 'heat', max: 100, decay: 25, decayDelayMs: 900, full: { lockMs: 2500, reset: true } },
  forms: [{ emoji: '1f409', name: '晶龙', stats: { add: { armor: 4 }, mul: { scale: 1.6, moveSpeed: 0.9 } }, abilities: [wyrmBlast, wyrmTail] }],
} as const satisfies CharacterAuthoring
