import { design } from './design.ts'
import { ellipse, INK, poly, RAMP, smooth } from './kit.ts'

/** 🤹 杂耍演员：橘红的马戏衫，两手摊开往上托，头顶三只油亮的球 */
export const JUGGLER = design({
  name: '杂耍演员',
  draw: (p) => {
    const shirt = smooth([[5.6, 36.6], [6.2, 31.2], [9.2, 27.8], [14, 26.4], [21.4, 26.4], [26.4, 27.6], [29.6, 30.8], [30.4, 36.6]])
    const vest = smooth([[11.4, 36.6], [12.2, 30.6], [14.8, 27.4], [17.6, 30.4], [20.4, 27.4], [23.2, 30.6], [24.2, 36.6]])
    const neck = smooth([[14.4, 22], [21, 22], [21.2, 28.6], [17.8, 30.2], [14.2, 28.6]])
    const hair = smooth([[8.6, 22.4], [7.2, 17.6], [7.4, 12.4], [9.8, 7.6], [13.8, 4.8], [18.6, 3.8], [23.2, 5], [26.6, 8.6], [27.8, 13.4], [27.2, 19.6], [25.8, 23.4]])
    const face = smooth([[17.4, 9.6], [22.6, 11], [24.8, 15.8], [24.4, 21], [21.8, 24.8], [17.4, 26.2], [13, 24.8], [10.4, 21], [10, 15.8], [12.2, 11]])
    const fringe = smooth(
      [[9.4, 16.4], [9.6, 11.2], [12.4, 7.4], [17, 5.6], [22, 6.2], [25.4, 9.2], [26.4, 14.2], [24.2, 11.6], [22.8, 13.4], [21, 10.6], [18.6, 12.6], [16.8, 10.2], [14.2, 12.8], [12.8, 11], [11, 14.2]],
      true,
      0.55,
    )
    const armL = smooth([[9.6, 28.4], [6, 27.6], [2.6, 27], [0.6, 27.6], [0.6, 29.4], [3.6, 30.2], [7.6, 31.2], [9.8, 31.2]])
    const cuffL = smooth([[5.6, 27.4], [7.8, 27.9], [7.4, 31], [5.2, 30.6]])
    const armR = smooth([[26.4, 27.2], [29.6, 25.6], [33, 24.2], [35.4, 24.2], [35.6, 25.8], [33, 27], [30, 29.2], [27.6, 30.6]])
    const cuffR = smooth([[29.4, 25.7], [31.4, 24.8], [32.2, 27.2], [30.4, 28.4]])
    const ball = (cx: number, cy: number, r: typeof RAMP.red): string => p.form(ellipse(cx, cy, 3.4, 3.4), r, { depth: 1.2, rim: 0.7, bounce: 0.5 }) + p.gloss(cx - 1.1, cy - 1.2, 1.2, 0.8)
    return {
      shirt:
        p.form(shirt, RAMP.orange, { depth: 1.8 }) +
        p.form(vest, RAMP.crimson, { depth: 1.2, rim: 0.6 }) +
        `<path d="${ellipse(17.8, 33.2, 0.8, 0.8)}" fill="${RAMP.gold.base}" stroke="${INK}" stroke-width="0.4"/>`,
      neck: p.form(neck, RAMP.skin, { depth: 1, rim: 0.4, bounce: 0 }) + p.cast(neck, face, 1.2, 0.4),
      armR: p.form(armR, RAMP.skin, { depth: 0.9, rim: 0.5 }) + p.form(cuffR, RAMP.orange, { depth: 0.6, rim: 0.4, bounce: 0 }),
      armL: p.form(armL, RAMP.skin, { depth: 0.9, rim: 0.5 }) + p.form(cuffL, RAMP.orange, { depth: 0.6, rim: 0.4, bounce: 0 }),
      head:
        p.form(hair, RAMP.auburn, { depth: 1.4, rim: 0.7, bounce: 0 }) +
        p.form(face, RAMP.skin, { depth: 2, rim: 1 }) +
        p.blush(12.8, 20.2, 1.8, 1.1) +
        p.blush(22, 20.2, 1.8, 1.1) +
        p.eye(14.4, 17, 1.05, 1.45) +
        p.eye(20.4, 17, 1.05, 1.45) +
        p.line('M12.8 14.2C13.8 13.4 15.2 13.4 16 13.9M18.8 13.9C19.6 13.4 21 13.4 22 14.2', 0.55) +
        p.line('M17 19.4L17.8 20.2', 0.5, INK, 0.6) +
        p.line(smooth([[14.4, 22], [17.4, 23.4], [20.4, 22]], false), 0.7) +
        p.form(fringe, RAMP.auburn, { depth: 0.8, rim: 0.6, bounce: 0 }) +
        p.line(smooth([[11.4, 10.6], [14, 7.8], [17.8, 6.9]], false), 0.8, RAMP.auburn.hi, 0.8),
      ballA: ball(4.6, 11, RAMP.leaf),
      ballB: ball(22.5, 3.6, RAMP.red),
      ballC: ball(32.3, 17.9, RAMP.water),
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['ballA'] },
        { layers: ['ballB'] },
        { layers: ['ballC'] },
        { layers: ['armR'], cx: 30, cy: 25 },
        { layers: ['armL'], cx: 6, cy: 25 },
        { layers: ['head'], cx: 17, cy: 18 },
      ],
    },
  },
})

