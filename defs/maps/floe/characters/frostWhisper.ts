import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🥶 霜语者：寒语让敌人越走越慢，同一个敌人挨满三下就冻成冰块；绝对零度把身边冻成一片
const chill = (frozenMs: number) =>
  [
    { kind: 'slow', factor: 0.75, durationMs: 1000 },
    { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'status', status: 'frozen', ms: frozenMs }] },
  ] as const

const frostWhisperChill = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'tink',
  shape: { kind: 'bolt', projectile: shot('1f300', 9, 0.4), lifeMs: 1300 },
  onHit: chill(1200),
} satisfies AbilityDef

const frostWhisperChill2 = { ...frostWhisperChill, onHit: chill(1800) } satisfies AbilityDef

const frostWhisperChill3 = { ...frostWhisperChill2, repeat: { count: 2, spreadDeg: 15 } } satisfies AbilityDef

const frostWhisperZero = {
  trigger: 'manual',
  aim: 'self',
  damage: 15,
  fireSfx: 'shatter',
  color: 0x81d4fa,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'status', status: 'frozen', ms: 2000 }],
} satisfies AbilityDef

export const abilities = { frostWhisperChill, frostWhisperChill2, frostWhisperChill3, frostWhisperZero } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.45, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f976',
  name: '霜语者',
  element: 'ice',
  desc: '说话都冒寒气的霜语者：低声一句寒语打过去，敌人越走越慢，3 秒内挨满三下就冻成冰块；技能绝对零度把身边冻成一片',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.6, maxStamina: 90, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '绝对零度', icon: '1f321', desc: '身周 4.5 格内的敌人吃 15 点伤害并冻结 2 秒', cdMs: 14_000, ability: 'frostWhisperZero' },
  weapons: [],
  innate: [
    {
      name: '寒语',
      icon: '1f300',
      base: 'frostWhisperChill',
      upgrades: [
        { ability: 'frostWhisperChill2', card: { icon: '1f9ca', name: '霜冻', desc: '挨满三下时冻结改成 1.8 秒' } },
        { ability: 'frostWhisperChill3', card: { icon: '1f4ac', name: '低语', desc: '一次打出两道寒语，散开 15 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
