import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 😎 墨镜客：闪到敌人身后挥出烫人的日光刃，点着它、晃得它打不出手；技能亮出烈日似的强光，把身边一片都点着，趁乱潜行
const shadesSlash = {
  trigger: 'auto',
  cooldownMs: 1500,
  aim: 'nearest',
  range: 5,
  damage: 21,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 260 },
  onHit: [{ kind: 'disarm', durationMs: 800 }],
} satisfies AbilityDef

const corona = { kind: 'blast', radius: 1.4, ratio: 0.5, knockback: 0, ring: ring(0xffb74d) } as const

const shadesSlash2 = { ...shadesSlash, onHit: [...shadesSlash.onHit, corona] } satisfies AbilityDef

const shadesSlash3 = { ...shadesSlash2, shape: { ...shadesSlash.shape, execute: { hpRatio: 0.35, mul: 1.8 } } } satisfies AbilityDef

const shadesFlash = {
  trigger: 'manual',
  aim: 'self',
  damage: 8,
  fireSfx: 'zap',
  color: 0xffb74d,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [{ kind: 'disarm', durationMs: 2000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 2000 }] }],
} satisfies AbilityDef

export const abilities = { shadesSlash, shadesSlash2, shadesSlash3, shadesFlash } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f60e',
  name: '墨镜客',
  element: 'fire',
  desc: '戴着墨镜不怕晃眼，本身点不着：闪到 5 格内最近的敌人身后挥出一道烫人的日光刃再闪回来，被斩中的烧起来，眼前一白 0.8 秒打不出手，烧着的还会烧到贴着的同伴；身法灵，单发的有时打不中它，范围的躲不开；技能亮出一片烈日似的强光，把身边一片都点着，趁乱隐去身形',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.7 },
  stats: { moveSpeed: 7.2, maxStamina: 85, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '强光', icon: '1f526', desc: '亮出一道烈日似的强光：5 格内的敌人各挨 8 点、被点着，致盲 2 秒；自己潜行 2 秒', cdMs: 12_000, ability: 'shadesFlash' },
  weapons: [],
  innate: [
    {
      name: '日光刃',
      icon: '1f5e1',
      base: 'shadesSlash',
      upgrades: [
        { ability: 'shadesSlash2', card: { icon: '1f525', name: '日冕', desc: '日光刃斩中时迸出一圈 1.4 格的火，旁边的敌人挨五成伤害、一起点着' } },
        { ability: 'shadesSlash3', card: { icon: '1f506', name: '烈日斩', desc: '对生命不到 35% 的敌人，日光刃伤害 ×1.8' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
