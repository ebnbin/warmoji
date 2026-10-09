import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'

const bite = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 800,
  aim: 'nearest',
  range: 2.6,
  damage: 24,
  fireSfx: 'gulp',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 2.4, radius: 0.7, ms: 180 },
} satisfies AbilityDef

const tailSlap = {
  trigger: 'auto',
  cooldownMs: 4500,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 3.2,
  damage: 18,
  fireSfx: 'splash',
  windup: { ms: 450, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.2, arcDeg: 160, ms: 250 },
  onHit: [{ kind: 'attune', element: 'water', ms: 4000 }],
} satisfies AbilityDef

const surge = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 6000,
  firstDelayMs: 3500,
  aim: 'nearest',
  range: 6,
  damage: 16,
  fireSfx: 'wash',
  color: 0x4fc3f7,
  windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
  shape: { kind: 'segment', reach: 6, radius: 0.6, ms: 300, beam: true },
  onHit: [{ kind: 'shove', distance: 4, ms: 400 }],
} satisfies AbilityDef

const pounce = {
  trigger: 'manual',
  class: 'skill',
  aim: 'nearest',
  range: 9,
  damage: 30,
  knockback: 5,
  fireSfx: 'jump',
  color: 0x4fc3f7,
  windup: { ms: 800, lockAt: 'end', telegraph: 'blink' },
  shape: { kind: 'leap', distance: 6, ms: 650, height: 2, radius: 2.2 },
} satisfies AbilityDef

const dive = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 5000,
  aim: 'nearest',
  range: 7.5,
  fireSfx: 'splash',
  when: { kind: 'not', cond: { kind: 'within', who: 'target', radius: 3.5 } },
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'untargetable', durationMs: 800 }] }],
  combo: [pounce],
} satisfies AbilityDef

const ORCA = {
  kind: 'orca',
  role: 'boss',
  emoji: '1facd',
  name: '虎鲸',
  element: 'water',
  desc: '从冰缘外的海里爬上来的虎鲸，不怕冰水、在海里游得飞快：张口撕咬，甩尾拍中的人 4 秒内变成水元素，掀起一道浪把一排人推开 4 格；隔一阵身子一沉谁也打不着，0.8 秒后一跃扑出 6 格砸进人堆；血掉到一半开始猎杀，跑得更快、出手更勤',
  size: 3.2,
  radius: 1.05,
  span: [0, 6],
  hp: 4500,
  stats: { armor: 4, exertion: 0 },
  speed: 1.4,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary', 'swims', 'coldproof'],
  drive: { kind: 'chase' },
  abilities: [bite, tailSlap, surge, dive],
  phases: [{ below: 0.5, name: '猎杀', stats: { mul: { moveSpeed: 1.25, cooldown: 0.8 } } }],
} satisfies EnemyDef

export default ORCA
