import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍✈️ 星舰驾驶员：远远连射穿得过障碍的激光炮，打中的烧起来，升级后双联装、弹道会追人；技能朝一个方向轰出一道物理的轨道炮，轰得开墙
const starPilotLaser = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 8,
  damage: 11,
  fireSfx: 'zap',
  piercesWalls: true,
  shape: { kind: 'bolt', projectile: shot('1f538', 14, 0.4), lifeMs: 1000 },
} satisfies AbilityDef

const starPilotLaser2 = { ...starPilotLaser, repeat: { count: 2, spreadDeg: 8 } } satisfies AbilityDef

const starPilotLaser3 = {
  ...starPilotLaser2,
  shape: { kind: 'bolt', projectile: { ...shot('1f538', 14, 0.4), flight: { kind: 'homing', degPerSec: 150 } }, lifeMs: 1000 },
} satisfies AbilityDef

const starPilotRailgun = {
  trigger: 'manual',
  aim: 'stick',
  element: 'physical',
  damage: 55,
  knockback: 4,
  breach: 2,
  fireSfx: 'boom',
  color: 0xb0bec5,
  shape: { kind: 'segment', reach: 10, radius: 0.7, ms: 250, beam: true },
} satisfies AbilityDef

export const abilities = { starPilotLaser, starPilotLaser2, starPilotLaser3, starPilotRailgun } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_2708_fe0f',
  name: '星舰驾驶员',
  element: 'fire',
  desc: '开过星舰的驾驶员，本身是火，点不着：远远地连射激光炮，激光不受障碍阻挡，隔着墙也瞄得到、打得穿，打中的敌人烧起来，挤在一起的会互相燎着，升级后一次两发、弹道还会追着敌人拐弯；技能朝一个方向轰出一道轨道炮，是实打实的物理，贯穿一排敌人把它们轰开，冻住的当场轰碎，挡路的墙也轰得开',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.6, mass: 0.9 },
  stats: { moveSpeed: 6, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '轨道炮', icon: '1f4a5', desc: '朝摇杆方向轰出一道 10 格长的物理炮光，沿线的敌人各挨 55 点并被远远轰开，撞上的墙崩掉一块', cdMs: 10_000, ability: 'starPilotRailgun', aim: true },
  weapons: [],
  innate: [
    {
      name: '激光炮',
      icon: '1f6e9',
      base: 'starPilotLaser',
      upgrades: [
        { ability: 'starPilotLaser2', card: { icon: '264a', name: '双联装', desc: '一次射出两发，散开 8 度' } },
        { ability: 'starPilotLaser3', card: { icon: '1f3af', name: '追踪弹', desc: '激光弹每秒最多拐 150 度，追着最近的敌人飞' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
