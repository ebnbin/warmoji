import { design } from './design.ts'
import { ellipse, INK, poly, RAMP, smooth } from './kit.ts'

/** 💀 骷髅：泛黄的骨头，深陷的眼窝里一点余烬，额上一道裂纹 */
export const SKULL = design({
  name: '骷髅',
  draw: (p) => {
    const head = smooth([
      [18, 1.4], [26.6, 3.2], [32.1, 9.2], [33.5, 16.8], [31.8, 23.4], [28.4, 26.8], [27.4, 31.4], [23.6, 34.6],
      [18, 35.3], [12.4, 34.6], [8.6, 31.4], [7.6, 26.8], [4.2, 23.4], [2.5, 16.8], [3.9, 9.2], [9.4, 3.2],
    ])
    const eyeL = smooth([[7.4, 14.6], [9.6, 11.6], [13.6, 11.2], [16.2, 13.8], [15.6, 18], [12.2, 19.6], [8.6, 18.4]])
    const eyeR = smooth([[28.6, 14.6], [26.4, 11.6], [22.4, 11.2], [19.8, 13.8], [20.4, 18], [23.8, 19.6], [27.4, 18.4]])
    const nose = smooth([[18, 21.2], [19.8, 24.2], [18.8, 25.8], [17.2, 25.8], [16.2, 24.2]])
    const teeth = smooth([[11.8, 28], [18, 27.2], [24.2, 28], [24.6, 31.6], [18, 32.8], [11.4, 31.6]])
    return {
      skull:
        p.form(head, RAMP.bone, { depth: 2.6, rim: 1.3 }) +
        p.flat(eyeL, '#1d130d') +
        p.flat(eyeR, '#1d130d') +
        p.within(eyeL, `<path d="${ellipse(12.6, 16.4, 3.6, 3)}" fill="#3a1f14"/>`) +
        p.within(eyeR, `<path d="${ellipse(24, 16.4, 3.6, 3)}" fill="#3a1f14"/>`) +
        `<path d="${ellipse(12.2, 15.8, 1.1, 1.1)}" fill="#ff8a3d"/><path d="${ellipse(23.6, 15.8, 1.1, 1.1)}" fill="#ff8a3d"/>` +
        p.flat(nose, '#1d130d') +
        p.flat(teeth, RAMP.bone.hi, 0.6) +
        p.line('M18 27.4V32.6M14.9 27.7V32.1M21.1 27.7V32.1M11.8 29.9C15 30.4 21 30.4 24.4 29.9', 0.55) +
        p.line(smooth([[19.6, 1.8], [18.6, 4.6], [20.2, 6.2], [19.2, 8.6]], false), 0.55) +
        p.line(smooth([[8.2, 22.2], [10.4, 24], [12.8, 23.6]], false), 0.5, INK, 0.6),
    }
  },
})

