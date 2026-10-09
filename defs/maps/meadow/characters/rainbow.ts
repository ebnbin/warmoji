import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring, zoneLook } from '../../../kit.ts'

// 🦄 独角兽：角上射出一道点着一排敌人的虹光，火在挤成一堆的敌人里越烧越开；技能在脚下架一座彩虹桥，桥上的队友回血，桥下的敌人着火
const rainbowBeam = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 5,
  damage: 16,
  fireSfx: 'ignite',
  color: 0xffab91,
  shape: { kind: 'segment', reach: 5, radius: 0.55, ms: 200, beam: true },
} satisfies AbilityDef

const rainbowBeam2 = { ...rainbowBeam, onHit: [{ kind: 'each', then: [{ kind: 'blast', radius: 1.2, ratio: 0.3, knockback: 0, ring: ring(0xff8a65) }] }] } satisfies AbilityDef

const rainbowBeam3 = { ...rainbowBeam2, repeat: { count: 3, spreadDeg: 50 } } satisfies AbilityDef

const rainbowBridge = {
  trigger: 'manual',
  aim: 'self',
  damage: 7,
  fireSfx: 'upgrade',
  shape: { kind: 'zone', radius: 3, durationMs: 5000, tickMs: 500, mend: 6, visual: zoneLook(0xf48fb1) },
} satisfies AbilityDef

export const abilities = { rainbowBeam, rainbowBeam2, rainbowBeam3, rainbowBridge } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f984',
  name: '独角兽',
  element: 'fire',
  desc: '本身是火、点不着的独角兽：角上射出一道穿过一排敌人的虹光，照到的都烧起来，烧着的还会烧到贴着的同伴；虹光打进毒云，毒云就炸开；技能在脚下架一座彩虹桥，桥上的队友回血，桥下的敌人着火；中了毒就回不了血',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '彩虹桥', icon: '1f308', desc: '在脚下架起 3 格的彩虹 5 秒：圈里的敌人每半秒挨 7 点、身上着火，队友每秒回 6 点血', cdMs: 14_000, ability: 'rainbowBridge' },
  weapons: [],
  innate: [
    {
      name: '虹光',
      icon: '1f984',
      base: 'rainbowBeam',
      upgrades: [
        { ability: 'rainbowBeam2', card: { icon: '1f305', name: '余晖', desc: '虹光照到的每个敌人身上迸出一圈余晖：1.2 格内别的敌人挨三成伤害、一并着火' } },
        { ability: 'rainbowBeam3', card: { icon: '1f48e', name: '棱镜', desc: '一次射出三道虹光，散开 50 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
