import { design } from './design.ts'
import { ellipse, INK, RAMP, smooth } from './kit.ts'
import type { Pt } from './kit.ts'

/** 一条腿：从胯下到蹄子，上粗下细；x 是腿前沿在胯下的横坐标，w 是上端多宽，foot 是蹄子的宽 */
function leg(x: number, top: number, w: number, foot: number, knee = 0): string {
  const mid = top + (35 - top) * 0.55
  return smooth([
    [x, top], [x + w, top], [x + w * 0.85 + knee, mid], [x + (w + foot) / 2 + 0.2, 34.9], [x + (w - foot) / 2 - 0.2, 35], [x + w * 0.12 + knee, mid],
  ], true, 0.85)
}

/** 🐘 大象：灰褐的皮满是褶子，大耳朵像一面扇子盖在脖子上，长鼻子垂到地再往前一卷，一对短短的象牙 */
export const ELEPHANT = design({
  name: '大象',
  draw: (p) => {
    const far = leg(15, 22.5, 3.8, 3.6) + leg(27.4, 22.5, 3.8, 3.6)
    const body = smooth([[11.6, 13.4], [15.8, 8.8], [22.6, 7.4], [29.4, 8.6], [33.6, 12.8], [34.8, 18.6], [33.4, 23.8], [29.4, 26.8], [20.4, 27.6], [13.6, 26], [10.8, 20.6]])
    const legA = leg(10, 21.5, 4.8, 4.6, -0.2)
    const legB = leg(24, 22, 5, 4.6, 0.2)
    const head = smooth([[4.4, 13.2], [6.6, 8.4], [11.2, 6.4], [15.2, 8.2], [16.6, 13.4], [15, 18.8], [11, 22.2], [7.2, 22.4], [4.8, 19.6]])
    const trunk = smooth([[5.6, 18.6], [4.2, 22.6], [3.8, 27], [4.4, 31.2], [6, 33.2], [7.6, 32.4], [7.2, 30.6]], false)
    const ear = smooth([[11.8, 9.4], [15.6, 6.4], [20.8, 7], [22.8, 11.8], [22, 17.8], [18.6, 22.8], [15, 22], [13.2, 17.2]])
    const earIn = smooth([[13.6, 10.6], [16.4, 8.6], [20, 9], [21.2, 12.6], [20.6, 17], [18.2, 20.4], [15.8, 19.8], [14.6, 15.8]])
    const tusk = smooth([[6.6, 20.4], [5.6, 23.4], [7.2, 25.4], [9.6, 25], [8.6, 23], [8.4, 20.8]])
    const fold = (pts: readonly Pt[], w = 0.5, o = 0.6): string => p.line(smooth(pts, false), w, INK, o)
    return {
      back: p.form(far, RAMP.fur, { depth: 1, rim: 0.3, bounce: 0 }) + `<path d="${far}" fill="${INK}" opacity="0.25"/>`,
      body:
        p.form(body, RAMP.fur, { depth: 2.6, rim: 1.2 }) +
        p.within(body, fold([[26, 10], [27.4, 16], [27, 22]], 0.5, 0.35) + fold([[30.8, 12], [32, 17.6]], 0.45, 0.3) + p.line(smooth([[17, 9.4], [24, 8.4], [30, 10]], false), 0.6, RAMP.fur.hi, 0.6)) +
        p.form(legA, RAMP.fur, { depth: 1.2, rim: 0.6, bounce: 0.4 }) +
        p.form(legB, RAMP.fur, { depth: 1.2, rim: 0.6, bounce: 0.4 }) +
        [[10.8, 34.4], [13.2, 34.4], [25, 34.4], [27.4, 34.4]].map(([x, y]) => `<path d="${ellipse(x!, y!, 0.75, 0.5)}" fill="${RAMP.bone.base}" stroke="${INK}" stroke-width="0.3"/>`).join('') +
        fold([[10.6, 28.6], [12.6, 28.2], [14.4, 28.8]]) + fold([[24.6, 29], [26.8, 28.6], [28.8, 29.2]]) +
        p.line(smooth([[34.4, 14.6], [35.4, 18.6], [35.2, 22.4]], false), 0.7) +
        `<path d="${ellipse(35.1, 23, 0.6, 1)}" fill="${INK}"/>`,
      head:
        p.line(trunk, 4.6) +
        p.line(trunk, 3.4, RAMP.fur.base) +
        p.line(smooth([[4.8, 21], [4.4, 25.6], [4.8, 30.2]], false), 0.9, RAMP.fur.hi, 0.6) +
        [22.4, 24.6, 26.8, 29].map((y) => p.line(`M${3.6} ${y}L${5.6} ${y + 0.3}`, 0.4, INK, 0.55)).join('') +
        p.form(head, RAMP.fur, { depth: 1.8, rim: 1 }) +
        p.form(tusk, RAMP.bone, { depth: 0.6, rim: 0.4, bounce: 0 }) +
        p.eye(9.4, 13.4, 0.75, 0.85) +
        p.line(smooth([[7.8, 11.6], [9.2, 11], [10.8, 11.6]], false), 0.45, INK, 0.7),
      ear:
        p.form(ear, RAMP.fur, { depth: 1.2, rim: 0.8 }) +
        p.within(ear, `<path d="${earIn}" fill="${RAMP.pink.lo}" opacity="0.16"/>` + fold([[16.4, 10.6], [18.6, 14], [18.4, 18.4]], 0.45, 0.4) + fold([[19.4, 9.6], [20.6, 13.4]], 0.4, 0.35)),
    }
  },
})

