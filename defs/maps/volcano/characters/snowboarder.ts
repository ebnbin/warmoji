import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🏂 单板手：滑着雪远远扔雪球，硬雪团砸得碎冻住的敌人；技能顺着坡速降，沿路把一串敌人撞飞
const snowboarderSnowball = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 7.5,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('26aa', 11, 0.4), lifeMs: 800 },
} satisfies AbilityDef

const snowboarderSnowball2 = { ...snowboarderSnowball, damage: 10, repeat: { count: 3, spreadDeg: 25 } } satisfies AbilityDef

const snowboarderSnowball3 = {
  ...snowboarderSnowball2,
  onHit: [{ kind: 'ground', def: { ...patch(0.9, 3000, 0xb3e5fc, undefined, 0, 0), traction: 0.3 } }],
} satisfies AbilityDef

const snowboarderCarve = {
  trigger: 'manual',
  aim: 'stick',
  damage: 34,
  knockback: 4,
  color: 0xb3e5fc,
  fireSfx: 'whoosh',
  breach: 0.6,
  shape: { kind: 'sprint', distance: 6, ms: 420, radius: 1 },
} satisfies AbilityDef

export const abilities = { snowboarderSnowball, snowboarderSnowball2, snowboarderSnowball3, snowboarderCarve } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f3c2',
  name: '单板手',
  desc: '踩着单板在雪坡上飞驰，身上没甲，全靠滑得快：远远扔雪球，雪团砸在冻住的敌人身上能把冰敲碎，急转时一次甩出三个，砸中的地上还结一层滑冰；技能顺着坡速降，沿路把一串敌人撞飞',
  role: 'ranged',
  tags: ['damage', 'ranged', 'mobile'],
  body: { drag: 4, mass: 0.8 },
  stats: { moveSpeed: 6.6, maxStamina: 100, staminaRegen: 75, exertion: 0.8 },
  skill: { name: '速降', icon: '26f7', desc: '朝摇杆方向速降 6 格，沿路撞飞敌人，连墙也撞开一块', cdMs: 9_000, ability: 'snowboarderCarve', aim: true },
  weapons: [],
  innate: [
    {
      name: '雪球',
      icon: '26aa',
      base: 'snowboarderSnowball',
      upgrades: [
        { ability: 'snowboarderSnowball2', card: { icon: '1f300', name: '急转', desc: '一次甩出三个雪球，散开 25 度，每个约七成伤害' } },
        { ability: 'snowboarderSnowball3', card: { icon: '26f8', name: '冰面', desc: '雪球砸中处结一层 0.9 格的滑冰，3 秒内踩上去的都站不稳' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
