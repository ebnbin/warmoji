import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f48e',
  name: '紫晶洞',
  desc: '玄武岩里一座巨大的紫水晶晶洞：几个晶洞连成洞厅，洞壁上密密麻麻长满紫色的晶体，其中几片是金黄的黄水晶，洞底立着一丛丛晶簇，几根巨晶从洞壁斜伸进来。阳光从塌开的洞顶和几道顶缝照进来，随太阳东升西落，照到哪里哪里的晶体就闪起来：白天看得到大半个洞；黄昏光变红、洞里一点点暗下来；入夜后只看得清火把照亮的那一圈，晶体映着火光。开局那天正是中秋：头一夜一轮满月，升高以后月光从塌顶照进来。怪物只从暗处出来：白天从拐进岩体深处的暗道里，夜里也会从地上半埋的晶洞里爬出来、从顶缝落下来。晶簇和巨晶挡人也挡子弹，塌下来的碎晶坡走着慢',
  kind: 'amethyst',
  size: { w: 36, h: 36 },
  stamina: { exertion: 0.5, regen: 1 },
  palette: {
    bgFrom: 'hsl(276 42% 24%)',
    bgTo: 'hsl(272 48% 7%)',
    map: hslToInt(276, 0.46, 0.44),
  },
  // 洞里的明暗由光照层按开口与火把画，精灵只按光从哪边来分出迎光面与背光面；光不从太阳来，不投影
  light: { sun: 0xffffff, shade: 0x8a82a0 },
  decor: {
    emojis: ['26cf', '1f9b4', '1faa8'],
    sizeU: [0.35, 0.65],
    alpha: [0.6, 0.85],
    density: [0.02, 0.035],
  },
  foes: ['caveBat', 'geodeling', 'lurker', 'hollow', 'peeker', 'caveTroll', 'coffin', 'darkMoon'],
  gates: {
    snapU: 3,
    fallback: 'rise',
    look: 'shards',
    boss: 'breach',
    kinds: {
      tunnel: { name: '暗道', at: { kind: 'mark' }, enter: 'walk', weight: 3, perSec: 1.5 },
      seam: { name: '晶缝', at: { kind: 'nooks', spacingU: 6, away: { mark: 'passage', minU: 2.5 } }, enter: 'walk', look: 'shards', weight: 2, perSec: 1, only: ['cheshire', 'geodeling', 'lurker', 'caveBat', 'hollow', 'peeker'] },
      geode: { name: '晶洞', at: { kind: 'mark' }, enter: 'rise', look: 'shards', weight: 2, perSec: 1, only: ['geodeling', 'lurker', 'cheshire', 'coffin'] },
      rift: { name: '顶缝', at: { kind: 'mark' }, enter: 'drop', weight: 1.5, perSec: 1, only: ['geodeling', 'caveBat', 'hollow', 'darkMoon'] },
      breach: { name: '塌顶', at: { kind: 'mark' }, enter: 'drop', weight: 1, only: ['vampireCount', 'fullMoon'] },
      dark: { name: '暗处', at: { kind: 'ground' }, enter: 'rise', weight: 1 },
    },
  },
  amethyst: {
    chambers: { mainU: [9.8, 10.6], driftU: 1.2, sideCount: [3, 4], sideU: [4.8, 6.2], overlapU: [2.6, 3.6], jitter: 0.1, wobbleU: 0.5, waveU: 3, neckU: 0.8, rimU: 1.6, ceilingM: 9, wallU: 2.4 },
    tunnels: { count: [3, 4], widthU: 2.4, outU: 3.2, turnU: [3, 4.2], pocketU: 1.5, rockU: 1.1 },
    openings: { breachU: [3, 3.6], breachOffsetU: [4.4, 6], sideBreaches: [0, 1], sideBreachU: [1.8, 2.4], rifts: [2, 3], riftLenU: [5, 7.5], riftWidthU: [0.7, 1.1], jitter: 0.18, gapU: 2.5, debrisM: 1.1, debrisSpread: 1.12 },
    crystals: { clusters: [9, 12], clusterU: [0.65, 1.15], clusterM: [1.9, 2.9], beams: [2, 3], beamU: [1, 1.2], beamLenU: [3.5, 5.5], geodes: [4, 6], geodeU: [0.5, 0.75], geodeM: 0.42, druse: [26, 36], druseU: [0.14, 0.3], druseM: [0.22, 0.5], clearU: 4.8 },
    debris: { viscosity: 1.3, exertion: 1.15 },
    // 开局那天是中秋：太阳在秋分点上，头一夜的子夜月亮正圆
    sky: { latitudeDeg: 22, declinationDeg: 0, startHour: 9.5, fullMoonHour: 24, twilightDeg: 7, dayS: 62, duskS: 26, nightS: 48, dawnS: 16, extinction: 0.21 },
    light: { albedo: 0.46, bounceU: 4.5, tunnelFadeU: 1.9 },
    torch: { candela: 110, heightM: 1.4, igniteLux: 15, douseLux: 40, staggerMs: 1400 },
    view: { dayU: 18, nightU: 7, darkLux: 0.5, brightLux: 30, clearLux: 2 },
    spawnLux: 1,
  },
  bosses: ['vampireCount', 'fullMoon'],
} as const satisfies MapDef
