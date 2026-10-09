import type { EnemyDef } from '../../../../legacy/types/enemies'

const SMILEY = {
  kind: 'smiley',
  emoji: '1f600',
  name: '笑脸兵',
  desc: '挂着一模一样的笑脸成群追来；倒下时把笑意留给 3 格内的同伴，头目以外的各回一成生命',
  size: 1.25,
  radius: 0.46,
  hp: 70,
  speed: 1.9,
  damage: 10,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [{ kind: 'to', who: { side: 'allies', radius: 3, filter: { kind: 'not', cond: { kind: 'boss', who: 'target' } } }, then: [{ kind: 'healRatio', ratio: 0.1 }] }],
    },
  ],
} satisfies EnemyDef

export default SMILEY
