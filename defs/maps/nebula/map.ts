import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f30c',
  name: '视界',
  desc: '深空里一团空心的星云，空腔里藏着一个黑洞。这里没有太阳，光来自黑洞的吸积盘、星云里此起彼伏诞生又死去的恒星和偶尔划过的流星，它们把星云照成各种颜色。人、怪、金币、子弹和流星都受万有引力：身体被拖着漂，子弹和流星的轨迹被引弯；黑洞周围那圈被弯过来的光就是走不出来的地方，掉进视界就被吞掉，吞下的东西让黑洞越长越大。空腔外是厚厚的星云壳层，往里走得越深被拉回得越狠，谁也出不去',
  kind: 'nebula',
  stamina: { exertion: 0.4, regen: 0.9 },
  palette: {
    bgFrom: 'hsl(240 8% 8%)',
    bgTo: 'hsl(240 10% 3%)',
    map: hslToInt(240, 0.08, 0.07),
  },
  // 没有太阳：主光是黑洞的吸积盘，迎着它的一面是盘光的蓝白，背面偏冷偏暗；没有接影子的地面
  light: { sun: 0xf4f6ff, shade: 0x8f97b8 },
  decor: {
    emojis: ['2728'],
    sizeU: [0.3, 0.5],
    alpha: [0, 0],
    density: [0, 0],
  },
  foes: ['spaceInvader', 'starRam', 'shootingStar', 'exploder', 'warped', 'darkMatter', 'satellite', 'weightless'],
  gates: {
    snapU: 3,
    fallback: 'rise',
    look: 'glow',
    boss: 'horizon',
    kinds: {
      shell: { name: '壳层', at: { kind: 'rim', segU: 3, away: { mark: 'hole', minU: 10 } }, enter: 'climb', look: 'glow', weight: 3, perSec: 1.5, only: ['spaceInvader', 'shootingStar', 'darkMatter', 'starRam', 'exploder', 'warped'] },
      sky: { name: '上空', at: { kind: 'ground' }, enter: 'drop', look: 'glow', weight: 1.5, only: ['satellite', 'darkMatter', 'spaceInvader', 'weightless'] },
      meteor: { name: '流星', at: { kind: 'mark' }, enter: 'lob', look: 'sparks', weight: 4, perSec: 3, reachU: 20, only: ['shootingStar'] },
      horizon: { name: '视界边', at: { kind: 'mark' }, enter: 'walk', look: 'glow', weight: 1, only: ['mothership', 'singularity'] },
      dust: { name: '星尘', at: { kind: 'ground' }, enter: 'rise', look: 'glow', weight: 1 },
    },
  },
  nebula: {
    shell: { innerU: 16, outerU: 24, gm: 3_000_000, rise: 1.5, tau: 90 },
    contain: { speedMul: 1.5, depthU: 2, leapU: 8 },
    hole: { gm: 360, maxGm: 560, lightU: 33, fromCenterU: [10, 10.5] },
    swallow: { bodyGm: 4, bodyRadiusU: 0.45, pickupGm: 0.05, shotGm: 0.02, lightEta: 1 / 256 },
    accretion: { bondiGm: 0.05, riseMs: 200, viscousMs: 2500 },
    disk: { outerRs: 4.5, innerK: 16000 },
    meteor: {
      firstMs: 9000,
      intervalMs: 16000,
      intervalJitterMs: 5000,
      warnMs: 1800,
      speedU: 11,
      speedJitter: 0.15,
      radiusU: 0.85,
      shatterU: 1.2,
      offsetU: 5,
      damage: 24,
      gm: 6,
      maxFlightMs: 7000,
    },
    spawnClearU: 1.5,
    cameraU: 48,
  },
  bosses: ['mothership', 'singularity'],
} as const satisfies MapDef
