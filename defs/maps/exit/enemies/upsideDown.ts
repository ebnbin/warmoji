import type { EnemyDef } from '../../../../legacy/types/enemies'

const UPSIDE_DOWN = {
  kind: 'upsideDown',
  emoji: '1f643',
  name: '倒脸',
  element: 'water',
  desc: '倒着长的脸，脸里的水一直往外倒，慢吞吞地追来，碰到的人也被浇湿；每隔 5 秒朝 6 格内最近的队员兜头泼一下水，再和他对调位置，湿透的人 5 秒内一冰就冻、一电一片；本身一直是湿的，挨冰当场冻住，挨电连着身边湿的同伴一起挨',
  size: 1.25,
  radius: 0.46,
  hp: 120,
  speed: 1.5,
  damage: 8,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 2500,
      aim: 'nearest',
      range: 6,
      fireSfx: 'splash',
      shape: { kind: 'world' },
      // 先泼再换：换位时在穿行，打不中
      onHit: [{ kind: 'to', who: { side: 'foes', radius: 6, sort: 'nearest', count: 1 }, then: [{ kind: 'damage', amount: 6 }, { kind: 'swap' }] }],
    },
  ],
} satisfies EnemyDef

export default UPSIDE_DOWN
