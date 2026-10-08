import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🐸 青蛙：舌头把远处的敌人拽到身边
const frogTongue = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 4.8,
  damage: 20,
  color: 0xf48fb1,
  shape: { kind: 'segment', reach: 4.5, radius: 0.35, ms: 200, beam: true },
  onHit: [{ kind: 'pull', speed: 14, gap: 0.3 }],
} satisfies AbilityDef

const frogTongue2 = { ...frogTongue, onHit: [{ kind: 'pull', speed: 14, gap: 0.3 }, { kind: 'root', durationMs: 1000 }] } satisfies AbilityDef

const frogTongue3 = { ...frogTongue, onHit: [{ kind: 'pull', speed: 14, gap: 0.3, heavy: 'self' }, { kind: 'root', durationMs: 1000 }] } satisfies AbilityDef

const frogLily = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'portal', distance: 6, radius: 0.9, durationMs: 6000, cdMs: 1200, color: 0x66bb6a }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  frogTongue,
  frogTongue2,
  frogTongue3,
  frogLily,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 25 }, mul: { damage: 1.2 } }, { add: { maxHp: 55 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f438',
  name: '青蛙',
  desc: '长舌把远处的敌人一口卷到身边；荷叶跳台让谁都能穿梭',
  role: 'controller',
  tags: ['control', 'ranged', 'mobile'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.4, maxStamina: 90, staminaRegen: 70, exertion: 0.8 },
  skill: { name: '荷叶跳台', icon: '1fab7', desc: '脚下与前方六格各浮起一片荷叶，六秒内任何身体踏上一片就从另一片冒出来（敌我都算），青蛙自己先跳过去', cdMs: 12_000, ability: 'frogLily', aim: true },
  weapons: [],
  innate: [
    {
      name: '长舌',
      icon: '1f445',
      base: 'frogTongue',
      upgrades: [
        { ability: 'frogTongue2', card: { icon: '1f36f', name: '粘舌', desc: '卷回来的敌人被舌头粘住一秒，走不动但能出手' } },
        { ability: 'frogTongue3', card: { icon: '1faa2', name: '拉纤', desc: '拉不动的重家伙（锚定、霸体、Boss）改成把青蛙自己拽过去' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