/** 🦏 犀牛：低垂的大脑袋，鼻子上一长一短两只角，灰白的厚皮在肩胯处叠出几道大褶，四条腿又短又粗 */
export const RHINO = design({
  name: '犀牛',
  draw: (p) => {
    const far = leg(15, 23, 3.4, 3.4) + leg(28.8, 22.6, 3.6, 3.4)
    const body = smooth([[11.8, 15.4], [16.2, 11], [24, 9.8], [30.4, 11.4], [34.2, 15.4], [34.8, 21], [32.4, 25.6], [24, 27.4], [16, 26.8], [11.6, 23.2]])
    const legA = leg(10.8, 23, 4.6, 4.6, -0.2)
    const legB = leg(25, 22.8, 5, 4.8, 0.2)
    const head = smooth([[1.4, 23], [2.8, 19], [6.8, 15.6], [12.4, 14], [15.6, 17], [15.2, 23], [11.6, 26.6], [6.6, 27.8], [2.6, 26.6]])
    const horn = smooth([[1.8, 20.4], [1.2, 14.4], [2.4, 8.6], [3.8, 13.4], [5.8, 18.6]], true, 0.7)
    const horn2 = smooth([[6.4, 16.6], [6.8, 12.8], [7.8, 11.6], [8.6, 14.4], [9.6, 16]], true, 0.7)
    const ear = smooth([[12.2, 14.6], [12.2, 10.8], [13.8, 8.8], [15.2, 11.8], [14.6, 15]], true, 0.8)
    const fold = (pts: readonly Pt[], w = 0.55, o = 0.55): string => p.line(smooth(pts, false), w, INK, o)
    return {
      back: p.form(far, RAMP.hide, { depth: 1, rim: 0.3, bounce: 0 }) + `<path d="${far}" fill="${INK}" opacity="0.3"/>`,
      body:
        p.form(body, RAMP.hide, { depth: 2.8, rim: 1.2 }) +
        p.within(body, fold([[16.8, 12.2], [17.6, 18.6], [16.4, 25.4]]) + fold([[27.2, 11], [28.2, 17], [27.4, 25]]) + fold([[18.6, 22.4], [22.6, 23.4], [26.4, 22.8]], 0.45, 0.35) + p.line(smooth([[18, 11.6], [24, 10.6], [30, 12.2]], false), 0.6, RAMP.hide.hi, 0.7)) +
        p.form(legA, RAMP.hide, { depth: 1.2, rim: 0.6, bounce: 0.4 }) +
        p.form(legB, RAMP.hide, { depth: 1.2, rim: 0.6, bounce: 0.4 }) +
        fold([[11, 29.6], [13, 29.2], [15, 29.6]], 0.45) + fold([[25.2, 29.6], [27.4, 29.2], [29.6, 29.6]], 0.45) +
        p.line(smooth([[34.4, 16.4], [35.4, 19.6], [35.2, 22.4]], false), 0.65) +
        `<path d="${ellipse(35.1, 22.8, 0.5, 0.9)}" fill="${INK}"/>`,
      head:
        p.form(head, RAMP.hide, { depth: 2, rim: 1 }) +
        p.within(head, fold([[12.2, 15.4], [12.8, 20.4], [11.4, 25.4]], 0.5, 0.45)) +
        p.form(horn, RAMP.bone, { depth: 0.8, rim: 0.5, bounce: 0 }) +
        p.form(horn2, RAMP.bone, { depth: 0.5, rim: 0.4, bounce: 0 }) +
        p.eye(9.6, 20.4, 0.65, 0.75) +
        p.line(smooth([[1.8, 25.2], [4, 26.2], [6.6, 25.8]], false), 0.5) +
        `<path d="${ellipse(2.6, 23.2, 0.5, 0.7, -20)}" fill="${INK}"/>`,
      ear: p.form(ear, RAMP.hide, { depth: 0.8, rim: 0.5, bounce: 0 }) + p.flat(smooth([[13, 13.8], [13.2, 11.2], [14, 10.2], [14.6, 12.2], [14.2, 14]]), RAMP.pink.lo, 0),
    }
  },
})

