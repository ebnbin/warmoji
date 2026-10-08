import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🕵️ 侦探：放大镜照到哪里，藏着的敌人就现形到哪里，线索攒够了就看穿弱点；技能让全场真相大白
const sleuthLens = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 8,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f50d', 11, 0.45), lifeMs: 900 },
  onHit: [{ kind: 'reveal', durationMs: 2000 }],
} satisfies AbilityDef

const sleuthLens2 = {
  ...sleuthLens,
  onHit: [...sleuthLens.onHit, { kind: 'stack', max: 3, durationMs: 4000, then: [{ kind: 'status', status: 'exposed', ms: 4000, value: 1.3 }] }],
} satisfies AbilityDef

const sleuthLens3 = { ...sleuthLens2, shape: { ...sleuthLens.shape, pierce: 2 } } satisfies AbilityDef

const sleuthTruth = {
  trigger: 'manual',
  aim: 'self',
  damage: 20,
  fireSfx: 'upgrade',
  color: 0xfff59d,
  fxRadius: 1.5,
  shape: { kind: 'all', of: 'foes' },
  onHit: [{ kind: 'reveal', durationMs: 6000 }, { kind: 'status', status: 'exposed', ms: 6000, value: 1.2 }],
} satisfies AbilityDef

export const abilities = { sleuthLens, sleuthLens2, sleuthLens3, sleuthTruth } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f575',
  name: '侦探',
  element: 'light',
  desc: '眼尖的侦探：放大镜照到哪里，藏着的敌人就现形到哪里，线索攒够了就看穿弱点；技能让全场真相大白',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 5.8, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '真相大白', icon: '1f526', desc: '全场的敌人各挨一下，6 秒内显形、受到的伤害 ×1.2', cdMs: 15_000, ability: 'sleuthTruth' },
  weapons: [],
  innate: [
    {
      name: '推理',
      icon: '1f50d',
      base: 'sleuthLens',
      upgrades: [
        { ability: 'sleuthLens2', card: { icon: '1f9e9', name: '线索', desc: '同一个敌人挨满 3 发，4 秒内受到的伤害 ×1.3' } },
        { ability: 'sleuthLens3', card: { icon: '1f4a1', name: '真相只有一个', desc: '放大镜能穿过 2 个敌人，打中后面的' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
