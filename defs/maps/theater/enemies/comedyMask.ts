import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const COMEDY_MASK = {
  kind: 'comedyMask',
  emoji: '1f602',
  name: '喜剧面具',
  element: 'poison',
  desc: '飘在半空的喜剧面具，咯咯笑着贴上来，碰到谁谁就中一层毒；有同伴受了伤就笑一阵，身边 4 格内受了伤的（连它自己，头目除外）各回 6% 的生命，中了毒的回不了，笑完要歇 4 秒；倒下时笑出一团 1.6 格的笑气毒云，留 3 秒，火打进去就炸；本身是毒，毒不倒它',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 65,
  speed: 1.8,
  damage: 8,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'self',
      fireSfx: 'chirp',
      color: 0xfff59d,
      shape: { kind: 'disc', radius: 4, at: 'self', of: 'hurt' },
      onHit: [{ kind: 'if', when: { kind: 'boss', who: 'target' }, then: [], else: [{ kind: 'healRatio', ratio: 0.06 }] }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.6, 3000, 0x9ccc65, undefined, 3, 500) }] }],
} satisfies EnemyDef

export default COMEDY_MASK