/** 🧟 僵尸：灰绿的脸，乱蓬蓬的黑发，深陷的眼窝透着暗红，破烂的锈色衬衫，一只手伸在胸前 */
export const ZOMBIE = design({
  name: '僵尸',
  draw: (p) => {
    const shirt = smooth([[4.8, 36.6], [5.2, 31.8], [8.2, 28.8], [13.6, 27.2], [22.4, 27.2], [27.8, 28.8], [30.8, 31.8], [31.2, 36.6]])
    const hole = smooth([[25.6, 31], [27.4, 30.4], [28.6, 32.2], [27.4, 34], [25.8, 33.2]])
    const neck = poly([[14.6, 22.6], [21.4, 22.6], [22, 29.4], [14, 29.4]])
    const back = poly([
      [8.8, 22.8], [7.6, 16.4], [5.6, 12.8], [8.4, 10.6], [7.8, 6.6], [11.8, 6.6], [13.2, 2.8], [16.6, 4.6], [19.8, 1.8], [22, 4.6],
      [26, 3.6], [26.6, 7.2], [30, 8.8], [28.4, 12.6], [29.6, 17.4], [27.8, 21.6], [26.2, 23.6],
    ])
    const face = smooth([[18, 8.6], [23.6, 10.4], [25.9, 15.6], [25.4, 21], [22.6, 25.2], [18, 26.8], [13.4, 25.2], [10.6, 21], [10.1, 15.6], [12.4, 10.4]])
    const bangs = poly([
      [9.4, 16.2], [9.8, 10.4], [12.8, 6.4], [18, 4.8], [23.6, 5.8], [27.2, 9.4], [28, 15.4], [25.6, 12], [24.4, 14.4], [22, 10.4],
      [20.2, 13.4], [17.2, 10.2], [14.8, 13.4], [13.6, 11.2], [11.4, 14.8],
    ])
    const hand = smooth([[10, 33.4], [7.6, 31.6], [8.2, 30.2], [10.4, 30.8], [8.6, 28.8], [9.6, 27.8], [12.4, 29.4], [12.2, 27.6], [13.6, 27.4], [15.4, 29.8], [19.4, 30], [21.6, 31.8], [20.4, 34], [15, 34.4]])
    return {
      shirt:
        p.form(shirt, RAMP.orange, { depth: 1.8 }) +
        p.within(shirt, p.line('M13.4 27.6L18 31.6L22.6 27.6', 0.7) + p.line(smooth([[6.4, 33.4], [9.4, 32.6], [11.2, 36.6]], false), 0.5, INK, 0.5)) +
        p.flat(hole, RAMP.rot.lo, 0.5),
      hand: p.form(hand, RAMP.rot, { depth: 0.9, rim: 0.6 }) + p.line('M11.4 30.9L12.8 31.4M13.8 29.8L15 31', 0.45, INK, 0.7),
      neck: p.form(neck, RAMP.rot, { depth: 1, rim: 0.5, bounce: 0 }) + p.cast(neck, face, 1.2, 0.45),
      head:
        p.form(back, RAMP.night, { depth: 1.2, rim: 0.6, bounce: 0 }) +
        p.form(face, RAMP.rot, { depth: 1.9, rim: 1 }) +
        p.within(face, `<path d="${ellipse(22.6, 22.4, 1.6, 1.2)}" fill="${RAMP.rot.lo}" opacity="0.8"/><path d="${ellipse(12.8, 12.8, 1.1, 0.8)}" fill="${RAMP.rot.lo}" opacity="0.7"/>`) +
        `<path d="${ellipse(14.6, 17.6, 2.5, 1.9)}" fill="${RAMP.rot.deep}"/><path d="${ellipse(21.6, 17.6, 2.5, 1.9)}" fill="${RAMP.rot.deep}"/>` +
        p.eye(14.8, 17.7, 1.05, 1, '#c8412c') +
        p.eye(21.4, 17.7, 1.05, 1, '#c8412c') +
        p.line('M12.4 19.8C13.8 20.6 15.6 20.6 16.8 19.9M19.2 19.9C20.4 20.6 22.2 20.6 23.6 19.8', 0.45, INK, 0.6) +
        p.line('M17.2 21.4L17.6 22.2M18.8 21.4L18.4 22.2', 0.5) +
        p.line(smooth([[14.4, 24.4], [16.4, 23.4], [18.8, 23.9], [21.8, 23.2]], false), 0.7) +
        p.line('M15.6 23.2L16 24.8M17.6 23.2L17.9 24.7M19.7 23.2L19.9 24.6', 0.4) +
        p.form(bangs, RAMP.night, { depth: 0.9, rim: 0.7, bounce: 0 }),
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['shirt'], cx: 18, cy: 32 },
        { layers: ['hand'] },
        { layers: ['head'], cx: 18, cy: 27 },
      ],
    },
  },
})

