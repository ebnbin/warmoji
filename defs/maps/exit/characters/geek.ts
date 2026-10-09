import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🤓 极客：遥控无人机往敌人头上扔电池，落地起火、炸开一小圈，挤在一起的一个烧一个；技能放出电磁脉冲，打断身边敌人的出手，让它们哑火
const geekDrone = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 7.5,
  damage: 11,
  fireSfx: 'ignite',
  shape: { kind: 'drop', targets: 2, look: { emoji: '1f50b', size: 0.8 }, fromAbove: 3, dropMs: 450, staggerMs: 150 },
  onHit: [{ kind: 'blast', radius: 1.2, ratio: 0.6, knockback: 1, ring: ring(0xff7043) }],
} satisfies AbilityDef

const geekDrone2 = { ...geekDrone, onHit: [{ kind: 'blast', radius: 1.7, ratio: 0.6, knockback: 1, ring: ring(0xff7043) }] } satisfies AbilityDef

const geekDrone3 = { ...geekDrone2, shape: { ...geekDrone2.shape, targets: 3 } } satisfies AbilityDef

const geekEmp = {
  trigger: 'manual',
  aim: 'self',
  element: 'thunder',
  damage: 18,
  fireSfx: 'zap',
  color: 0x80deea,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [{ kind: 'silence', durationMs: 3000 }],
} satisfies AbilityDef

export const abilities = { geekDrone, geekDrone2, geekDrone3, geekEmp } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f913',
  name: '极客',
  element: 'fire',
  desc: '戴着厚眼镜的极客：遥控无人机往敌人头上扔电池，落地起火、炸开一小圈，点着的敌人挤在一起就一个烧一个；自己玩火惯了，点不着，可身子骨弱，被贴身就危险；技能放出电磁脉冲，打断身边敌人的出手，让它们哑火',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.2, maxStamina: 85, staminaRegen: 65, exertion: 1.05 },
  skill: { name: 'EMP', icon: '1f4e1', desc: '放出一圈电磁脉冲（雷）：5 格内的敌人各挨一下电、出手被打断，电流再跳给旁边一个，3 秒内放不了技能', cdMs: 13_000, ability: 'geekEmp' },
  weapons: [],
  innate: [
    {
      name: '无人机轰炸',
      icon: '1f681',
      base: 'geekDrone',
      upgrades: [
        { ability: 'geekDrone2', card: { icon: '1f4a5', name: '过载', desc: '电池落地炸开的范围从 1.2 格加大到 1.7 格' } },
        { ability: 'geekDrone3', card: { icon: '1f525', name: '热失控', desc: '一次扔 3 块电池，砸 3 个敌人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
