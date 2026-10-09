import type { EnemyDef } from '../../../../legacy/types/enemies'

const COMEDY_MASK = {
  kind: 'comedyMask',
  emoji: '1f602',
  name: '喜剧面具',
  desc: '飘在半空的喜剧面具，咯咯笑着贴上来；有同伴受了伤就笑一阵，身边 4 格内受了伤的（连它自己，头目除外）各回 6% 的生命，笑完要歇 4 秒',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 65,
  speed: 1.8,
  damage: 10,
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
} satisfies EnemyDef

export default COMEDY_MASK
