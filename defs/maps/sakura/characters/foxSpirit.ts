import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🦊 狐仙：放出追着敌人飞的狐火，同一个敌人挨满三团就被迷住；技能一回眸迷住身边，化出两只分身替她挨打，自己隐去
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

const swoon = [
  { kind: 'if', when: { kind: 'marked', who: 'target', mark: 'charm' }, then: [{ kind: 'stun', durationMs: 1200 }, { kind: 'damage', amount: 0, ratio: 1 }], else: foxSpiritFire.onHit },
] as const

const foxSpiritFire2 = { ...foxSpiritFire, onHit: swoon } satisfies AbilityDef

const foxSpiritFire3 = {
  ...foxSpiritFire,
  onHit: [...swoon, { kind: 'deathMark', ms: 1500, then: [{ kind: 'to', who: { side: 'foes', radius: 2.2 }, then: [{ kind: 'charm', durationMs: 1000 }] }] }],
} satisfies AbilityDef

const foxSpiritCharm = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'chirp',
  color: 0xff80ab,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'charm', durationMs: 2000 }],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        {
          kind: 'summon',
          of: { clone: { dmgRatio: 0.5 } },
          count: 2,
          lifeMs: 6000,
          hpRatio: 0.4,
          onDeath: [{ kind: 'to', who: { side: 'foes', radius: 2.5 }, then: [{ kind: 'charm', durationMs: 1500 }] }],
        },
        { kind: 'hide', durationMs: 1500 },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { foxSpiritFire, foxSpiritFire2, foxSpiritFire3, foxSpiritCharm } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98a',
  name: '狐仙',
  element: 'fire',
  desc: '修行千年的狐仙：放出追着敌人飞的狐火，同一个敌人 3 秒内挨满三团就被迷得朝她走过来；技能一回眸迷住身边的敌人，再化出两只分身替她挨打，分身被打散时迷住周围的敌人，她自己隐去 1.5 秒',
  role: 'controller',
  tags: ['control', 'ranged', 'summon'],
  body: { drag: 4.5, mass: 0.6 },
  stats: { moveSpeed: 6.2, maxStamina: 90, staminaRegen: 80, exertion: 0.85 },
  skill: {
    name: '倾城',
    icon: '1f33a',
    desc: '身周 4 格内的敌人迷住 2 秒；化出两只分身 6 秒，分身有你四成的生命，放五成伤害的狐火，被打散时迷住 2.5 格内的敌人 1.5 秒；自己隐匿 1.5 秒，敌人看不见你',
    cdMs: 15_000,
    ability: 'foxSpiritCharm',
  },
  weapons: [],
  innate: [
    {
      name: '狐火',
      icon: '1f525',
      base: 'foxSpiritFire',
      upgrades: [
        { ability: 'foxSpiritFire2', card: { icon: '1f48b', name: '迷魂', desc: '狐火打中已被迷住的敌人，改为让它晕 1.2 秒，再补一下等于这一团的伤害' } },
        { ability: 'foxSpiritFire3', card: { icon: '1f494', name: '摄魂', desc: '被狐火打中的敌人 1.5 秒内死去，迷住它身边 2.2 格内的敌人 1 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