/** 🦄 独角兽：珍珠白的马头朝左，紫鬃顺着脖子披下来，额前一根金色螺纹的角 */
export const UNICORN = design({
  name: '独角兽',
  draw: (p) => {
    const head = smooth([
      [15.8, 5.6], [21.8, 5.8], [27.4, 9.2], [31.4, 15.4], [34.4, 23.6], [35.6, 32], [35.6, 36.6], [22.2, 36.6], [21.8, 31.4],
      [19.6, 27.4], [15.4, 27.6], [11, 29], [7.6, 29.2], [5.2, 27.6], [5.2, 24.8], [7.6, 20.6], [10.2, 15.4], [12.2, 10.2], [13.8, 6.8],
    ])
    const muzzle = smooth([[4.6, 26], [6.4, 22.8], [10.4, 22.6], [12.4, 25.4], [11, 28.6], [7.2, 29.4]])
    const mane = smooth([
      [15.2, 5], [20.2, 2.6], [26.4, 3.4], [31.6, 7.4], [35, 13.4], [36.6, 20.6], [35.8, 27.6], [33.4, 22], [31, 16.8], [28.2, 12.6],
      [24.6, 9.6], [20.6, 7.8], [17.4, 8.6], [15.2, 10.4], [13.8, 8.6],
    ])
    const ear = smooth([[14.6, 9.6], [14.8, 5.6], [16.6, 2.2], [18.8, 5.4], [18.8, 9.4]], true, 0.7)
    const earIn = smooth([[15.6, 8.8], [15.8, 5.8], [16.8, 3.8], [17.9, 6], [17.8, 8.8]], true, 0.7)
    const horn = smooth([[9.3, 11.2], [5.2, 6.4], [1.3, 1.3], [7, 4.6], [13.1, 8.5]], true, 0.6)
    return {
      head:
        p.form(head, RAMP.pearl, { depth: 2.2, rim: 1.1 }) +
        p.within(head, p.form(muzzle, RAMP.pearl, { depth: 1, rim: 0.5, bounce: 0, ink: 0 }) + `<path d="${ellipse(8.6, 26.6, 3.4, 2.4, -10)}" fill="#e9b9c4" opacity="0.45"/>`) +
        `<path d="${ellipse(7.3, 26.3, 0.85, 1.25, -20)}" fill="${INK}"/>` +
        p.line(smooth([[5.8, 28.4], [7.8, 29.1], [9.8, 28.7]], false), 0.55) +
        p.line(smooth([[14.8, 19.8], [16.6, 22.8], [17.2, 26.8]], false), 0.55, INK, 0.55),
      mane:
        p.form(mane, RAMP.violet, { depth: 1.6, rim: 0.9 }) +
        p.within(
          mane,
          p.line(smooth([[20, 4.4], [26.2, 5.6], [31.2, 10.6], [33.8, 17.4]], false), 0.7, RAMP.violet.hi, 0.75) +
            p.line(smooth([[18.4, 6.4], [24.2, 7.4], [29.2, 11.8], [32.4, 19]], false), 0.55, RAMP.violet.deep, 0.7) +
            p.line(smooth([[22.6, 3.6], [28.6, 6.4], [33.2, 12.4]], false), 0.5, '#f0c8ff', 0.6),
        ),
      ear: p.form(ear, RAMP.pearl, { depth: 0.8, rim: 0.5, bounce: 0 }) + p.flat(earIn, '#d99ab0'),
      eye: p.eye(15.3, 14.6, 1.25, 1.45) + p.line('M13.6 13C14.6 12.2 16 12.1 17.2 12.8', 0.5),
      horn:
        p.form(horn, RAMP.gold, { depth: 0.8, rim: 0.5, bounce: 0 }) +
        p.within(horn, p.line('M10.6 5.4L8.4 9.6M8 3.6L5.8 6.8M5.4 2.2L3.6 4.4', 0.55, RAMP.gold.deep, 0.9) + p.line('M11.4 6.2L9.4 9.8M8.8 4.2L6.8 7.2', 0.45, RAMP.gold.hi, 0.8)),
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['horn'], cx: 11, cy: 10 },
        { layers: ['mane'], cx: 24, cy: 8 },
        { layers: ['eye'], cx: 15.3, cy: 14.6 },
      ],
    },
  },
})