/** 🐀 偷币鼠：灰褐的毛，尖鼻子朝左，粉耳朵粉尾巴，一粒贼亮的黑眼 */
export const RAT = design({
  name: '老鼠',
  draw: (p) => {
    const body = smooth([[10.6, 27.8], [11.4, 18.4], [15.8, 12.4], [22.8, 11], [29.4, 13.8], [33.4, 20.4], [33.2, 27.4], [28.8, 31], [20.2, 31.8], [13.8, 30.8]])
    const head = smooth([[13.8, 17.6], [9.8, 18.6], [5.4, 21.6], [1.6, 24.2], [0.9, 25.8], [2.8, 27.8], [7.6, 29.8], [13.4, 30], [16.2, 25.6]])
    const ear = ellipse(12.4, 16, 3.3, 3.9, -18)
    const earIn = ellipse(12.4, 16.3, 2, 2.6, -18)
    const tail = smooth([[13.4, 30.6], [20, 33.8], [27.6, 34.4], [33, 32.6], [35.2, 29], [33.6, 26.4]], false)
    return {
      tail: p.line(tail, 2.6) + p.line(tail, 1.5, RAMP.pink.base) + p.line(smooth([[15, 31], [21, 33.4], [28, 33.8]], false), 0.45, RAMP.pink.hi, 0.8),
      body:
        p.form(body, RAMP.fur, { depth: 2.2, rim: 1 }) +
        p.within(body, p.line(smooth([[18, 14.6], [24, 13.6], [29.6, 16.6]], false), 0.5, RAMP.fur.hi, 0.7) + p.line(smooth([[20, 17.4], [25.8, 16.8], [30.4, 20.6]], false), 0.45, RAMP.fur.hi, 0.5)) +
        `<path d="${ellipse(16.6, 31.4, 1.9, 1)}" fill="${RAMP.pink.base}" stroke="${INK}" stroke-width="0.45"/><path d="${ellipse(27.4, 31, 1.9, 1)}" fill="${RAMP.pink.base}" stroke="${INK}" stroke-width="0.45"/>`,
      head:
        p.form(head, RAMP.fur, { depth: 1.4, rim: 0.8 }) +
        `<path d="${ellipse(1.5, 25.2, 1.2, 1)}" fill="${RAMP.pink.base}" stroke="${INK}" stroke-width="0.4"/>` +
        p.eye(7.8, 23, 1.15, 1.2) +
        p.line('M4.2 26.6L0.2 28.6M4.4 25.8L0.2 25.4M4.8 27.2L1.6 30.2', 0.3, RAMP.bone.hi, 0.85),
      ears: p.form(ear, RAMP.fur, { depth: 0.9, rim: 0.6, bounce: 0 }) + p.flat(earIn, RAMP.pink.base),
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['tail'], cx: 13, cy: 31 },
        { layers: ['ears'], cx: 12.4, cy: 19 },
        { layers: ['head'], cx: 6, cy: 24 },
      ],
    },
  },
})

/** 👻 幽灵：发着冷光的一块布，一只手扬起来，两只大小不一的空眼，嘴张成一个斜斜的圆 */
export const GHOST = design({
  name: '幽灵',
  draw: (p) => {
    const body = smooth([
      [16, 1.6], [21.6, 1.8], [26, 4.8], [28.2, 10], [30.2, 12.6], [32.6, 10], [34.8, 9.6], [35.6, 12], [33.6, 15.8], [30.8, 20.4], [30.8, 26],
      [31.6, 31.4], [33.4, 34.8], [29, 35.3], [26.4, 32.8], [23.2, 35.4], [19.8, 33], [16.4, 35.4], [13, 33.2], [9.6, 35.4], [7.4, 32.6], [3.8, 34],
      [5.6, 28.4], [5, 23.8], [2.4, 25.6], [0.8, 23.8], [2.4, 20.8], [5.2, 18.4], [6.2, 12.4], [8.6, 6.2], [12, 2.8],
    ])
    const mouth = ellipse(19.5, 23.5, 4.6, 3.6, 32)
    return {
      body:
        p.form(body, RAMP.ghost, { depth: 2.8, rim: 1.4 }) +
        p.within(body, p.line(smooth([[9, 28], [11.6, 31.4], [11, 34.6]], false), 0.5, RAMP.ghost.lo, 0.8) + p.line(smooth([[25.6, 26], [27.4, 30.6], [26.6, 33.4]], false), 0.5, RAMP.ghost.lo, 0.8)),
      eyes:
        `<path d="${ellipse(13, 12, 2, 2.3)}" fill="#231c34"/><path d="${ellipse(23, 12, 3.7, 4.1)}" fill="#231c34"/>` +
        `<path d="${ellipse(23.9, 12.9, 1.7, 1.8)}" fill="#8fa4c4"/><path d="${ellipse(12.3, 11.2, 0.6, 0.6)}" fill="#fff4dc"/><path d="${ellipse(21.8, 10.4, 0.9, 0.8)}" fill="#fff4dc"/>`,
      mouth: p.flat(mouth, '#231c34', 0.5) + p.within(mouth, `<path d="${ellipse(20.6, 25.2, 2.4, 1.6, 32)}" fill="#3e2f52"/>`),
    }
  },
  rig: {
    idle: {
      parts: [{ layers: ['eyes'] }, { layers: ['mouth'], cx: 19.5, cy: 23.5 }],
    },
  },
})

