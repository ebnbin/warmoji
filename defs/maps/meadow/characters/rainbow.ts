import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🦄 独角兽：角上射出一道虹光，照到的敌人身上留着余晖；技能在脚下架一座彩虹桥
const rainbowBeam = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 5,
  damage: 20,
  fireSfx: 'zap',
  color: 0xf8bbd0,
  shape: { kind: 'segment', reach: 5, radius: 0.55, ms: 200, beam: true },
} satisfies AbilityDef

const rainbowBeam2 = { ...rainbowBeam, onHit: [{ kind: 'poison', damage: 4, tickMs: 500, durationMs: 2500 }] } satisfies AbilityDef

const rainbowBeam3 = { ...rainbowBeam2, repeat: { count: 3, spreadDeg: 50 } } satisfies AbilityDef

const rainbowBridge = {
  trigger: 'manual',
  aim: 'self',
  damage: 8,
  fireSfx: 'upgrade',
  shape: { kind: 'zone', radius: 3, durationMs: 5000, tickMs: 500, mend: 6, visual: zoneLook(0xf48fb1) },
  onHit: [{ kind: 'slow', factor: 0.7, durationMs: 600 }],
} satisfies AbilityDef

export const abilities = { rainbowBeam, rainbowBeam2, rainbowBeam3, rainbowBridge } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f984',
  name: '独角兽',
  desc: '角上射出一道穿过一排敌人的虹光，照到的敌人身上留着灼人的余晖；技能在脚下架一座彩虹桥，桥下的敌人走不快，桥上的队友回血',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '彩虹桥', icon: '1f308', desc: '在脚下架起 3 格的彩虹 5 秒：圈里的敌人每半秒挨一下、走不快，队友每秒回 6 点血', cdMs: 14_000, ability: 'rainbowBridge' },
  weapons: [],
  innate: [
    {
      name: '虹光',
      icon: '1f984',
      base: 'rainbowBeam',
      upgrades: [
        { ability: 'rainbowBeam2', card: { icon: '1f305', name: '余晖', desc: '虹光照到的敌人身上留着余晖，2.5 秒里每半秒烫一下' } },
        { ability: 'rainbowBeam3', card: { icon: '1f48e', name: '棱镜', desc: '一次射出三道虹光，散开 50 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
