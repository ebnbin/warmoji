import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import FISH_SCHOOL from './fishSchool.ts'

const whaleSong = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 6000,
  aim: 'nearest',
  range: 6,
  fireSfx: 'sonar',
  color: 0x7e57c2,
  windup: { ms: 1000, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'disc', radius: 6, at: 'self' },
  onHit: [{ kind: 'sleep', durationMs: 2000, wakeMul: 1.5 }],
} satisfies AbilityDef

const swallow = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 2.8,
  fireSfx: 'gulp',
  windup: { ms: 600, lockAt: 'end', telegraph: 'blink' },
  shape: { kind: 'segment', reach: 2.5, radius: 0.9, ms: 200 },
  onHit: [{ kind: 'devour', ms: 3000, dps: 14, escape: 180, spit: 3 }],
} satisfies AbilityDef

// 浮上来以后身子是水，尾巴照样是物理
const tailSwipe = {
  trigger: 'auto',
  cooldownMs: 2400,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 3.4,
  element: 'physical',
  damage: 20,
  knockback: 4,
  fireSfx: 'whoosh',
  windup: { ms: 450, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.4, arcDeg: 160, ms: 220 },
} satisfies AbilityDef

const fishCall = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 12000,
  firstDelayMs: 8000,
  aim: 'self',
  fireSfx: 'bubble',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: FISH_SCHOOL, spread: 2 }, count: 3 }],
} satisfies AbilityDef

const diveRam = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7500,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 7,
  element: 'water',
  damage: 24,
  knockback: 4,
  fireSfx: 'splash',
  color: 0x42a5f5,
  windup: { ms: 700, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'leap', distance: 6, ms: 700, height: 2, radius: 2.4 },
} satisfies AbilityDef

const ABYSS_WHALE = {
  kind: 'abyssWhale',
  role: 'boss',
  emoji: '1f40b',
  name: '深渊巨鲸',
  desc: '从陡坎下浮上来的巨鲸，皮厚肉沉：蓄力一秒唱起鲸歌，6 格内的人睡 2 秒，叫醒的那一下伤害 ×1.5，雷打得断它的蓄力；一口吞下贴近的人，3 秒里每秒消化 14 点，打它够疼才吐出来；尾巴横扫一大片，把人远远扫开，冻住的扫一下就碎冰；隔一阵召来三群湿漉漉的鱼。血掉到六成潜下去再浮上来，从此浑身湿透，一冰就冻、一电就连到身边的鱼群：隔一阵冲出 6 格砸地，2.4 格内的人浇湿、被撞开；掉到四分之一霸体 2 秒，之后出手更勤',
  size: 3.6,
  radius: 1.15,
  span: [0, 6],
  hp: 5200,
  stats: { armor: 4, exertion: 0 },
  speed: 1,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [whaleSong, swallow, tailSwipe, fishCall],
  phases: [
    { below: 0.6, name: '深潜', element: 'water', abilities: [whaleSong, swallow, tailSwipe, fishCall, diveRam] },
    { below: 0.25, name: '吞天', stats: { mul: { cooldown: 0.75 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] },
  ],
} satisfies EnemyDef

export default ABYSS_WHALE
