import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const CHILI = {
  kind: 'chili',
  emoji: '1f336',
  name: '辣椒怪',
  element: 'fire',
  desc: '辣得冒烟的辣椒怪，不怕岩浆：一路狂奔过来，贴到身边就涨红了脸闪烁半秒，随即炸开一圈，自己也炸没了；半路被打死也照样炸',
  size: 1.15,
  radius: 0.42,
  span: [0, 1],
  hp: 52,
  speed: 2.4,
  damage: 12,
  xp: 3,
  coins: 2,
  traits: ['fireproof'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 1.2,
      damage: 24,
      color: 0xff5722,
      fireSfx: 'boom',
      windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 1.6, at: 'self' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [
        { kind: 'ground', def: patch(1.6, 300, 0xff5722, undefined, 0, 0) },
        { kind: 'to', who: { side: 'foes', radius: 1.6 }, then: [{ kind: 'damage', amount: 20 }] },
      ],
    },
  ],
} satisfies EnemyDef

export default CHILI