/** 🐡 毒河豚：圆鼓鼓的身子朝左，背上一身带紫斑的深色，四周竖着短刺，嘟着嘴 */
export const PUFFER = design({
  name: '毒河豚',
  draw: (p) => {
    const body = ellipse(17, 18.8, 15.2, 12.6)
    const spikes = [
      [5.6, 8.6, -0.8, -1], [10.4, 5.4, -0.3, -1], [16, 4.2, 0, -1], [21.8, 4.8, 0.3, -1], [27, 7.4, 0.7, -0.8], [30.8, 12.2, 1, -0.4],
      [30.6, 25.6, 0.9, 0.6], [26, 30, 0.6, 1], [20, 31.8, 0.1, 1], [13.6, 31.6, -0.2, 1], [7.8, 29.2, -0.6, 0.9], [3.2, 24.4, -1, 0.5], [2.2, 13.6, -1, -0.4],
    ] as const
    const spike = ([x, y, dx, dy]: readonly [number, number, number, number]): string => {
      const ox = -dy * 0.9
      const oy = dx * 0.9
      return poly([[x + ox, y + oy], [x + dx * 2.2, y + dy * 2.2], [x - ox, y - oy]])
    }
    const back = `M0 4H36V17.4C30 20.8 22 21.6 14 20.4C8 19.6 3 17.6 0 15.6Z`
    const tail = smooth([[30, 17.2], [34, 12.8], [36.2, 13.6], [35, 17.8], [36.2, 22.2], [34, 23], [30, 19.4]], true, 0.8)
    const fin = smooth([[21.6, 25.4], [25.4, 24.8], [27.2, 27.6], [24.2, 29.4]])
    const lips = smooth([[3, 17.6], [0.8, 17.2], [0.4, 19.2], [0.8, 21], [3, 20.6]])
    return {
      tail: p.form(tail, RAMP.gold, { depth: 0.7, rim: 0.5, bounce: 0 }) + p.line('M31.6 17.2L35 14.4M31.6 18.8L35.2 21.4', 0.4, RAMP.gold.lo),
      body:
        spikes.map((s) => p.form(spike(s), RAMP.felt, { depth: 0.3, rim: 0, bounce: 0, ink: 0.5 })).join('') +
        p.form(body, RAMP.tan, { depth: 2.6, rim: 1.2 }) +
        p.within(
          body,
          `<path d="${back}" fill="${RAMP.moss.lo}" opacity="0.85"/>` +
            [[12, 10, 1.3], [18.4, 8.6, 1.6], [24.8, 11.4, 1.2], [9, 14.2, 0.9], [21.4, 14.2, 1], [28, 15.6, 0.8]].map(([x, y, r]) => `<path d="${ellipse(x!, y!, r!, r!)}" fill="${RAMP.violet.base}" stroke="${INK}" stroke-width="0.35"/>`).join('') +
            [[14.6, 25.4, 1.4], [19.6, 22.6, 0.8], [23.2, 21.6, 1]].map(([x, y, r]) => `<path d="${ellipse(x!, y!, r!, r!)}" fill="${RAMP.tan.lo}" opacity="0.8"/>`).join(''),
        ) +
        p.form(lips, RAMP.pink, { depth: 0.4, rim: 0.3, bounce: 0, ink: 0.55 }) +
        p.eye(7.4, 13.6, 1.6, 1.7) +
        p.line('M5.6 11.2C6.8 10.4 8.6 10.4 9.8 11.4', 0.5),
      fin: p.form(fin, RAMP.gold, { depth: 0.5, rim: 0.4, bounce: 0 }),
    }
  },
  rig: {
    idle: {
      parts: [{ layers: ['body'], cx: 15, cy: 16 }, { layers: ['tail'], cx: 30, cy: 17 }],
    },
  },
})

