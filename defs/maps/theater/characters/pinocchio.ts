import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🤥 匹诺曹：伸长鼻子戳穿一排敌人，同一个挨满三下就定在原地；技能一通谎话让身边的敌人倒戈
const pinocchioNose = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 3.2,
  damage: 11,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 2.8, radius: 0.4, ms: 160 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'root', durationMs: 1200 }] }],
} satisfies AbilityDef

const pinocchioNose2 = { ...pinocchioNose, range: 4, shape: { ...pinocchioNose.shape, reach: 3.6 } } satisfies AbilityDef

const pinocchioNose3 = { ...pinocchioNose2, onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'berserk', durationMs: 1500 }] }] } satisfies AbilityDef

const pinocchioLies = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'chirp',
  color: 0x81c784,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'berserk', durationMs: 3000 }],
} satisfies AbilityDef

export const abilities = { pinocchioNose, pinocchioNose2, pinocchioNose3, pinocchioLies } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f925',
  name: '匹诺曹',
  element: 'wood',
  desc: '一撒谎鼻子就变长的木偶：伸长鼻子戳穿一排敌人，同一个挨满三下就被定在原地；技能一通谎话，让身边的敌人掉头去打自己人',
  role: 'controller',
  tags: ['control', 'melee'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 5.6, maxStamina: 90, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '谎话连篇', icon: '1f4ac', desc: '4 格内的敌人倒戈 3 秒，掉头去打自己人', cdMs: 14_000, ability: 'pinocchioLies' },
  weapons: [],
  innate: [
    {
      name: '长鼻子',
      icon: '1f925',
      base: 'pinocchioNose',
      upgrades: [
        { ability: 'pinocchioNose2', card: { icon: '1f4cf', name: '又撒谎了', desc: '鼻子伸到 3.6 格' } },
        { ability: 'pinocchioNose3', card: { icon: '1faa2', name: '木偶线', desc: '挨满三下时改成倒戈 1.5 秒，掉头去打自己人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