/** 🧑‍🚒 消防员：红头盔上一枚铜徽，黄棕防火外套配反光条，黑背带 */
export const FIREFIGHTER = design({
  name: '消防员',
  draw: (p) => {
    const coat = smooth([[3.6, 36.6], [4.2, 31.4], [7.8, 28.2], [13.4, 26.8], [22.6, 26.8], [28.2, 28.2], [31.8, 31.4], [32.4, 36.6]])
    const collar = poly([[14, 27.2], [22, 27.2], [20.6, 33.4], [18, 35], [15.4, 33.4]])
    const neck = smooth([[14.6, 22.2], [21.4, 22.2], [21.6, 28.6], [18, 30], [14.4, 28.6]])
    const brim = ellipse(18, 15.6, 14.4, 4.4)
    const hair = smooth([[9.6, 21.4], [8.6, 15.6], [10.2, 11.8], [25.8, 11.8], [27.4, 15.6], [26.4, 21.4]])
    const face = smooth([[18, 9.6], [23.2, 10.8], [25.8, 15.6], [25.4, 21], [22.6, 25], [18, 26.6], [13.4, 25], [10.6, 21], [10.2, 15.6], [12.8, 10.8]])
    const strapL = poly([[9.6, 27.8], [12.6, 27.2], [14, 36.6], [10.8, 36.6]])
    const strapR = poly([[26.4, 27.8], [23.4, 27.2], [22, 36.6], [25.2, 36.6]])
    const lapelL = poly([[13.6, 26.9], [16.4, 36.6], [13.8, 36.6], [11.8, 29.6]])
    const lapelR = poly([[22.4, 26.9], [19.6, 36.6], [22.2, 36.6], [24.2, 29.6]])
    const dome = smooth([[5.8, 13.4], [6.4, 8.2], [9.8, 3.8], [14.6, 1.5], [18, 1.1], [21.4, 1.5], [26.2, 3.8], [29.6, 8.2], [30.2, 13.4], [24, 13.9], [18, 14.1], [12, 13.9]])
    const badge = smooth([[14.2, 3.2], [18, 2], [21.8, 3.2], [21.6, 7.8], [18, 11.2], [14.4, 7.8]], true, 0.7)
    return {
      coat:
        p.form(coat, RAMP.tan, { depth: 1.8 }) +
        p.within(coat, `<path d="M0 32.4H36V34.8H0Z" fill="${RAMP.gold.base}"/><path d="M0 33.2H36V34H0Z" fill="${RAMP.steel.hi}"/>` + p.line('M0 32.4H36M0 34.8H36', 0.4)),
      collar: p.form(collar, RAMP.night, { depth: 0.8, rim: 0.4, bounce: 0 }),
      neck: p.form(neck, RAMP.skin, { depth: 1, rim: 0.4, bounce: 0 }) + p.cast(neck, face, 1.2, 0.4),
      brim: p.form(brim, RAMP.crimson, { depth: 1.2, rim: 0.6 }),
      hair: p.form(hair, RAMP.auburn, { depth: 0.8, rim: 0.5, bounce: 0 }),
      face:
        p.form(face, RAMP.skin, { depth: 2, rim: 1 }) +
        p.blush(13.2, 20.6, 1.8, 1.1) +
        p.blush(22.8, 20.6, 1.8, 1.1) +
        p.line('M12.8 13.8C13.8 13 15.4 13 16.4 13.6M19.6 13.6C20.6 13 22.2 13 23.2 13.8', 0.55) +
        p.line('M17.6 19.2L18.4 20', 0.5, INK, 0.6) +
        p.line(smooth([[15, 22.4], [18, 23.8], [21, 22.4]], false), 0.7),
      eyes: p.eye(14.8, 16.2, 1.05, 1.45) + p.eye(21.2, 16.2, 1.05, 1.45),
      straps: p.form(strapL, RAMP.night, { depth: 0.6, rim: 0.4, bounce: 0 }) + p.form(strapR, RAMP.night, { depth: 0.6, rim: 0.4, bounce: 0 }),
      front: p.form(lapelL, RAMP.tan, { depth: 0.6, rim: 0.4, bounce: 0 }) + p.form(lapelR, RAMP.tan, { depth: 0.6, rim: 0.4, bounce: 0 }),
      helmet:
        p.form(dome, RAMP.red, { depth: 1.6, rim: 1 }) +
        p.within(dome, p.line('M18 1.4V13.8', 1.6, RAMP.red.lo, 0.7) + p.line('M17.2 1.6V13.6', 0.5, RAMP.red.hi, 0.6)) +
        p.form(badge, RAMP.gold, { depth: 0.8, rim: 0.5, bounce: 0 }) +
        `<path d="${ellipse(18, 6.4, 1.5, 1.5)}" fill="${RAMP.gold.lo}" stroke="${INK}" stroke-width="0.4"/>`,
      shine: `<path d="${smooth([[8.6, 9.4], [10.4, 5.6], [13.4, 3.4], [12.6, 5.6], [10.4, 8.4]])}" fill="#fff4dc" opacity="0.8"/>`,
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['coat'], cx: 18, cy: 36 },
        { layers: ['collar'], cx: 18, cy: 36 },
        { layers: ['neck'], cx: 18, cy: 36 },
        { layers: ['eyes'], cx: 18, cy: 16.2 },
        { layers: ['straps'], cx: 18, cy: 36 },
        { layers: ['shine'] },
        { layers: ['front'], cx: 18, cy: 36 },
      ],
    },
  },
})

