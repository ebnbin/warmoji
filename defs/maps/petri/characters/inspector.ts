import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🧐 鉴定师：举着放大镜聚出一道光，照到的一排敌人都更怕疼；技能把身边一大片敌人鉴定个遍
const inspectorLens = {
  trigger: 'auto',
  cooldownMs: 700,
  aim: 'nearest',
  range: 6,
  damage: 16,
  fireSfx: 'zap',
  color: 0xfff59d,
  shape: { kind: 'segment', reach: 6, radius: 0.4, ms: 150, beam: true },
  onHit: [{ kind: 'status', status: 'exposed', ms: 2000, value: 1.15 }],
} satisfies AbilityDef

const inspectorLens2 = {
  ...inspectorLens,
  onHit: [...inspectorLens.onHit, { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'damage', amount: 25 }] }],
} satisfies AbilityDef

const inspectorLens3 = { ...inspectorLens2, range: 7.5, shape: { ...inspectorLens2.shape, reach: 7.5 } } satisfies AbilityDef

const inspectorAppraise = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'sonar',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 7, at: 'self' },
  onHit: [
    { kind: 'reveal', durationMs: 6000 },
    { kind: 'status', status: 'exposed', ms: 6000, value: 1.3 },
  ],
} satisfies AbilityDef

export const abilities = { inspectorLens, inspectorLens2, inspectorLens3, inspectorAppraise } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d0',
  name: '鉴定师',
  element: 'light',
  desc: '举着放大镜把灯光聚成一道射出去，穿过一排敌人，照到的 2 秒内挨打更疼；技能把身边一大片敌人从里到外鉴定一遍，藏着的显形、挨打更疼',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '鉴定', icon: '1f50e', desc: '7 格内的敌人显形 6 秒，6 秒内受到的伤害 ×1.3', cdMs: 14_000, ability: 'inspectorAppraise' },
  weapons: [],
  innate: [
    {
      name: '放大镜',
      icon: '1f50d',
      base: 'inspectorLens',
      upgrades: [
        { ability: 'inspectorLens2', card: { icon: '1f3af', name: '聚焦', desc: '同一个敌人被照满三次，再补 25 点伤害' } },
        { ability: 'inspectorLens3', card: { icon: '1f52d', name: '细看', desc: '光束照到 7.5 格远' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
