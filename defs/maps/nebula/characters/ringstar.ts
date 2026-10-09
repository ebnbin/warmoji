import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, zoneLook } from '../../../kit.ts'

// 🪐 环星：引力环砸在敌人身上，是物理，套满三圈把它锁住，升级后环落处把一圈敌人收到一起；技能张开引力井把敌人吸成一团，到时塌缩重砸
const ringstarRing = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 12,
  fireSfx: 'warp',
  color: 0x9575cd,
  shape: { kind: 'disc', radius: 1.6, at: 'target' },
} satisfies AbilityDef

const ringstarRing2 = {
  ...ringstarRing,
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'root', durationMs: 1500 }] }],
} satisfies AbilityDef

const ringstarRing3 = { ...ringstarRing2, onHit: [...ringstarRing2.onHit, { kind: 'ground', def: { ...patch(1.6, 1200, 0x9575cd), pull: 3 } }] } satisfies AbilityDef

const ringstarWell = {
  trigger: 'manual',
  aim: 'self',
  damage: 4,
  fireSfx: 'gulp',
  shape: { kind: 'zone', radius: 4, durationMs: 4000, tickMs: 500, pull: 2.5, onExpire: [{ kind: 'damage', amount: 26 }], visual: zoneLook(0x7e57c2) },
} satisfies AbilityDef

export const abilities = { ringstarRing, ringstarRing2, ringstarRing3, ringstarWell } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1fa90',
  name: '环星',
  desc: '戴着光环的行星，岩石身子护甲 3、生命 90，挨打掉得少些，燃烧这类不吃护甲的照样烧穿：在敌人身上砸一圈引力环，是物理，同一个敌人套满三圈就被锁在原地，升级后环落处还把一圈敌人收到一起，好让火烧成片、电连成串；技能在脚下张开引力井，把一片敌人往里吸，到时井口塌缩，重砸井里的每一个，冻住的当场砸碎',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 1.2 },
  stats: { maxHp: 90, armor: 3, moveSpeed: 5.2, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '引力井', icon: '1f573', desc: '在脚下张开 4 格的引力井 4 秒：井里的敌人每秒被往中心吸 2.5 格，每半秒挨 4 点；到时井口塌缩，井里的敌人各挨 26 点', cdMs: 13_000, ability: 'ringstarWell' },
  weapons: [],
  innate: [
    {
      name: '引力环',
      icon: '1fa90',
      base: 'ringstarRing',
      upgrades: [
        { ability: 'ringstarRing2', card: { icon: '1f512', name: '潮汐锁定', desc: '同一个敌人套满三圈就定身 1.5 秒' } },
        { ability: 'ringstarRing3', card: { icon: '1f300', name: '星环', desc: '环落处留下 1.2 秒的小引力场，把 1.6 格内的敌人每秒往环心收 3 格' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
