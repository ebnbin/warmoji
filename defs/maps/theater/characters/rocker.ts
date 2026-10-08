import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🧑‍🎤 摇滚歌手：电吉他一扫震开身前一片；技能在脚下来一段终极 solo，圈里的敌人被声浪从他身边推开
const rockerRiff = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 3,
  damage: 15,
  knockback: 1.5,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'sector', radius: 3, arcDeg: 90, ms: 200 },
} satisfies AbilityDef

const rockerRiff2 = { ...rockerRiff, onHit: [{ kind: 'stun', durationMs: 250 }] } satisfies AbilityDef

const rockerRiff3 = { ...rockerRiff2, range: 3.8, shape: { kind: 'sector', radius: 3.8, arcDeg: 120, ms: 220 } } satisfies AbilityDef

const rockerSolo = {
  trigger: 'manual',
  aim: 'self',
  damage: 8,
  fireSfx: 'zap',
  shape: {
    kind: 'zone',
    radius: 3.5,
    durationMs: 5000,
    tickMs: 400,
    pulse: { intervalMs: 1000, onHit: [{ kind: 'shove', distance: 1.5, ms: 250 }] },
    visual: zoneLook(0xffd54f),
  },
} satisfies AbilityDef

export const abilities = { rockerRiff, rockerRiff2, rockerRiff3, rockerSolo } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, knockback: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, knockback: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f3a4',
  name: '摇滚歌手',
  element: 'thunder',
  desc: '抱着电吉他的摇滚歌手：一扫弦震开身前一片敌人；技能在脚下来一段终极 solo，圈里的敌人一边挨打一边被声浪推开',
  role: 'area',
  tags: ['damage', 'area', 'melee'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.4, maxStamina: 110, staminaRegen: 65, exertion: 1 },
  skill: { name: '终极 solo', icon: '1f3a4', desc: '在脚下响起 3.5 格的声浪 5 秒：圈里的敌人每 0.4 秒挨一下，每秒被从自己身边推开 1.5 格', cdMs: 14_000, ability: 'rockerSolo' },
  weapons: [],
  innate: [
    {
      name: '电吉他',
      icon: '1f3b8',
      base: 'rockerRiff',
      upgrades: [
        { ability: 'rockerRiff2', card: { icon: '1f50a', name: '失真', desc: '扫到的敌人麻 0.25 秒' } },
        { ability: 'rockerRiff3', card: { icon: '1f941', name: '重低音', desc: '扫得更远更宽：3.8 格、120 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
