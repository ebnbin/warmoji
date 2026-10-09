import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 😎 墨镜客：闪到敌人身后挥出日光刃，晃得人打不出手；技能亮出强光，趁乱潜行
const shadesSlash = {
  trigger: 'auto',
  cooldownMs: 1500,
  aim: 'nearest',
  range: 5,
  damage: 28,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 260 },
  onHit: [{ kind: 'disarm', durationMs: 800 }],
} satisfies AbilityDef

const shadesSlash2 = { ...shadesSlash, onHit: [...shadesSlash.onHit, { kind: 'status', status: 'exposed', ms: 3000, value: 1.25 }] } satisfies AbilityDef

const shadesSlash3 = { ...shadesSlash2, shape: { ...shadesSlash.shape, execute: { hpRatio: 0.35, mul: 1.8 } } } satisfies AbilityDef

const shadesFlash = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [{ kind: 'disarm', durationMs: 2000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 2000 }] }],
} satisfies AbilityDef

export const abilities = { shadesSlash, shadesSlash2, shadesSlash3, shadesFlash } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f60e',
  name: '墨镜客',
  desc: '戴着墨镜不怕晃眼：闪到 5 格内最近的敌人身后挥出一道日光刃再闪回来，被照到的眼前一白，0.8 秒打不出手；技能亮出一片强光，趁乱隐去身形',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.7 },
  stats: { moveSpeed: 7.2, maxStamina: 85, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '强光', icon: '1f526', desc: '亮出一道强光：5 格内的敌人致盲 2 秒，自己潜行 2 秒', cdMs: 12_000, ability: 'shadesFlash' },
  weapons: [],
  innate: [
    {
      name: '日光刃',
      icon: '1f5e1',
      base: 'shadesSlash',
      upgrades: [
        { ability: 'shadesSlash2', card: { icon: '1fa9e', name: '反光', desc: '被日光刃斩中的敌人 3 秒内受到的伤害 ×1.25' } },
        { ability: 'shadesSlash3', card: { icon: '1f506', name: '烈日斩', desc: '对生命不到 35% 的敌人，日光刃伤害 ×1.8' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
