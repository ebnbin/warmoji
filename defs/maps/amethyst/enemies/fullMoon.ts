import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const FULL_MOON = {
  kind: 'fullMoon',
  role: 'boss',
  emoji: '1f31d',
  name: '满月',
  element: 'water',
  desc: '中秋夜悬在塌顶下的一轮满月，总和人隔着四五格，月华如水，本身是水，一直湿着，一冰就冻、一电一片，火点不着：朝人打出一道 8 格长的月光柱，打中的浇湿；往最近的四个人头上落下月石；隔一阵掀起潮汐，把 6 格内的人往身边拽、浇得一身湿。血掉到六成迎来月食，身子变成冰，冻不住了，换火与刀来打：月光柱冷得刺骨，打中的叠一层寒冷，湿的当场冻住，冻住的再挨月石就碎冰、伤害翻倍。只剩两成五时中秋团圆，回一成生命（中着毒就回不了），出手间隔缩到 0.75 倍',
  size: 3.5,
  radius: 1.15,
  span: [0, 6],
  hp: 6000,
  stats: { armor: 3, exertion: 0 },
  speed: 1,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'standoff', standoffDist: 4.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3400,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      damage: 18,
      fireSfx: 'zap',
      color: 0xfff59d,
      windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'segment', reach: 8, radius: 0.6, ms: 300, beam: true },
    },
    {
      trigger: 'auto',
      cooldownMs: 5200,
      firstDelayMs: 3000,
      aim: 'nearest',
      range: 9,
      element: 'physical',
      damage: 18,
      fireSfx: 'crumble',
      shape: { kind: 'drop', targets: 4, look: { emoji: '1f319', size: 1 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
    },
    {
      trigger: 'auto',
      class: 'skill',
      cooldownMs: 11000,
      firstDelayMs: 6000,
      aim: 'self',
      when: { kind: 'foesNear', who: 'self', radius: 6, atLeast: 1 },
      element: 'water',
      fireSfx: 'wash',
      shape: { kind: 'zone', radius: 6, durationMs: 3000, tickMs: 1000, pull: 2, visual: zoneLook(0x90caf9) },
    },
  ],
  phases: [
    { below: 0.6, name: '月食', element: 'ice' },
    { below: 0.25, name: '中秋', stats: { mul: { cooldown: 0.75 } }, effects: [{ kind: 'healRatio', ratio: 0.1 }] },
  ],
} satisfies EnemyDef

export default FULL_MOON
