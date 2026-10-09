import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🐿️ 松鼠：扔出去的橡果落在地上囤着，每扔 4 颗就把满地的一齐收回来、沿途再砸一遍；技能竖起大尾巴吞掉射来的弹
const acorn = {
  trigger: 'auto',
  cooldownMs: 350,
  aim: 'nearest',
  range: 7,
  damage: 10,
  knockback: 0.5,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: { ...shot('1f330', 14), linger: 5000 }, lifeMs: 500, pierce: 1 },
} satisfies AbilityDef

const dig = { trigger: 'auto', cooldownMs: 350, aim: 'self', fireSfx: 'whoosh', shape: { kind: 'world' }, onHit: [{ kind: 'recall', speed: 20 }] } satisfies AbilityDef

const resin = { kind: 'stack', max: 3, durationMs: 1500, then: [{ kind: 'root', durationMs: 1200 }] } as const

const acorn2 = { ...acorn, onHit: [resin] } satisfies AbilityDef

const acorn3 = { ...acorn, onHit: [resin, { kind: 'pull', speed: 8, gap: 1 }] } satisfies AbilityDef

const squirrelAcorn = { ...acorn, cycle: [acorn, acorn, acorn, dig] } satisfies AbilityDef

const squirrelAcorn2 = { ...acorn2, cycle: [acorn2, acorn2, acorn2, dig] } satisfies AbilityDef

const squirrelAcorn3 = { ...acorn3, cycle: [acorn3, acorn3, acorn3, dig] } satisfies AbilityDef

const squirrelTail = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 4.5, offset: 1.6, durationMs: 3500, bodies: 'none', shots: true, color: 0xa1887f }],
} satisfies AbilityDef

export const abilities = { squirrelAcorn, squirrelAcorn2, squirrelAcorn3, squirrelTail } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.04 }, mul: { damage: 1.2 } }, { add: { crit: 0.08, maxHp: 15 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43f',
  name: '松鼠',
  element: 'wood',
  desc: '爱囤粮的松鼠：扔出的橡果能穿过 1 个敌人，飞完落在地上囤 5 秒；每扔 4 颗就把满地的橡果一齐收回来，沿途再砸一遍；技能竖起蓬松的大尾巴，吞掉敌人射来的弹',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.2, mass: 0.5 },
  stats: { moveSpeed: 6.8, maxStamina: 90, staminaRegen: 85, exertion: 0.8 },
  skill: {
    name: '蓬尾',
    icon: '1f343',
    desc: '朝摇杆方向 1.6 格处竖起一道 4.5 格宽的大尾巴 3.5 秒，吞掉敌方射来的弹体，敌我照样走得过',
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
        { ability: 'squirrelAcorn2', card: { icon: '1f36f', name: '松脂', desc: '1.5 秒内被 3 颗橡果砸中的敌人定身 1.2 秒' } },
        { ability: 'squirrelAcorn3', card: { icon: '1fa9d', name: '藤钩', desc: '橡果砸中的敌人被拽到身前 1 格，收回的橡果沿途照样拽' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
