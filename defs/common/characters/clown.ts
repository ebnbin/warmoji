import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🐒 捣蛋猴：满地惊喜盒，一串香蕉让敌人自相残杀
const surpriseBox = { radius: 1, durationMs: 15000, tickMs: 0, damage: 22, color: 0xff80ab, fillAlpha: 0.2, lineAlpha: 0.7, enterMs: 200, trap: true } as const

const clownBox = {
  trigger: 'auto',
  cooldownMs: 2600,
  aim: 'self',
  fireSfx: 'recruit',
  shape: { kind: 'world' },
  onHit: [{ kind: 'ground', def: { ...surpriseBox, effects: [{ kind: 'fear', durationMs: 1600 }] } }],
} satisfies AbilityDef

const clownBox2 = { ...clownBox, onHit: [{ kind: 'ground', def: { ...surpriseBox, effects: [{ kind: 'fear', durationMs: 1600 }, { kind: 'knockup', durationMs: 600, height: 1.2 }] } }] } satisfies AbilityDef

const clownBox3 = {
  ...clownBox,
  onHit: [
    {
      kind: 'ground',
      def: {
        ...surpriseBox,
        effects: [
          { kind: 'fear', durationMs: 1600 },
          { kind: 'knockup', durationMs: 600, height: 1.2 },
          { kind: 'ground', def: { radius: 1.8, durationMs: 2500, tickMs: 500, damage: 0, color: 0xce93d8, fillAlpha: 0.22, lineAlpha: 0.5, enterMs: 200, effects: [{ kind: 'berserk', durationMs: 700 }] } },
        ],
      },
    },
  ],
} satisfies AbilityDef

const clownPotion = {
  trigger: 'manual',
  aim: 'nearest',
  range: 7,
  fireSfx: 'boom',
  color: 0xfff176,
  shape: { kind: 'disc', radius: 2.6, at: 'target' },
  onHit: [{ kind: 'berserk', durationMs: 3500 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  clownBox,
  clownBox2,
  clownBox3,
  clownPotion,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { damage: 1.25 } }, { add: { maxHp: 35 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f412',
  name: '捣蛋猴',
  desc: '一路丢下惊喜盒，敌人踩上就被吓跑；一串香蕉让它们为了抢食自相残杀',
  role: 'controller',
  tags: ['control', 'area'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.8, maxStamina: 100, staminaRegen: 85, exertion: 0.9 },
  skill: { name: '香蕉乱斗', icon: '1f34c', desc: '朝最近的敌人丢一串香蕉，两格半内的敌人为了抢香蕉倒戈三秒半，转头攻击自己人', cdMs: 16_000, ability: 'clownPotion' },
  weapons: [],
  innate: [
    {
      name: '惊喜盒',
      icon: '1f381',
      base: 'clownBox',
      upgrades: [
        { ability: 'clownBox2', card: { icon: '1f91b', name: '弹簧拳', desc: '惊喜盒弹开时还把敌人弹上天' } },
        { ability: 'clownBox3', card: { icon: '1f606', name: '笑气', desc: '惊喜盒弹开后留下一团笑气，吸进去的敌人倒戈' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