/** 👁 迷魂眼：眼皮沉沉的一只大眼，布着血丝，紫红的虹膜一圈圈往里收 */
export const EYE = design({
  name: '迷魂眼',
  draw: (p) => {
    const white = smooth([[0.8, 18.6], [6.4, 11.8], [18, 8.6], [29.6, 11.8], [35.2, 18.6], [29.6, 25.4], [18, 28.4], [6.4, 25.4]], true, 0.9)
    const lid = smooth([[0.4, 18.4], [5.6, 10.2], [18, 6.2], [30.4, 10.2], [35.6, 18.4], [30, 12.8], [18, 10.2], [6, 12.8]], true, 0.9)
    return {
      eye:
        p.form(white, RAMP.bone, { depth: 1.6, rim: 0.8 }) +
        p.within(
          white,
          p.line('M3 18.4C5.6 17.4 7 18.8 9 17.6M4.4 21.4C6.6 21.8 7.8 20.8 9.6 21.6M33 18.6C30.4 17.6 29.2 19 27.2 17.8M31.8 22C29.8 22.2 28.6 21.2 26.8 22', 0.35, '#b8403c', 0.8) +
            p.form(ellipse(18, 18.4, 8, 8), RAMP.magenta, { depth: 1.8, rim: 0.8, bounce: 0 }) +
            `<path d="${ellipse(18, 18.4, 5.6, 5.6)}" fill="none" stroke="${RAMP.magenta.deep}" stroke-width="0.5"/><path d="${ellipse(18, 18.4, 3.6, 3.6)}" fill="#1d0f1c"/>` +
            p.gloss(15.6, 15.8, 1.6, 1.2),
        ) +
        p.form(lid, RAMP.night, { depth: 0.8, rim: 0.5, bounce: 0 }) +
        p.line('M7.6 10.4L6 7.6M12.4 8.2L11.6 5.2M18 7.4V4.4M23.6 8.2L24.4 5.2M28.4 10.4L30 7.6', 0.7),
    }
  },
})

/** 💣 自爆怪：一颗黑铁的圆炸弹，铁箍的引信口朝右上，麻绳引信的头上烧着火星 */
export const BOMB = design({
  name: '炸弹',
  draw: (p) => {
    const ball = ellipse(14.2, 22, 13.6, 13.6)
    const cap = poly([[18.8, 11.6], [23.8, 6.6], [29.8, 12.6], [24.8, 17.6]])
    const fuse = smooth([[26.8, 9.6], [27.6, 6.8], [29.8, 5.6], [31.4, 3.8]], false)
    return {
      bomb:
        p.form(cap, RAMP.iron, { depth: 0.8, rim: 0.6, bounce: 0 }) +
        p.line('M20.4 10.2L25.8 15.6M22.4 8.2L27.8 13.6', 0.4, RAMP.iron.hi, 0.5) +
        p.form(ball, RAMP.iron, { depth: 3, rim: 1.4 }) +
        p.gloss(8.2, 15, 3.6, 2.4) +
        p.line(fuse, 2) +
        p.line(fuse, 1.2, RAMP.tan.base) +
        p.line('M27.4 8.6L28.4 8.2M28.6 6.2L29.6 6.4', 0.35, RAMP.tan.lo) +
        `<path d="${ellipse(32, 3.6, 2.8, 2.8)}" fill="#ff8a2a" opacity="0.9"/><path d="${ellipse(32, 3.6, 1.6, 1.6)}" fill="#ffd36a"/><path d="${ellipse(31.6, 3.2, 0.6, 0.6)}" fill="#fff4dc"/>`,
    }
  },
  rig: {
    idle: {
      parts: [],
      fx: [
        {
          gen: 'sparkles',
          params: {
            stars: [
              { x: 33.4, y: 1.2, r: 2, phase: 0, color: '#ffd36a' },
              { x: 35.2, y: 5.6, r: 1.6, phase: 0.4, color: '#ff9a3a' },
              { x: 29.4, y: 2.2, r: 1.4, phase: 0.7, color: '#ff7043' },
            ],
          },
        },
      ],
    },
  },
})