/** 🐃 水牛：黑黢黢的大块头，肩上一个隆起，一对大角在额头上连成一块“头盔”，往两边垂下再往上翘，耳朵耷拉在角底下 */
export const BUFFALO = design({
  name: '水牛',
  draw: (p) => {
    const far = leg(15.6, 22.5, 3, 2.8) + leg(28.4, 22, 3.2, 2.8)
    const body = smooth([[11.4, 14], [15.4, 8.8], [21, 8.6], [27, 10], [32, 11.2], [34.8, 15.2], [34.6, 21], [31.6, 25.4], [22, 26.2], [14.6, 25.2], [11, 20.8]])
    const legA = leg(11.4, 22, 3.8, 3, -0.3)
    const legB = leg(25, 21.8, 4.2, 3, 0.4)
    const head = smooth([[2.6, 20], [4.4, 15.6], [8.6, 13.8], [12.4, 15.2], [13.2, 20.2], [10.8, 25], [6.6, 27.2], [3.4, 26], [2.2, 23]])
    const muzzle = smooth([[2.4, 22.6], [3.6, 21], [6, 21.4], [7, 24.4], [5.6, 26.8], [3, 26.2]])
    const horn = smooth([[4.6, 14.4], [8.4, 12], [12.8, 12.6], [16, 14.8], [17.2, 18.4], [16.6, 21], [15.6, 18.6], [13.8, 16.2], [10.4, 15.4], [7, 16.4]])
    const hornTip = smooth([[5.2, 14.4], [2.6, 14.6], [0.8, 12.8], [1.2, 10.4], [2.6, 12.4], [5, 12.8]])
    const ear = ellipse(13.6, 19.6, 2.4, 1.1, 28)
    return {
      back: p.form(far, RAMP.night, { depth: 0.8, rim: 0.3, bounce: 0 }) + `<path d="${far}" fill="${INK}" opacity="0.3"/>`,
      body:
        p.form(body, RAMP.night, { depth: 2.6, rim: 1.3 }) +
        p.within(body, p.line(smooth([[14.6, 10], [19.6, 9], [26, 10.6], [31.6, 12]], false), 0.7, RAMP.night.hi, 0.75) + p.line(smooth([[17.4, 12.4], [18, 18.6], [17, 24.6]], false), 0.5, INK, 0.45)) +
        p.form(legA, RAMP.night, { depth: 1, rim: 0.5, bounce: 0.5 }) +
        p.form(legB, RAMP.night, { depth: 1, rim: 0.5, bounce: 0.5 }) +
        p.line(smooth([[34.4, 15.6], [35.4, 20], [35.2, 24.8]], false), 0.65) +
        `<path d="${ellipse(35.1, 25.2, 0.65, 1.2)}" fill="${INK}"/>`,
      head:
        p.form(head, RAMP.night, { depth: 1.6, rim: 1 }) +
        p.within(head, p.form(muzzle, RAMP.fur, { depth: 0.8, rim: 0.5, bounce: 0, ink: 0 })) +
        `<path d="${ellipse(3.6, 23.6, 0.55, 0.75, -20)}" fill="${INK}"/>` +
        p.form(ear, RAMP.night, { depth: 0.6, rim: 0.4, bounce: 0 }) +
        p.eye(8, 18.8, 0.7, 0.8, '#3a1f14') +
        p.line(smooth([[6.6, 17.6], [8, 17], [9.4, 17.4]], false), 0.45, RAMP.night.hi, 0.6),
      horns:
        p.form(hornTip, RAMP.iron, { depth: 0.6, rim: 0.4, bounce: 0 }) +
        p.form(horn, RAMP.iron, { depth: 1, rim: 0.6, bounce: 0 }) +
        p.within(horn, p.line(smooth([[6.4, 13.6], [9.6, 12.8], [13, 13.6]], false), 0.5, RAMP.steel.lo, 0.6) + p.line('M9 13L9.4 15.2M11 12.8L11.4 15M12.8 13.2L13 15.4', 0.35, INK, 0.5)),
    }
  },
})

