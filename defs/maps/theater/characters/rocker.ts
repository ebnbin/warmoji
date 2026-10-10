import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🧑‍🎤 摇滚歌手：本身是雷；电吉他一扫，身前一片挨电、被打断，电流再跳到旁边一个；技能来一段终极 solo，一圈圈炸电、把敌人从身边推开
const rockerRiff = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 3,
  damage: 12,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'sector', radius: 3, arcDeg: 90, ms: 200 },
} satisfies AbilityDef

const feedback = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 5,
  damage: 14,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 4, hopRange: 3, decay: 0.8 },
} satisfies AbilityDef

const rockerRiff2 = { ...rockerRiff, cycle: [rockerRiff, feedback] } satisfies AbilityDef

const wideRiff = { ...rockerRiff, range: 3.8, shape: { kind: 'sector', radius: 3.8, arcDeg: 120, ms: 220 } } satisfies AbilityDef

const rockerRiff3 = { ...wideRiff, cycle: [wideRiff, feedback] } satisfies AbilityDef

const rockerSolo = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  shape: {
    kind: 'zone',
    radius: 3.5,
    durationMs: 5000,
    pulse: { intervalMs: 800, onHit: [{ kind: 'damage', amount: 12 }, { kind: 'shove', distance: 1.5, ms: 250 }] },
    visual: zoneLook(0xffd54f),
  },
} satisfies AbilityDef

export const abilities = { rockerRiff, rockerRiff2, rockerRiff3, rockerSolo } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2 } }, { add: { maxHp: 25 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f3a4',
  name: '摇滚歌手',
  element: 'thunder',
  desc: '抱着电吉他的摇滚歌手，本身是雷、电流传不到他身上：一扫弦身前一片挨电，挨的都被打断，电流再跳到 2.5 格内另一个敌人，湿的连成一片一起挨；技能来一段终极 solo，一圈圈炸电，把敌人从身边推开',
  role: 'area',
  tags: ['damage', 'area', 'melee'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.4, maxStamina: 110, staminaRegen: 65, exertion: 1 },
  skill: { name: '终极 solo', icon: '1f3a4', desc: '在脚下响起 3.5 格的声浪 5 秒：每 0.8 秒炸一圈电，圈里的敌人各挨一下、被打断，电流再往外跳，随后被从自己身边推开 1.5 格', cdMs: 14_000, ability: 'rockerSolo' },
  weapons: [],
  innate: [
    {
      name: '电吉他',
      icon: '1f3b8',
      base: 'rockerRiff',
      upgrades: [
        { ability: 'rockerRiff2', card: { icon: '26a1', name: '回授', desc: '每第三下改成一道电弧，在 3 格内连跳 4 次，每跳一次伤害打八折' } },
        { ability: 'rockerRiff3', card: { icon: '1f941', name: '重低音', desc: '扫得更远更宽：3.8 格、120 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
