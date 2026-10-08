import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { zoneLook } from '../../../kit.ts'

// 🪐 环星：在敌人身上套一圈引力环，套满三圈把它锁住，升级后还把它拽到身边；技能在脚下张开引力井
const ringstarRing = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 11,
  fireSfx: 'warp',
  color: 0x9575cd,
  shape: { kind: 'disc', radius: 1.6, at: 'target' },
  onHit: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }],
} satisfies AbilityDef

const ringstarRing2 = {
  ...ringstarRing,
  onHit: [...ringstarRing.onHit, { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'root', durationMs: 1500 }] }],
} satisfies AbilityDef

const ringstarRing3 = { ...ringstarRing2, onHit: [...ringstarRing2.onHit, { kind: 'pull', speed: 8, gap: 1.5 }] } satisfies AbilityDef

const ringstarWell = {
  trigger: 'manual',
  aim: 'self',
  damage: 6,
  fireSfx: 'gulp',
  shape: { kind: 'zone', radius: 4, durationMs: 4000, tickMs: 500, pull: 2.5, visual: zoneLook(0x7e57c2) },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 600 }],
} satisfies AbilityDef

export const abilities = { ringstarRing, ringstarRing2, ringstarRing3, ringstarWell } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1fa90',
  name: '环星',
  element: 'dark',
  desc: '戴着光环的行星：在敌人身上套一圈引力环让它走不快，同一个敌人套满三圈就被锁在原地，升级后还被拽到身边；技能在脚下张开引力井，把一片敌人往里吸',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 1.2 },
  stats: { moveSpeed: 5.2, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '引力井', icon: '1f573', desc: '在脚下张开 4 格的引力井 4 秒：井里的敌人每秒被往中心吸 2.5 格，每半秒挨 6 点并减速 40%', cdMs: 13_000, ability: 'ringstarWell' },
  weapons: [],
  innate: [
    {
      name: '引力环',
      icon: '1fa90',
      base: 'ringstarRing',
      upgrades: [
        { ability: 'ringstarRing2', card: { icon: '1f512', name: '潮汐锁定', desc: '同一个敌人套满三圈就定身 1.5 秒' } },
        { ability: 'ringstarRing3', card: { icon: '1f300', name: '轨道', desc: '套中的敌人被拽到自己身前 1.5 格处' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