/** 斑马身上的一道条纹：沿着一串点描的一条墨线，宽窄 w */
function stripe(pts: readonly Pt[], w: number): string {
  return `<path d="${smooth(pts, false)}" fill="none" stroke="#1f1a22" stroke-width="${w}" stroke-linecap="round"/>`
}

/** 🦓 斑马：马一样的身架，白底上一道道黑纹，身上竖着、屁股上斜着、腿上横着；脖子上一溜立着的短鬃，黑口鼻，尾巴尖一撮黑毛 */
export const ZEBRA = design({
  name: '斑马',
  draw: (p) => {
    const farLegs = leg(15.8, 21.6, 2.4, 1.8) + leg(24.4, 21.6, 2.6, 1.8)
    const body = smooth([[12.2, 14.4], [16.4, 11.6], [24, 11.2], [30, 12.2], [33.2, 15.4], [33.2, 20.4], [30.6, 23.8], [22, 24.4], [15, 23.8], [12, 20.4]])
    const legA = leg(12.6, 21.4, 3, 2, -0.4)
    const legB = leg(27, 21, 3.4, 2, 0.6)
    const neck = smooth([[11.8, 16], [9.2, 9.4], [8.8, 5.4], [11.8, 4], [15.2, 7.4], [17.4, 13], [16.2, 17.6]])
    const head = smooth([[2.8, 10.6], [5.2, 6.2], [8.8, 3.6], [12.2, 4.4], [12, 8.2], [9.2, 11], [5.8, 13.6], [3.4, 13.4]])
    const muzzle = smooth([[2.6, 11], [3.8, 9.2], [6.2, 10.2], [6, 12.8], [3.6, 13.6]])
    const ear = smooth([[10.6, 4.4], [10.8, 1.4], [12.2, 0.4], [12.8, 2.8], [12, 5]], true, 0.7)
    const mane = smooth([[9.6, 4.6], [12.4, 3.2], [15.4, 6], [17.8, 11.4], [16.6, 11.8], [14.2, 7.6], [11.6, 5.6]])
    const all = body + neck
    const bodyStripes = [17, 19.4, 21.8, 24.2].map((x, i) => stripe([[x, 11], [x + 0.8, 15.6], [x - 0.2, 20], [x + 0.6, 24.6]], 1.1 - i * 0.05)).join('') +
      [0, 1, 2].map((k) => stripe([[27 + k * 1.8, 12], [29.6 + k * 1.2, 17.6], [33.4, 20 + k * 1.2]], 0.9)).join('') +
      [0, 1, 2, 3].map((k) => stripe([[10 + k * 1.9, 6 + k * 2.4], [13.6 + k * 1.4, 4.4 + k * 2.6], [18, 6 + k * 2.6]], 0.95)).join('')
    const legStripes = (x: number, top: number): string => [0, 1, 2, 3, 4].map((k) => stripe([[x - 1, top + 2 + k * 2.2], [x + 2, top + 2.5 + k * 2.2], [x + 5, top + 2 + k * 2.2]], 0.75)).join('')
    const hooves = [[13.6, 34.6], [16.6, 34.4], [25.4, 34.4], [28.8, 34.6]].map(([x, y]) => `<path d="${ellipse(x!, y!, 1, 0.55)}" fill="${INK}"/>`).join('')
    return {
      back: p.form(farLegs, RAMP.pearl, { depth: 0.6, rim: 0.3, bounce: 0 }) + p.within(farLegs, legStripes(15.4, 21.6) + legStripes(24, 21.6)) + `<path d="${farLegs}" fill="${INK}" opacity="0.28"/>`,
      body:
        p.form(legA, RAMP.pearl, { depth: 0.8, rim: 0.4, bounce: 0.3 }) +
        p.form(legB, RAMP.pearl, { depth: 0.8, rim: 0.4, bounce: 0.3 }) +
        p.within(legA + legB, legStripes(12.2, 21.4) + legStripes(26.6, 21)) +
        hooves +
        p.line(smooth([[33, 15], [34.4, 19.6], [34.2, 25]], false), 0.7) +
        `<path d="${ellipse(34.2, 25.6, 0.7, 1.5)}" fill="#1f1a22"/>` +
        p.form(all, RAMP.pearl, { depth: 2.2, rim: 1.1 }) +
        p.within(all, bodyStripes) +
        p.form(mane, RAMP.night, { depth: 0.6, rim: 0.4, bounce: 0 }),
      head:
        p.form(head, RAMP.pearl, { depth: 1.4, rim: 0.8 }) +
        p.within(head, [0, 1, 2].map((k) => stripe([[6 + k * 1.8, 5.6 - k * 0.6], [8 + k * 1.6, 9.4 - k * 0.8], [7 + k * 1.4, 12]], 0.8)).join('') + p.flat(muzzle, '#26202a')) +
        p.eye(8.4, 6.6, 0.6, 0.7) +
        p.form(ear, RAMP.pearl, { depth: 0.5, rim: 0.3, bounce: 0 }) +
        p.flat(smooth([[11.4, 3.8], [11.6, 2], [12.2, 1.4], [12.4, 3]]), '#26202a', 0),
    }
  },
})

