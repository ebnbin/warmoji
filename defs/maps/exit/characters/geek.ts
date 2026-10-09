import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🤓 极客：遥控无人机往敌人头上扔电池，落地炸开一小圈；技能放出电磁脉冲，让身边的敌人哑火
const geekDrone = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 7.5,
  damage: 14,
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 2, look: { emoji: '1f50b', size: 0.8 }, fromAbove: 3, dropMs: 450, staggerMs: 150 },
  onHit: [{ kind: 'blast', radius: 1.2, ratio: 0.6, knockback: 1, ring: ring(0xffd54f) }],
} satisfies AbilityDef

const geekDrone2 = { ...geekDrone, onHit: [{ kind: 'blast', radius: 1.7, ratio: 0.6, knockback: 1, ring: ring(0xffd54f) }] } satisfies AbilityDef

const geekDrone3 = { ...geekDrone2, onHit: [...geekDrone2.onHit, { kind: 'stun', durationMs: 300 }] } satisfies AbilityDef

const geekEmp = {
  trigger: 'manual',
  aim: 'self',
  damage: 25,
  fireSfx: 'zap',
  color: 0x80deea,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [{ kind: 'silence', durationMs: 3000 }, { kind: 'stun', durationMs: 500 }],
} satisfies AbilityDef

export const abilities = { geekDrone, geekDrone2, geekDrone3, geekEmp } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f913',
  name: '极客',
  element: 'thunder',
  desc: '戴着厚眼镜的极客：遥控无人机往敌人头上扔电池，落地炸开一小圈；技能放出电磁脉冲，让身边的敌人哑火',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.2, maxStamina: 85, staminaRegen: 65, exertion: 1.05 },
  skill: { name: 'EMP', icon: '1f4e1', desc: '放出一圈电磁脉冲：5 格内的敌人挨一下、眩晕 0.5 秒，3 秒内放不了技能', cdMs: 13_000, ability: 'geekEmp' },
  weapons: [],
  innate: [
    {
      name: '无人机轰炸',
      icon: '1f681',
      base: 'geekDrone',
      upgrades: [
        { ability: 'geekDrone2', card: { icon: '1f4a5', name: '过载', desc: '电池落地炸开的范围从 1.2 格加大到 1.7 格' } },
        { ability: 'geekDrone3', card: { icon: '1f50c', name: '电涌', desc: '被电池砸中的敌人麻 0.3 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
