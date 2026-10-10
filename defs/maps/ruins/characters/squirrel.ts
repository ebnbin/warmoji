import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🐿️ 松鼠：蓬尾蹭满静电，扔出去的橡果隔几颗就带一颗电，落在地上囤着，每扔 4 颗就把满地的一齐收回来、沿途再砸一遍；技能竖起大尾巴吞掉射来的弹，从尾巴里穿过的敌人挨一下电
const acorn = {
  trigger: 'auto',
  cooldownMs: 350,
  aim: 'nearest',
  range: 7,
  element: 'physical',
  damage: 10,
  knockback: 0.5,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: { ...shot('1f330', 14), linger: 5000 }, lifeMs: 500, pierce: 1 },
} satisfies AbilityDef

const spark = { ...acorn, element: 'thunder', damage: 8, knockback: 0, fireSfx: 'zap' } satisfies AbilityDef

const dig = { trigger: 'auto', cooldownMs: 350, aim: 'self', fireSfx: 'whoosh', shape: { kind: 'world' }, onHit: [{ kind: 'recall', speed: 20 }] } satisfies AbilityDef

const hook = { kind: 'pull', speed: 8, gap: 1 } as const

const acorn3 = { ...acorn, onHit: [hook] } satisfies AbilityDef

const spark3 = { ...spark, onHit: [hook] } satisfies AbilityDef

const squirrelAcorn = { ...acorn, cycle: [acorn, spark, acorn, dig] } satisfies AbilityDef

const squirrelAcorn2 = { ...acorn, cycle: [spark, acorn, spark, dig] } satisfies AbilityDef

const squirrelAcorn3 = { ...acorn3, cycle: [spark3, acorn3, spark3, dig] } satisfies AbilityDef

const squirrelTail = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 4.5, offset: 1.6, durationMs: 3500, bodies: 'none', shots: true, onCross: [{ kind: 'damage', amount: 10 }], color: 0xa1887f }],
} satisfies AbilityDef

export const abilities = { squirrelAcorn, squirrelAcorn2, squirrelAcorn3, squirrelTail } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.04 }, mul: { damage: 1.2 } }, { add: { crit: 0.08, maxHp: 15 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43f',
  name: '松鼠',
  element: 'thunder',
  desc: '爱囤粮的松鼠，蓬尾蹭满了静电，本身是雷，电流传不到它身上；身子小又灵，单发的攻击一成落空：扔出的橡果能穿过 1 个敌人，飞完落在地上囤 5 秒，每 4 颗里有 1 颗带电，打断挨打的出手，电流再跳到身边的另一个敌人，湿了的连成一片；每扔 4 颗就把满地的橡果一齐收回来，沿途再砸一遍，带电的照样放电；技能竖起蓬松的大尾巴，吞掉敌人射来的弹，从尾巴里穿过的敌人挨一下电',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.2, mass: 0.5 },
  stats: { moveSpeed: 6.8, maxStamina: 90, staminaRegen: 85, exertion: 0.8, dodge: 0.1 },
  skill: {
    name: '蓬尾',
    icon: '1f343',
    desc: '朝摇杆方向 1.6 格处竖起一道 4.5 格宽的大尾巴 3.5 秒，吞掉敌方射来的弹体，敌我照样走得过；敌人从尾巴里穿过去挨一下电，出手被打断',
    cdMs: 12_000,
    ability: 'squirrelTail',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '囤橡果',
      icon: '1f330',
      base: 'squirrelAcorn',
      upgrades: [
        { ability: 'squirrelAcorn2', card: { icon: '26a1', name: '炸毛', desc: '每 4 颗橡果里有 2 颗带电' } },
        { ability: 'squirrelAcorn3', card: { icon: '1fa9d', name: '藤钩', desc: '橡果砸中的敌人被拽到身前 1 格，扎成一堆好让电流跳过去；收回的橡果沿途照样拽' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
