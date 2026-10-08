import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const beeSwarm = {
  trigger: 'auto',
  cooldownMs: 2600,
  aim: 'self',
  damage: 5,
  knockback: 2,
  shape: {
    kind: 'summon',
    count: 3,
    minion: { look: { emoji: '1f41d', size: 0.5 }, speed: 8, orbit: { radius: 0.625, spinRadPerSec: 3 } },
    lifeMs: 4000,
  },
  onHit: [{ kind: 'poison', damage: 8, tickMs: 1000, durationMs: 5000 }],
} satisfies AbilityDef

const beeSwarm2 = {
  ...beeSwarm,
  shape: { ...beeSwarm.shape, count: beeSwarm.shape.count + 1 },
} satisfies AbilityDef

const beeSwarm3 = {
  ...beeSwarm2,
  onHit: [
    { kind: 'poison', damage: 13, tickMs: 1000, durationMs: 5000 },
    { kind: 'slow', factor: 0.55, durationMs: 1200 },
  ],
} satisfies AbilityDef

const beeHoney = {
  trigger: 'manual',
  aim: 'nearest',
  range: 7,
  fireSfx: 'recruit',
  color: 0xffca28,
  shape: { kind: 'disc', radius: 3, at: 'target' },
  onHit: [
    {
      kind: 'ground',
      def: {
        radius: 3,
        durationMs: 3000,
        tickMs: 500,
        damage: 4,
        color: 0xffca28,
        fillAlpha: 0.25,
        lineAlpha: 0.7,
        enterMs: 250,
        effects: [{ kind: 'slow', factor: 0.55, durationMs: 600 }],
        onExpire: [{ kind: 'root', durationMs: 2200 }],
      },
    },
  ],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  beeSwarm,
  beeSwarm2,
  beeSwarm3,
  beeHoney,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 30 }, mul: { damage: 1.2 } }, { add: { maxHp: 70 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f41d',
  name: '蜂后',
  desc: '每隔一阵放出一群小蜂，自主寻路蜇敌施毒后自毁，优先扑向未中毒的目标',
  role: 'summoner',
  tags: ['damage', 'control', 'summon'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 5.56, maxStamina: 90, staminaRegen: 60, exertion: 0.8, dotDamage: 1.1 },
  skill: { name: '蜂蜜陷阱', icon: '1f36f', desc: '在最近的敌人脚下泼一片三格蜂蜜：场内敌人减速挨蜇，三秒后仍陷在蜜里的被粘住两秒多', cdMs: 13_000, ability: 'beeHoney' },
  weapons: [],
  innate: [
    {
      name: '毒蜂群',
      icon: '1f41d',
      base: 'beeSwarm',
      upgrades: [
        { ability: 'beeSwarm2', card: { icon: '1f41d', name: '扩巢', desc: '每波小蜂 +1 只' } },
        { ability: 'beeSwarm3', card: { icon: '1f9ea', name: '剧毒麻痹', desc: '毒素更烈，蜇中附带 45% 减速 1.2 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
