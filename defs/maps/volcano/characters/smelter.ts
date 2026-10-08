import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch, zoneLook } from '../../../kit.ts'

// 🧑‍🏭 炉工：抡锤扫开身前一片，第三锤在脚下砸出一滩熔铁；技能烧旺炉心，把身边的敌人都引到自己身上
const smelterHammer = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 1.9,
  damage: 17,
  knockback: 2.5,
  fireSfx: 'clank',
  shape: { kind: 'sector', radius: 1.8, arcDeg: 110, ms: 200 },
} satisfies AbilityDef

const smelterHammer2 = { ...smelterHammer, reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.04, ms: 2000 }] }] } satisfies AbilityDef

const smelterSlag = { ...smelterHammer2, onHit: [{ kind: 'ground', def: patch(1.2, 3000, 0xff7043, undefined, 4, 400) }] } satisfies AbilityDef

const smelterHammer3 = { ...smelterHammer2, cycle: [smelterHammer2, smelterSlag] } satisfies AbilityDef

const smelterCore = {
  trigger: 'manual',
  aim: 'self',
  damage: 8,
  fireSfx: 'ignite',
  shape: { kind: 'zone', radius: 3, durationMs: 5000, tickMs: 500, visual: zoneLook(0xff7043) },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [{ kind: 'to', who: { side: 'foes', radius: 4 }, then: [{ kind: 'taunt', durationMs: 2500 }] }, { kind: 'guard', mul: 0.6, durationMs: 5000 }],
    },
  ],
} satisfies AbilityDef

export const abilities = { smelterHammer, smelterHammer2, smelterHammer3, smelterCore } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 25, armor: 2 }, mul: { damage: 1.2 } }, { add: { maxHp: 60, armor: 4 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f3ed',
  name: '炉工',
  element: 'fire',
  desc: '守着熔炉的炉工，不怕岩浆：抡锤扫开身前一片，淬过火的锤每抡一下都给自己挂一层护盾，第三锤在脚下砸出一滩熔铁；技能烧旺炉心，把身边的敌人都引到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  traits: ['fireproof'],
  body: { drag: 5.5, mass: 1.7 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: {
    name: '炉心',
    icon: '1f3ed',
    desc: '烧旺炉心：在脚下烧起 3 格的炉火 5 秒，圈里的敌人每半秒烫一下；开炉时 4 格内的敌人嘲讽 2.5 秒，自己 5 秒内受到的伤害 ×0.6',
    cdMs: 14_000,
    ability: 'smelterCore',
  },
  weapons: [],
  innate: [
    {
      name: '铁锤',
      icon: '1f528',
      base: 'smelterHammer',
      upgrades: [
        { ability: 'smelterHammer2', card: { icon: '1f6e1', name: '淬火', desc: '每抡一锤给自己挂一层生命 4% 的护盾 2 秒' } },
        { ability: 'smelterHammer3', card: { icon: '1f525', name: '熔铁', desc: '每第三锤砸中敌人时在脚下砸出一滩 1.2 格的熔铁，烧 3 秒，每 0.4 秒烫一下' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
