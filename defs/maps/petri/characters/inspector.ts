import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🧐 鉴定师：举着放大镜聚出一道光，照到的一排敌人都更怕疼，照 6 下就得换电池；技能侧身翻滚，滚前先把身边的敌人看个透，可以攒着用
const inspectorLens = {
  trigger: 'auto',
  cooldownMs: 400,
  aim: 'nearest',
  range: 6,
  damage: 13,
  fireSfx: 'zap',
  color: 0xfff59d,
  shape: { kind: 'segment', reach: 6, radius: 0.4, ms: 150, beam: true },
  onHit: [{ kind: 'status', status: 'exposed', ms: 2000, value: 1.15 }],
  ammo: { count: 6, reloadMs: 1500 },
} satisfies AbilityDef

const inspectorLens2 = { ...inspectorLens, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'skill' }] }] } satisfies AbilityDef

const inspectorLens3 = { ...inspectorLens2, ammo: { ...inspectorLens.ammo, last: [{ kind: 'stun', durationMs: 600 }] } } satisfies AbilityDef

const inspectorRoll = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  charges: 3,
  shape: { kind: 'sprint', distance: 3, ms: 200 },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'invuln', ms: 250 },
        { kind: 'to', who: { side: 'foes', radius: 4 }, then: [{ kind: 'reveal', durationMs: 4000 }, { kind: 'status', status: 'exposed', ms: 4000, value: 1.2 }] },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { inspectorLens, inspectorLens2, inspectorLens3, inspectorRoll } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d0',
  name: '鉴定师',
  element: 'light',
  desc: '举着放大镜把手电的光聚成一道射出去，穿过 6 格内的一排敌人，照到的 2 秒内挨打更疼；连照 6 下就得花 1.5 秒换电池；技能侧身翻滚，滚前先把身边的敌人看个透，最多攒 3 次',
  role: 'ranged',
  tags: ['damage', 'ranged', 'mobile'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '侧滚取证',
    icon: '1f50e',
    desc: '先把 4 格内的敌人看个透：显形 4 秒，4 秒内受到的伤害 ×1.2；再朝摇杆方向翻滚 3 格，0.25 秒内无敌；最多攒 3 次，每次单独回复',
    cdMs: 9_000,
    ability: 'inspectorRoll',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '放大镜',
      icon: '1f50d',
      base: 'inspectorLens',
      upgrades: [
        { ability: 'inspectorLens2', card: { icon: '1f4c1', name: '结案', desc: '光束照死敌人时补回一次翻滚' } },
        { ability: 'inspectorLens3', card: { icon: '1f4a1', name: '强光', desc: '每次换电池前的最后一下晃得敌人眩晕 0.6 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