/** 🦒 长颈鹿：长长的脖子把脑袋举得老高，头上两只茸角，金黄的身上铺满一块块栗色的网纹，背从肩往胯斜下去，腿细长 */
export const GIRAFFE = design({
  name: '长颈鹿',
  draw: (p) => {
    const farLegs = leg(16.6, 19.2, 1.9, 1.6) + leg(23.6, 19.6, 2, 1.6)
    const body = smooth([[13, 14], [17, 11.2], [24.6, 12], [29.4, 13.6], [31.2, 16.6], [30, 20], [25, 21.4], [17, 21.2], [13.2, 19]])
    const legA = leg(13.6, 19.2, 2.4, 1.8, -0.3)
    const legB = leg(26, 19.4, 2.6, 1.8, 0.4)
    const neck = smooth([[13.4, 15.4], [10.2, 9.6], [8.2, 5.6], [10.6, 4.2], [13.6, 8.2], [17.6, 13.6]])
    const head = smooth([[1.6, 6.8], [3, 4.2], [6.4, 2.6], [9.8, 3], [10.6, 5.6], [8.4, 7.2], [5, 8.4], [2.4, 8.4]])
    const ossicone = (x: number): string => p.line(`M${x} 3.2L${x - 0.3} 0.9`, 0.9, INK) + `<path d="${ellipse(x - 0.3, 0.8, 0.6, 0.55)}" fill="${INK}"/>`
    const ear = smooth([[9.8, 3.6], [11.6, 1.8], [12.6, 2.4], [11.2, 4.4]], true, 0.7)
    const all = body + neck
    // 网纹：一块块圆角的栗色斑，中间留着浅色的缝
    let patches = ''
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 12; i++) {
        const x = 7 + i * 2.2 + (j % 2) * 1.1
        const y = 3 + j * 2
        patches += `<path d="${ellipse(x, y, 1.02, 0.86, (i * 37 + j * 53) % 90)}" fill="${RAMP.auburn.base}"/>`
      }
    }
    let legPatches = ''
    for (let j = 0; j < 4; j++) for (let i = 0; i < 7; i++) legPatches += `<path d="${ellipse(12.6 + i * 2.4 + (j % 2) * 1.2, 21 + j * 2.1, 0.8, 0.7)}" fill="${RAMP.auburn.base}" opacity="${0.8 - j * 0.18}"/>`
    const hooves = [[14.7, 34.6], [17.5, 34.4], [24.6, 34.4], [27.3, 34.6]].map(([x, y]) => `<path d="${ellipse(x!, y!, 0.85, 0.5)}" fill="${INK}"/>`).join('')
    return {
      back: p.form(farLegs, RAMP.gold, { depth: 0.6, rim: 0.3, bounce: 0 }) + p.within(farLegs, legPatches) + `<path d="${farLegs}" fill="${INK}" opacity="0.3"/>`,
      body:
        p.form(legA, RAMP.gold, { depth: 0.8, rim: 0.4, bounce: 0.3 }) +
        p.form(legB, RAMP.gold, { depth: 0.8, rim: 0.4, bounce: 0.3 }) +
        p.within(legA + legB, legPatches) +
        hooves +
        p.line(smooth([[30.8, 15.6], [32, 19.4], [31.8, 24]], false), 0.55) +
        `<path d="${ellipse(31.8, 24.6, 0.6, 1.2)}" fill="${INK}"/>` +
        p.form(all, RAMP.gold, { depth: 2, rim: 1 }) +
        p.within(all, patches + `<path d="${all}" fill="none" stroke="${RAMP.gold.hi}" stroke-width="0.6" opacity="0.5"/>`) +
        p.line(smooth([[9.4, 4.8], [12, 7.6], [14.6, 11], [17, 13.2]], false), 1.1, RAMP.auburn.lo),
      head:
        ossicone(8.2) +
        ossicone(9.6) +
        p.form(ear, RAMP.gold, { depth: 0.5, rim: 0.3, bounce: 0 }) +
        p.form(head, RAMP.gold, { depth: 1.2, rim: 0.7 }) +
        p.within(head, `<path d="${ellipse(7.6, 4.6, 1, 0.8)}" fill="${RAMP.auburn.base}" opacity="0.8"/>`) +
        p.eye(7, 4.4, 0.6, 0.65) +
        `<path d="${ellipse(2.2, 6.6, 0.45, 0.4)}" fill="${INK}"/>` +
        p.line(smooth([[1.8, 7.8], [3.4, 8.2], [5, 8]], false), 0.45),
    }
  },
})
