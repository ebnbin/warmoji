import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch } from '../../../kit.ts'

// 🐲 晶龙崽：一口口吐晶息攒热量，热过七成更猛并留下碎晶，热满了得歇；技能化成晶龙，换上晶石吐息与甩尾
const SHARDS = { kind: 'ground', def: patch(1.1, 2000, 0xb39ddb, undefined, 5, 400) } as const

const wyrmBreath = {
  trigger: 'auto',
  cooldownMs: 300,
  aim: 'nearest',
  range: 2.8,
  damage: 10,
  knockback: 1,
  gain: 11,
  delivery: 'melee',
  fireSfx: 'whoosh',
  color: 0xb39ddb,
  shape: { kind: 'segment', reach: 2.8, radius: 0.5, ms: 180, beam: true },
} satisfies AbilityDef

const wyrmBreath2 = { ...wyrmBreath, boost: { at: 70, spend: 0, damageMul: 1.6, onHit: [SHARDS] } } satisfies AbilityDef

const wyrmBreath3 = { ...wyrmBreath2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'gain', amount: -40 }] }] } satisfies AbilityDef

const wyrmAscend = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'shatter',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'form', to: 0, ms: 6000 }, { kind: 'gain', amount: -100 }] }],
} satisfies AbilityDef

const wyrmBlast = {
  trigger: 'auto',
  cooldownMs: 500,
  aim: 'nearest',
  range: 4,
  damage: 22,
  knockback: 2,
  delivery: 'melee',
  fireSfx: 'shatter',
  color: 0xb39ddb,
  shape: { kind: 'segment', reach: 4, radius: 0.9, ms: 220, beam: true },
  onHit: [{ kind: 'root', durationMs: 500 }, SHARDS],
} satisfies AbilityDef

const wyrmTail = {
  trigger: 'auto',
  cooldownMs: 1600,
  aim: 'nearest',
  range: 2.4,
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
  element: 'earth',
  desc: '刚从晶蛋里破壳的小龙：一口口吐出 2.8 格长的晶息，每口攒 11 点热量，停嘴 0.9 秒后才慢慢凉下来，攒满 100 就得歇 2.5 秒；技能化成晶龙 6 秒，体型变大、热量清空，换上晶石吐息与甩尾',
  role: 'bruiser',
  tags: ['damage', 'melee', 'area'],
  body: { drag: 4.8, mass: 1.3 },
  stats: { moveSpeed: 5.4, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '化龙',
    icon: '1f409',
    desc: '化成晶龙 6 秒：体型 ×1.6、热量清空；晶息换成 4 格长的晶石吐息（打中的挨 22 点、被推开、定身 0.5 秒，地上留下碎晶）与每 1.6 秒一次的甩尾（身边 2.6 格的敌人挨 30 点、被远远甩开）',
    cdMs: 18_000,
    ability: 'wyrmAscend',
  },
  weapons: [],
  innate: [
    {
      name: '晶息',
      icon: '1f48e',
      base: 'wyrmBreath',
      upgrades: [
        { ability: 'wyrmBreath2', card: { icon: '1f321', name: '晶化', desc: '热量到 70 以上时晶息伤害 ×1.6，打中的地方留下 1.1 格的碎晶 2 秒，每 0.4 秒扎 5 点' } },
        { ability: 'wyrmBreath3', card: { icon: '1f4a8', name: '泄热', desc: '晶息打死敌人时散掉 40 点热量' } },
      ],
    },
  ],
  resource: { kind: 'heat', max: 100, decay: 25, decayDelayMs: 900, full: { lockMs: 2500, reset: true } },
  forms: [{ emoji: '1f409', name: '晶龙', stats: { mul: { scale: 1.6, moveSpeed: 0.9 } }, abilities: [wyrmBlast, wyrmTail] }],
} as const satisfies CharacterAuthoring
