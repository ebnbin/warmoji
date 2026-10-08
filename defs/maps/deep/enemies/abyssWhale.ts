import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
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

const tailSwipe = {
  trigger: 'auto',
  cooldownMs: 2400,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 3.4,
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
  damage: 30,
  knockback: 4,
  fireSfx: 'splash',
  color: 0x7e57c2,
  windup: { ms: 700, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'leap', distance: 6, ms: 700, height: 2, radius: 2.4 },
} satisfies AbilityDef

const ABYSS_WHALE = {
  kind: 'abyssWhale',
  role: 'boss',
  emoji: '1f40b',
  name: '深渊巨鲸',
  element: 'dark',
  desc: '从陡坎下浮上来的巨鲸：蓄力一秒唱起鲸歌，6 格内的人睡 2 秒，叫醒的那一下伤害 ×1.5；一口吞下贴近的人，3 秒里每秒消化 14 点，打它够疼才吐出来；尾巴横扫一大片；隔一阵召来三群鱼。血掉到六成后隔一阵就潜下去，再冲出 6 格砸地；掉到四分之一霸体 2 秒，之后出手更勤',
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
    { below: 0.6, name: '深潜', abilities: [whaleSong, swallow, tailSwipe, fishCall, diveRam] },
    { below: 0.25, name: '吞天', stats: { mul: { cooldown: 0.75 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] },
  ],
} satisfies EnemyDef

export default ABYSS_WHALE
