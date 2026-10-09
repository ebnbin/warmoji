import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍🔧 潜艇技工：电焊枪打出电火花，每第三下就地焊下一座炮台；技能投下自己的全息投影，投影照着开火，还能和它换位
const sparkShot = shot('1f387', 10, 0.4)

const spark = {
  trigger: 'auto',
  cooldownMs: 700,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'zap',
  shape: { kind: 'bolt', projectile: sparkShot, lifeMs: 700 },
} satisfies AbilityDef

const turret = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'self',
  fireSfx: 'clank',
  shape: { kind: 'emplace', count: 1, maxAlive: 2, lifeMs: 10000, look: { emoji: '1f529', size: 0.8 }, ability: spark },
} satisfies AbilityDef

const weld = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'zap',
  mirror: true,
  shape: { kind: 'bolt', projectile: sparkShot, lifeMs: 800 },
} satisfies AbilityDef

const weld2 = { ...weld, onHit: [{ kind: 'stack', max: 2, durationMs: 800, then: [{ kind: 'root', durationMs: 1200 }] }] } satisfies AbilityDef

const weld3 = {
  ...weld2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'shadow', lifeMs: 3000, max: 3, dash: 0, taunt: { radius: 2.5, ms: 1500 } }] }],
} satisfies AbilityDef

const mechanicWeld = { ...weld, cycle: [weld, turret] } satisfies AbilityDef

const mechanicWeld2 = { ...weld2, cycle: [weld2, turret] } satisfies AbilityDef

const mechanicWeld3 = { ...weld3, cycle: [weld3, turret] } satisfies AbilityDef

const mechanicHolo = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'warp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'shadow', lifeMs: 5000, max: 2, dash: 4 }],
  recast: { windowMs: 4000, ability: { trigger: 'manual', aim: 'self', fireSfx: 'warp', shape: { kind: 'world' }, onHit: [{ kind: 'shadowSwap' }] } },
} satisfies AbilityDef

export const abilities = { mechanicWeld, mechanicWeld2, mechanicWeld3, mechanicHolo } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f527',
  name: '潜艇技工',
  element: 'thunder',
  desc: '潜艇上的技工：电焊枪朝 6.5 格内最近的敌人打出电火花，每第三下就地焊下一座会射电火花的炮台，最多同时两座、每座撑 10 秒；技能投下自己的全息投影，电焊枪也从投影上照着开火，再按一次就和投影换位',
  role: 'summoner',
  tags: ['damage', 'summon', 'mobile'],
  body: { drag: 5, mass: 1.1 },
  stats: { moveSpeed: 5, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '全息投影',
    icon: '1f4fd',
    desc: '朝摇杆方向 4 格外投下一个自己的全息投影 5 秒（最多两个），电焊枪每打一发，投影也从自己的位置照着打一发；4 秒内再按一次，与最新的投影换位',
    cdMs: 11_000,
    ability: 'mechanicHolo',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '电焊枪',
      icon: '1f529',
      base: 'mechanicWeld',
      upgrades: [
        { ability: 'mechanicWeld2', card: { icon: '1f9f2', name: '电磁锁', desc: '0.8 秒内同一敌人挨两发电焊枪的电火花（投影打的也算）就定身 1.2 秒' } },
        { ability: 'mechanicWeld3', card: { icon: '1f5e3', name: '诱饵投影', desc: '电焊枪打死敌人时，在身边留下一个全息投影 3 秒，嘲讽它 2.5 格内的敌人 1.5 秒；同时最多 3 个投影' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
