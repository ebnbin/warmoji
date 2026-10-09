import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🐕 莱卡：放下会射冰弹的卫星天线，冰弹叠满三层把敌人冻住；技能架起一架连射冰光束的望远镜炮
const iceShot = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6.5,
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f539', 10, 0.36), lifeMs: 1100 },
  onHit: [{ kind: 'slow', factor: 0.8, durationMs: 1000 }],
} satisfies AbilityDef

const coldShot = { ...iceShot, onHit: [...iceShot.onHit, { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'status', status: 'frozen', ms: 800 }] }] } satisfies AbilityDef

const dish = (ability: AbilityDef, maxAlive: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 4300,
    aim: 'self',
    fireSfx: 'recruit',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs: 12000, look: { emoji: '1f4e1', size: 0.9 }, ability },
  }) satisfies AbilityDef

const laikaDish = dish(iceShot, 2)
const laikaDish2 = dish(iceShot, 3)
const laikaDish3 = dish(coldShot, 3)

const iceBeam = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  range: 8,
  damage: 18,
  fireSfx: 'zap',
  color: 0x80deea,
  shape: { kind: 'segment', reach: 8, radius: 0.5, ms: 200, beam: true },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1000 }],
} satisfies AbilityDef

const laikaStrike = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'recruit',
  shape: { kind: 'emplace', count: 1, maxAlive: 1, lifeMs: 8000, look: { emoji: '1f52d', size: 1 }, ability: iceBeam },
} satisfies AbilityDef

export const abilities = { laikaDish, laikaDish2, laikaDish3, laikaStrike } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f415',
  name: '莱卡',
  element: 'ice',
  desc: '第一只飞上太空的狗：边走边放会射冰弹的卫星天线，冰弹打中的敌人走慢，同一个敌人挨满三发就冻住；技能架起一架望远镜炮，朝敌人连射冰光束',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '轨道打击', icon: '1f52d', desc: '在身边架起一架望远镜炮 8 秒，每 0.6 秒朝 8 格内最近的敌人射一道冰光束，沿线的敌人各挨 18 点并减速 40%', cdMs: 15_000, ability: 'laikaStrike' },
  weapons: [],
  innate: [
    {
      name: '卫星天线',
      icon: '1f4e1',
      base: 'laikaDish',
      upgrades: [
        { ability: 'laikaDish2', card: { icon: '1f517', name: '星链', desc: '最多同时立着三座天线' } },
        { ability: 'laikaDish3', card: { icon: '2744', name: '冷光', desc: '同一个敌人挨满三发冰弹就冻结 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
