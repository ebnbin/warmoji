import type { EnemyDef } from '../../../../legacy/types/enemies'

const SATELLITE = {
  kind: 'satellite',
  emoji: '1f6f0',
  name: '失控卫星',
  element: 'thunder',
  desc: '脱了轨的人造卫星，本身是雷，别处跳来的电流跳不到它身上；金属外壳护甲 5，拳脚刀枪打上去掉得少，燃烧这类不吃护甲的最管用：飘在半空，和人隔着 5 格左右吊着，凑近了就往后退；闪烁 0.7 秒后朝人射出一道 7 格长的电光，沿线的人出手被打断，电流再跳到身边的另一名队员；闪烁开始时就定了方向，侧身躲得开',
  size: 1.4,
  radius: 0.5,
  span: [2, 3],
  hp: 105,
  stats: { armor: 5, exertion: 0 },
  speed: 1.4,
  damage: 9,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 7,
      damage: 12,
      color: 0xffd54f,
      fireSfx: 'zap',
      windup: { ms: 700, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'segment', reach: 7, radius: 0.4, ms: 200, beam: true },
    },
  ],
} satisfies EnemyDef

export default SATELLITE