/** 🤠 牛仔：一张咧嘴笑的圆脸，戴一顶两边上翘的旧毡帽，帽带上别着一枚铜扣 */
export const COWBOY = design({
  name: '牛仔',
  draw: (p) => {
    const face = ellipse(18, 22.2, 15, 13.6)
    const mouth = smooth([[10.6, 26.2], [18, 27.6], [25.4, 26.2], [23.4, 30.6], [18, 32.6], [12.6, 30.6]], true, 0.8)
    const tongue = smooth([[15.2, 31.2], [18, 29.6], [20.8, 31.2], [18, 32.4]])
    const brim = smooth([[0.4, 9.4], [4.4, 12.6], [10, 14.2], [18, 14.6], [26, 14.2], [31.6, 12.6], [35.6, 9.4], [34.8, 13.2], [30.4, 16.8], [24.2, 18.4], [18, 18.8], [11.8, 18.4], [5.6, 16.8], [1.2, 13.2]])
    const crown = smooth([[10.8, 14], [10.2, 8.4], [12.2, 4], [15.4, 2.6], [18, 4.4], [20.6, 2.6], [23.8, 4], [25.8, 8.4], [25.2, 14], [18, 15]])
    return {
      face:
        p.form(face, RAMP.skin, { depth: 2.8, rim: 1.4 }) +
        p.blush(8.8, 25, 2.4, 1.5) +
        p.blush(27.2, 25, 2.4, 1.5) +
        p.eye(12.8, 21.4, 1.6, 2.3) +
        p.eye(23.2, 21.4, 1.6, 2.3) +
        p.flat(mouth, '#5a2016', 0.7) +
        p.within(mouth, p.flat(tongue, '#d8645a') + `<path d="M11 26.2C15 27.8 21 27.8 25 26.2L24.6 27.6C20.6 28.9 15.4 28.9 11.4 27.6Z" fill="#fff4dc"/>`),
      brim:
        p.form(brim, RAMP.felt, { depth: 1.2, rim: 0.7 }) +
        p.line(smooth([[3, 12.4], [10, 15.4], [18, 15.8], [26, 15.4], [33, 12.4]], false), 0.45, RAMP.felt.hi, 0.6),
      crown:
        p.form(crown, RAMP.felt, { depth: 1.4, rim: 0.8, bounce: 0 }) +
        p.within(crown, p.line('M18 4.6C17.4 7.4 17.6 10 18.2 12', 0.5, INK, 0.7) + `<path d="M8 10.6C14 11.6 22 11.6 28 10.6V13.2C22 14.2 14 14.2 8 13.2Z" fill="${RAMP.night.base}"/>`),
      band: `<path d="${ellipse(22.4, 12, 1.25, 1.1)}" fill="${RAMP.gold.base}" stroke="${INK}" stroke-width="0.4"/><path d="${ellipse(22.1, 11.7, 0.45, 0.4)}" fill="#fff4dc"/>`,
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['brim', 'crown', 'band'], cx: 18, cy: 9 },
        { layers: ['face'], cx: 18, cy: 24 },
      ],
    },
  },
})
