import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'
import ARMY_ANT from './armyAnt.ts'

const sandSpray = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 3.2,
  damage: 18,
  fireSfx: 'wash',
  color: 0xd7b98e,
  windup: { ms: 450, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.2, arcDeg: 90, ms: 240 },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }],
} satisfies AbilityDef

const erupt = {
  trigger: 'manual',
  aim: 'nearest',
  range: 10,
  damage: 26,
  fireSfx: 'erupt',
  windup: { ms: 700, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'blink', behindDist: 0, strikeMs: 600 },
  onHit: [{ kind: 'knockup', durationMs: 800, height: 1.6 }],
} satisfies AbilityDef

// 钻进沙里先飞快地游 1.5 秒，到点才蓄力破土，不可选中要盖住蓄力
const burrow = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 3500,
  aim: 'nearest',
  range: 8,
  fireSfx: 'rumble',
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'untargetable', durationMs: 2200 },
        { kind: 'buff', speedMul: 2.5, durationMs: 1500 },
        { kind: 'fuse', ms: 1500, then: [{ kind: 'cast', ability: erupt }] },
      ],
    },
  ],
} satisfies AbilityDef

const quicksand = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 11000,
  firstDelayMs: 5000,
  aim: 'nearest',
  range: 10,
  fireSfx: 'rumble',
  shape: { kind: 'disc', radius: 1, at: 'target' },
  onHit: [{ kind: 'ground', def: { ...patch(4.5, 5000, 0xd7ccc8, undefined, 4, 500), pull: 1.6, exertion: 5 } }],
} satisfies AbilityDef

const swallow = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 7000,
  aim: 'nearest',
  range: 2.6,
  fireSfx: 'gulp',
  windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 2.2, radius: 0.7, ms: 200 },
  onHit: [{ kind: 'devour', ms: 3000, dps: 12, escape: 150, spit: 3 }],
} satisfies AbilityDef

const SANDWORM = {
  kind: 'sandworm',
  role: 'boss',
  emoji: '1fab1',
  name: '巨沙虫',
  element: 'earth',
  desc: '盘在沙海底下的巨沙虫：张口喷沙让人走不快；钻进沙里谁也打不着，先在沙下飞快地游上 1.5 秒，再从最近的人脚下破土而出把人掀上天，然后钻回原处；往人脚下翻出 4.5 格的流沙漩涡，把人往中心卷，在里面每走一格多耗 5 点体力；还会一口把人吞进肚子慢慢消化，挨够了打才吐出来；血掉到一半翻起沙来，召出四只行军蚁，出招也更勤',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 3000,
  stats: { armor: 6, exertion: 0 },
  speed: 1.2,
  damage: 18,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [sandSpray, burrow, quicksand, swallow],
  phases: [{ below: 0.5, name: '翻沙', stats: { mul: { cooldown: 0.8 } }, effects: [{ kind: 'summon', of: { unit: ARMY_ANT, spread: 2 }, count: 4 }] }],
} satisfies EnemyDef

export default SANDWORM