/** 🦹 怪盗：橘色乱发，红色眼罩底下一双贼眼，歪嘴一笑，黑斗篷配带刺的红高领 */
export const VILLAIN = design({
  name: '怪盗',
  draw: (p) => {
    const cape = smooth([[2.8, 36.6], [3.6, 31.6], [8, 29], [18, 28.2], [28, 29], [32.4, 31.6], [33.2, 36.6]])
    const neck = smooth([[14.6, 22], [21.4, 22], [21.6, 29], [14.4, 29]])
    const hair = smooth([[8.2, 23.6], [6.8, 17.6], [5.4, 13.8], [7.8, 11.4], [7.4, 7.4], [11, 6.2], [12.2, 2.4], [16.2, 3.8], [19, 0.8], [21.4, 3.6], [25.4, 2.8], [26.2, 6.6], [29.8, 8.4], [28.8, 12.2], [30.6, 15.4], [29, 19.6], [28, 23.4]], true, 0.6)
    const face = smooth([[18, 8.6], [23.4, 10], [25.9, 15], [25.4, 20.8], [22.6, 24.8], [18, 26.4], [13.4, 24.8], [10.6, 20.8], [10.1, 15], [12.6, 10]])
    const fringe = smooth([[9.4, 16.4], [9.4, 10.6], [12.8, 6], [18.4, 4.2], [24, 5.6], [27, 9.8], [27.4, 15], [25.2, 11.4], [22.6, 13], [20.8, 9.2], [17.4, 12.2], [14.8, 9.4], [12.6, 12.6], [11.4, 11]], true, 0.55)
    const mask = smooth([[9.6, 14.8], [12, 12.8], [15.4, 13.2], [18, 14.6], [20.6, 13.2], [24, 12.8], [26.4, 14.8], [25.6, 18.4], [22.6, 19.8], [19.6, 18.4], [18, 17.2], [16.4, 18.4], [13.4, 19.8], [10.4, 18.4]], true, 0.8)
    const collar = poly([[4, 32.4], [5, 27.2], [9.6, 29], [12, 25.4], [15.4, 28.4], [18, 25.8], [20.6, 28.4], [24, 25.4], [26.4, 29], [31, 27.2], [32, 32.4], [18, 31.2]])
    return {
      villain:
        p.form(cape, RAMP.night, { depth: 1.6, rim: 0.8 }) +
        p.line('M18 31.4V36.6M12 31.8L10.6 36.6M24 31.8L25.4 36.6', 0.45, RAMP.night.hi, 0.7) +
        p.form(neck, RAMP.skin, { depth: 0.9, rim: 0.4, bounce: 0 }) +
        p.cast(neck, face, 1.2, 0.4) +
        p.form(hair, RAMP.orange, { depth: 1.4, rim: 0.7, bounce: 0 }) +
        p.form(face, RAMP.skin, { depth: 2, rim: 1 }) +
        p.form(mask, RAMP.crimson, { depth: 0.8, rim: 0.6, bounce: 0 }) +
        `<path d="${ellipse(14.2, 16.2, 1.6, 1)}" fill="${INK}"/><path d="${ellipse(21.8, 16.2, 1.6, 1)}" fill="${INK}"/><path d="${ellipse(13.7, 15.8, 0.5, 0.35)}" fill="#fff4dc"/><path d="${ellipse(21.3, 15.8, 0.5, 0.35)}" fill="#fff4dc"/>` +
        p.line(smooth([[15, 22.6], [18.4, 23.2], [21.6, 21.4]], false), 0.7) +
        p.line('M20.8 21.2L21.8 21.8', 0.5) +
        p.form(fringe, RAMP.orange, { depth: 0.8, rim: 0.6, bounce: 0 }) +
        p.form(collar, RAMP.crimson, { depth: 1, rim: 0.6 }) +
        p.line('M5 27.4L9.6 29M31 27.4L26.4 29', 0.4, RAMP.steel.hi, 0.8),
    }
  },
})

