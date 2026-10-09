import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐭 小白鼠：扑上去咬两口，再转着尾巴卷起一道旋风把一排敌人挑上天；技能只对空中的敌人出手，钻到它身后狠咬一口再挑高
const labMouseBite = {
  trigger: 'auto',
  cooldownMs: 650,
  aim: 'nearest',
  range: 2.6,
  damage: 16,
  knockback: 2,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 1.6, radius: 0.45, ms: 160, lungeDist: 0.5 },
  onHit: [{ kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 3000 }],
} satisfies AbilityDef

const knockup = { kind: 'knockup', durationMs: 750, height: 1.3 } as const

const gale = {
  ...labMouseBite,
  range: 5,
  knockback: 0,
  fireSfx: 'gust',
  color: 0xb3e5fc,
  shape: { kind: 'segment', reach: 5, radius: 0.6, ms: 220, beam: true },
  onHit: [knockup],
} satisfies AbilityDef

const galeWall = { kind: 'barrier', shape: 'wall', length: 3, offset: 1.5, durationMs: 2000, bodies: 'none', shots: true, color: 0xb3e5fc } as const

const gale2 = { ...gale, reactions: [{ on: 'fire', to: 'self', effects: [galeWall] }] } satisfies AbilityDef

const gale3 = { ...gale2, onHit: [{ ...knockup, onLand: [{ kind: 'stun', durationMs: 700 }] }] } satisfies AbilityDef

const labMouseCombo = { ...labMouseBite, cycle: [labMouseBite, gale] } satisfies AbilityDef

const labMouseCombo2 = { ...labMouseBite, cycle: [labMouseBite, gale2] } satisfies AbilityDef

const labMouseCombo3 = { ...labMouseBite, cycle: [labMouseBite, gale3] } satisfies AbilityDef

const labMouseLunge = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  requires: { kind: 'airborne', who: 'target' },
  damage: 50,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 450 },
  onHit: [{ kind: 'knockup', durationMs: 700, height: 1.6 }],
} satisfies AbilityDef

export const abilities = { labMouseCombo, labMouseCombo2, labMouseCombo3, labMouseLunge } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f42d',
  name: '小白鼠',
  desc: '从实验室里逃出来的小白鼠：扑上去咬两口，咬过的 3 秒里慢慢中毒，第三下转着尾巴卷起一道 5 格长的旋风，把一排敌人挑上天 0.75 秒；技能只对空中的敌人出手，钻到它身后狠咬一口再挑高',
  role: 'assassin',
  tags: ['damage', 'control', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.5 },
  stats: { moveSpeed: 7.4, maxStamina: 85, staminaRegen: 95, exertion: 0.7 },
  skill: {
    name: '腾空追咬',
    icon: '1f32a',
    desc: '只对空中的敌人出手：钻到 8 格内一个被挑上天的敌人身后狠咬一口，打 50 点，再把它挑高 0.7 秒',
    cdMs: 9_000,
    ability: 'labMouseLunge',
  },
  weapons: [],
  innate: [
    {
      name: '实验品',
      icon: '1f42d',
      base: 'labMouseCombo',
      upgrades: [
        { ability: 'labMouseCombo2', card: { icon: '1f32c', name: '断风', desc: '旋风过处立起一道 3 格长的风墙 2 秒，吞掉敌方的弹体' } },
        { ability: 'labMouseCombo3', card: { icon: '26a1', name: '落地惊雷', desc: '被旋风挑上天的敌人落地时眩晕 0.7 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
