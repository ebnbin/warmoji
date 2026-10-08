import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🦦 水獭：射出打中就裂成两发的水弹；技能朝一个方向喷出一道激流，把一排敌人冲开
const otterShot = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  range: 7,
  damage: 14,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: { ...shot('1f4a7', 11, 0.4, 270), split: { count: 2, spreadDeg: 40, ratio: 0.6 } }, lifeMs: 1100 },
} satisfies AbilityDef

const otterShot2 = { ...otterShot, shape: { ...otterShot.shape, pierce: 2 } } satisfies AbilityDef

const wave = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  range: 7,
  damage: 18,
  fireSfx: 'splash',
  color: 0x42a5f5,
  shape: { kind: 'segment', reach: 5, radius: 0.55, ms: 200, beam: true },
  onHit: [{ kind: 'shove', distance: 1.5, ms: 220 }],
} satisfies AbilityDef

const otterShot3 = { ...otterShot2, cycle: [otterShot2, wave] } satisfies AbilityDef

const otterTorrent = {
  trigger: 'manual',
  aim: 'stick',
  damage: 30,
  fireSfx: 'wash',
  color: 0x29b6f6,
  shape: { kind: 'segment', reach: 7, radius: 0.45, ms: 300, beam: true },
  onHit: [{ kind: 'shove', distance: 3, ms: 320 }],
} satisfies AbilityDef

export const abilities = { otterShot, otterShot2, otterShot3, otterTorrent } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9a6',
  name: '水獭',
  element: 'water',
  desc: '溪里的水獭：射出水弹，打中敌人或飞到头就裂成两发六成伤害的小水弹；技能朝一个方向喷出一道激流，把一排敌人冲开',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 6.2, maxStamina: 100, staminaRegen: 75, exertion: 0.85 },
  skill: { name: '激流', icon: '1f30a', desc: '朝摇杆方向喷出一道 7 格长的激流，冲中的敌人挨一下并被推开 3 格', cdMs: 10_000, ability: 'otterTorrent', aim: true },
  weapons: [],
  innate: [
    {
      name: '水弹',
      icon: '1f4a7',
      base: 'otterShot',
      upgrades: [
        { ability: 'otterShot2', card: { icon: '3030', name: '打水漂', desc: '水弹能穿过两个敌人，打中第三个或飞到头才裂开' } },
        { ability: 'otterShot3', card: { icon: '1f4a6', name: '浪花', desc: '每第三发换成一道 5 格长的水浪，扫中的敌人被推开 1.5 格' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