/** 🐊 巨鳄：墨绿的大块头侧身朝左，长吻一排锯齿牙，黄眼竖瞳，淡黄的肚皮，背脊一溜鳞甲，尾巴往上卷回来 */
export const CROC = design({
  name: '巨鳄',
  draw: (p) => {
    const legBack = smooth([[23.8, 28.6], [28.4, 28.2], [29.2, 32.6], [31, 35.4], [24.8, 35.6], [23.6, 32.2]])
    const legFront = smooth([[8.6, 27.6], [13, 27.8], [13.6, 32.2], [15.4, 35.2], [9, 35.4], [8.2, 31.6]])
    const body = smooth([
      [0.4, 22.6], [2.2, 20.6], [6.2, 19.8], [8.6, 17.4], [11.8, 16.8], [13.8, 18.4], [17, 19.4], [20.8, 19.8], [24.6, 19.2], [27.8, 17.4],
      [29.6, 14], [29.2, 10.2], [27, 8.2], [25.6, 6.8], [28.6, 5.6], [32.2, 7.2], [34.6, 11.6], [34.8, 17.6], [32.8, 23.4], [28.8, 27.8],
      [21.8, 30.6], [13.8, 30.8], [7.6, 29], [3.4, 26], [0.8, 24.6],
    ], true, 0.9)
    const belly = smooth([[3, 25.6], [8, 27.6], [15, 28.6], [22.6, 28], [29, 25.2], [32.8, 21.2], [32, 25.6], [28.6, 28.6], [21.8, 31], [13.8, 31.2], [7.4, 29.4]])
    const teeth = poly([[1.2, 23.2], [1.8, 24.9], [2.6, 23.3], [3.5, 25.1], [4.3, 23.4], [5.3, 25.2], [6.1, 23.5], [7.1, 25], [7.9, 23.5]], false)
    const scutes = [[15.4, 19.2], [18.4, 19.8], [21.4, 19.9], [24.4, 19.2], [27.2, 17.4], [29, 14.4]] as const
    return {
      leg: p.form(legBack, RAMP.moss, { depth: 0.8, rim: 0.4, bounce: 0 }) + p.line('M26 35.2L26.4 33.8M28.2 35.2L28.2 33.6', 0.4),
      body:
        p.form(legFront, RAMP.moss, { depth: 0.8, rim: 0.4, bounce: 0 }) +
        p.line('M10.4 35L10.8 33.6M12.6 35L12.6 33.4', 0.4) +
        p.form(body, RAMP.moss, { depth: 2.4, rim: 1.2 }) +
        p.within(body, p.form(belly, RAMP.gold, { depth: 0.8, rim: 0.4, bounce: 0, ink: 0 }) + p.line('M8.6 28.4L9.2 30M12.6 29.2L12.9 30.8M16.6 29.4L16.7 31M20.6 29.2L20.5 30.9M24.6 28.2L24.2 29.8M28.2 26.4L27.6 27.9', 0.4, RAMP.gold.deep, 0.7)) +
        p.within(body, [[5.6, 21.4], [16.4, 23], [21.6, 24.2], [26.8, 22.4], [31.6, 15.4], [31.2, 10.4]].map(([x, y]) => `<path d="${ellipse(x!, y!, 1.1, 0.75)}" fill="${RAMP.moss.deep}" opacity="0.6"/>`).join('')) +
        p.line('M0.8 23.4C4.4 24 8.4 24.1 12.4 23.4', 0.65) +
        `<path d="${ellipse(2.4, 21.2, 0.45, 0.32)}" fill="${INK}"/>` +
        `<path d="${teeth}" fill="none" stroke="${INK}" stroke-width="0.35"/>` +
        `<path d="${teeth}Z" fill="${RAMP.bone.hi}" stroke="${INK}" stroke-width="0.35" stroke-linejoin="round"/>` +
        p.line('M13.6 25.8L16.4 24.4M14.6 27L17.2 25.8', 0.4, RAMP.moss.hi, 0.6),
      eye:
        `<path d="${ellipse(10.6, 18.8, 1.8, 1.45)}" fill="${RAMP.gold.base}" stroke="${INK}" stroke-width="0.5"/><path d="${ellipse(10.6, 18.8, 0.38, 1.15)}" fill="${INK}"/>` +
        p.line('M8.4 17.4C9.8 16.5 11.6 16.5 13 17.4', 0.6),
      scutes: scutes.map(([x, y]) => p.form(ellipse(x, y, 1.35, 1.05), RAMP.moss, { depth: 0.4, rim: 0.3, bounce: 0, ink: 0.45 })).join(''),
    }
  },
  rig: {
    idle: {
      parts: [
        { layers: ['body'], cx: 18, cy: 22 },
        { layers: ['eye'], cx: 10.6, cy: 18.8 },
        { layers: ['scutes'], cx: 22, cy: 19 },
      ],
    },
  },
})
