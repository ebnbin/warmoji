import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'

const strings = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 6,
  fireSfx: 'creak',
  shape: { kind: 'world' },
  onHit: [
    {
      kind: 'to',
      who: { side: 'foes', radius: 6, sort: 'nearest', count: 2 },
      then: [{ kind: 'tether', ms: 3000, range: 6, onHold: [{ kind: 'berserk', durationMs: 2500 }], color: 0xce93d8 }],
    },
  ],
} satisfies AbilityDef

const press = {
  trigger: 'auto',
  cooldownMs: 4000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 8,
  damage: 26,
  knockback: 2,
  fireSfx: 'thud',
  color: 0x7e57c2,
  windup: { ms: 800, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 2.4, at: 'target' },
  onHit: [{ kind: 'stun', durationMs: 600 }],
} satisfies AbilityDef

const silk = {
  trigger: 'auto',
  cooldownMs: 6000,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 9,
  damage: 18,
  fireSfx: 'flutter',
  shape: { kind: 'drop', targets: 4, look: { emoji: '1f9f5', size: 1 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
  onHit: [{ kind: 'root', durationMs: 1000 }],
} satisfies AbilityDef

const PUPPETEER = {
  kind: 'puppeteer',
  role: 'boss',
  emoji: '1faf3',
  name: '提线之手',
  element: 'dark',
  desc: '从顶上垂下来的提线大手：牵住最近的两名队员，3 秒内没跑出 6 格就被牵着倒戈 2.5 秒；蓄一口力重重按下一片，按中的晕一下；丝线从天上落下把人钉在原地；血掉到四成谢幕，出手更快、走得更快',
  size: 3.2,
  radius: 1.1,
  span: [0, 6],
  hp: 4800,
  stats: { armor: 4, exertion: 0 },
  speed: 1.1,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [strings, press, silk],
  phases: [{ below: 0.4, name: '谢幕', stats: { mul: { cooldown: 0.75, moveSpeed: 1.2 } }, effects: [{ kind: 'unstoppable', durationMs: 2000 }] }],
} satisfies EnemyDef

export default PUPPETEER
