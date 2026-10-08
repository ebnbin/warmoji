import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🦊 狐仙：放出追着敌人飞的狐火，同一个敌人挨满三团就被迷住；技能一回眸，身边的敌人都被迷住
const foxSpiritFire = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 7,
  damage: 12,
  fireSfx: 'ignite',
  shape: { kind: 'bolt', projectile: { ...shot('1f525', 7, 0.45, 270), flight: { kind: 'homing', degPerSec: 180 } }, lifeMs: 1800 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'charm', durationMs: 1500 }] }],
} satisfies AbilityDef

const foxSpiritFire2 = { ...foxSpiritFire, damage: 9, repeat: { count: 2, spreadDeg: 30 } } satisfies AbilityDef

const foxSpiritFire3 = {
  ...foxSpiritFire2,
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'charm', durationMs: 2000 }, { kind: 'status', status: 'exposed', ms: 3000, value: 1.2 }] }],
} satisfies AbilityDef

const foxSpiritCharm = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'chirp',
  color: 0xff80ab,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'charm', durationMs: 2500 }],
} satisfies AbilityDef

export const abilities = { foxSpiritFire, foxSpiritFire2, foxSpiritFire3, foxSpiritCharm } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98a',
  name: '狐仙',
  element: 'fire',
  desc: '修行千年的狐仙：放出追着敌人飞的狐火，同一个敌人 3 秒内挨满三团就被迷得朝她走过来；技能一回眸，身边的敌人都被迷住',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 4.5, mass: 0.6 },
  stats: { moveSpeed: 6.2, maxStamina: 90, staminaRegen: 80, exertion: 0.85 },
  skill: { name: '倾城', icon: '1f33a', desc: '身周 4 格内的敌人都被迷住 2.5 秒，朝你走过来', cdMs: 13_000, ability: 'foxSpiritCharm' },
  weapons: [],
  innate: [
    {
      name: '狐火',
      icon: '1f525',
      base: 'foxSpiritFire',
      upgrades: [
        { ability: 'foxSpiritFire2', card: { icon: '1f98a', name: '九尾', desc: '一次放出两团狐火，散开 30 度，每团伤害从 12 降到 9' } },
        { ability: 'foxSpiritFire3', card: { icon: '1f48b', name: '倾心', desc: '挨满三团时改为迷住 2 秒，并在 3 秒内受到的伤害 ×1.2' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
