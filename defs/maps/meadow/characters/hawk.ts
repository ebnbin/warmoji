import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { ring, shot } from '../../../kit.ts'

// 🦅 苍鹰：远远射出穿透的翎羽，隔几轮换成连锁闪电或俯冲抓摔；技能按住蓄力，从天上俯冲劈下一道雷
const hawkFeather = {
  trigger: 'auto',
  cooldownMs: 520,
  aim: 'nearest',
  range: 7,
  damage: 13,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1fab6', 12, 0.45, 45), lifeMs: 1200, pierce: 1 },
} satisfies AbilityDef

const hawkBolt = {
  ...hawkFeather,
  damage: 24,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 3, hopRange: 3, decay: 0.7 },
} satisfies AbilityDef

const hawkTalon = {
  ...hawkFeather,
  damage: 16,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 250 },
  onHit: [
    {
      kind: 'throw',
      to: 'foe',
      distance: 5,
      ms: 520,
      height: 1.8,
      onLand: [
        { kind: 'damage', amount: 0, ratio: 1 },
        { kind: 'blast', radius: 1.4, ratio: 1.2, knockback: 6, ring: ring(0xa1887f) },
      ],
    },
  ],
} satisfies AbilityDef

const hawkFeather2 = { ...hawkFeather, cycle: [hawkFeather, hawkBolt] } satisfies AbilityDef

const hawkFeather3 = { ...hawkFeather, cycle: [hawkFeather, hawkBolt, hawkTalon] } satisfies AbilityDef

const hawkDive = {
  trigger: 'manual',
  aim: 'stick',
  damage: 40,
  knockback: 6,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'leap', distance: 3, ms: 480, height: 2.2, radius: 1.6 },
  hold: { maxMs: 1500, reachMul: 2.4, damageMul: 2 },
  onHit: [{ kind: 'knockup', durationMs: 500, height: 1, onLand: [{ kind: 'stun', durationMs: 500 }] }],
} satisfies AbilityDef

export const abilities = { hawkFeather, hawkFeather2, hawkFeather3, hawkDive } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.5, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f985',
  name: '苍鹰',
  element: 'thunder',
  desc: '在高处盘旋的苍鹰：远远射出穿透 1 个敌人的翎羽，隔几轮换成一道连锁闪电，或俯冲下去抓起一个敌人砸向另一个；技能按住蓄力，松手朝一个方向俯冲 3 格，按满 1.5 秒冲出 7 格多、伤害翻倍，落地劈下一道雷把周围的敌人挑上半空',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 6.2, maxStamina: 100, staminaRegen: 75, exertion: 0.8 },
  skill: {
    name: '雷霆俯冲',
    icon: '1f329',
    desc: '按住蓄力，松手朝摇杆方向俯冲 3 格，落地 1.6 格内的敌人挨 40 点、被挑上半空 0.5 秒，落下再麻 0.5 秒；按满 1.5 秒时俯冲 7.2 格、伤害翻倍',
    cdMs: 10_000,
    ability: 'hawkDive',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '翎羽',
      icon: '1fab6',
      base: 'hawkFeather',
      upgrades: [
        { ability: 'hawkFeather2', card: { icon: '26a1', name: '雷翎', desc: '每第三轮换成一道在敌人间连跳三次的闪电' } },
        { ability: 'hawkFeather3', card: { icon: '1f985', name: '抓摔', desc: '每轮闪电之后再接一记俯冲：闪到最近的敌人身后抓起它，砸向离它最近的另一个敌人，落点 1.4 格内的敌人挨一下更重的并被震开，随后飞回原处' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
