import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch, zoneLook } from '../../../kit.ts'

// 🐪 单峰驼：喷出一扇滚烫的沙，烫得一片敌人走不快；技能在脚下卷起一场沙暴
const dromedarySpray = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 3,
  damage: 17,
  fireSfx: 'wash',
  color: 0xffb74d,
  shape: { kind: 'sector', radius: 3, arcDeg: 70, ms: 220 },
  onHit: [{ kind: 'slow', factor: 0.8, durationMs: 1000 }],
} satisfies AbilityDef

const scald = { kind: 'each', then: [{ kind: 'ground', def: patch(1, 2500, 0xffb74d, undefined, 3, 500) }] } as const

const dromedarySpray2 = { ...dromedarySpray, onHit: [...dromedarySpray.onHit, scald] } satisfies AbilityDef

const dromedarySpray3 = { ...dromedarySpray2, range: 3.8, shape: { kind: 'sector', radius: 3.8, arcDeg: 100, ms: 240 } } satisfies AbilityDef

const dromedaryStorm = {
  trigger: 'manual',
  aim: 'self',
  damage: 9,
  fireSfx: 'gust',
  shape: { kind: 'zone', radius: 3.2, durationMs: 6000, tickMs: 500, visual: zoneLook(0xd7b98e) },
  onHit: [{ kind: 'disarm', durationMs: 600 }],
} satisfies AbilityDef

export const abilities = { dromedarySpray, dromedarySpray2, dromedarySpray3, dromedaryStorm } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f42a',
  name: '单峰驼',
  element: 'fire',
  desc: '单峰驼喷出一扇滚烫的沙，扇面里的敌人都被烫得走不快；技能在脚下卷起一场沙暴，里面的敌人挨打又睁不开眼',
  role: 'area',
  tags: ['damage', 'area'],
  body: { drag: 5, mass: 1.4 },
  stats: { moveSpeed: 4.8, maxStamina: 140, staminaRegen: 55, exertion: 0.7 },
  skill: { name: '沙暴', icon: '1f32c', desc: '在脚下卷起 3.2 格的沙暴 6 秒：里面的敌人每半秒挨一下，还睁不开眼、打不出手', cdMs: 15_000, ability: 'dromedaryStorm' },
  weapons: [],
  innate: [
    {
      name: '热沙喷',
      icon: '1f42a',
      base: 'dromedarySpray',
      upgrades: [
        { ability: 'dromedarySpray2', card: { icon: '2668', name: '烫沙', desc: '被喷中的敌人脚下留一片 1 格的烫沙 2.5 秒，每半秒烫一下' } },
        { ability: 'dromedarySpray3', card: { icon: '1f444', name: '大口', desc: '喷得更远更宽：3.8 格、100 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
