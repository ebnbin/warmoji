import { design } from './design.ts'
import { ellipse, INK, poly, RAMP, smooth } from './kit.ts'
import type { Pt } from './kit.ts'

/** 🍅 番茄：几瓣鼓起的红果，顶上一簇尖叶和一截短梗 */
export const TOMATO = design({
  draw: (p) => {
    const body = smooth([
      [18, 8.4], [24.2, 7.2], [30.2, 9.6], [34.2, 14.8], [35.3, 21.2], [33.6, 27.6], [29.2, 32.3], [22.6, 34.8],
      [15.4, 34.9], [8.6, 32.6], [3.9, 27.8], [2.1, 21.2], [3.4, 14.6], [7.4, 9.6], [12.6, 7.3],
    ])
    const leaves = poly([
      [8.6, 9.6], [14.4, 7.2], [12, 2.8], [17.2, 5.4], [23.6, 2.4], [20.6, 6.2], [27.8, 8.6], [21.6, 8.8],
      [23.2, 12.6], [18.2, 9.6], [13.2, 12.6], [15.2, 8.8],
    ])
    const stem = smooth([[17.3, 6.4], [17.6, 2.6], [19.4, 0.8], [20.2, 1.8], [18.8, 3.4], [18.9, 6.4]])
    return {
      body:
        p.form(body, RAMP.red, { depth: 2.4 }) +
        p.within(body, p.line(smooth([[12.6, 10], [9.4, 17], [9.6, 26]], false), 0.6, '#621611', 0.55) + p.line(smooth([[24.2, 10], [27, 17], [26.6, 25.6]], false), 0.6, '#621611', 0.55)) +
        p.gloss(10.6, 15.4, 3.4, 2.2),
      leaves: p.form(leaves, RAMP.leaf, { depth: 0.7, rim: 0.5, bounce: 0 }) + p.form(stem, RAMP.moss, { depth: 0.4, rim: 0.3, bounce: 0, ink: 0.6 }),
    }
  },
})

/** 🔵 巨鳄吐出的水球：一团打着转的清水，里面透着光 */
export const BLUE_ORB = design({
  draw: (p) => {
    const orb = ellipse(18, 18, 16.4, 16.4)
    return {
      orb:
        p.form(orb, RAMP.water, { depth: 3.4, rim: 1.6 }) +
        p.within(orb, p.line(smooth([[7, 22], [13, 26.5], [21, 26.6], [28.6, 20]], false), 1.2, '#c4e9ff', 0.45) + p.line(smooth([[10.4, 29], [18, 31.4], [26, 28]], false), 0.9, '#c4e9ff', 0.3)) +
        p.gloss(11.4, 10.8, 5, 3),
    }
  },
})

/** 🪓 消防斧：木柄斜着伸向右下，末端缠着皮条；黑铁斧头横在柄头上，往左下张开一片磨亮的宽刃 */
export const AXE = design({
  draw: (p) => {
    const u = [0.69, 0.73] as const
    const v = [-0.73, 0.69] as const
    const at = (s: number, t: number): Pt => [11.4 + s * u[0] + t * v[0], 6.4 + s * u[1] + t * v[1]]
    const handle = poly([at(-3.4, -1.5), at(-3.4, 1.5), at(33.4, 1.5), at(33.4, -1.5)])
    const grip = poly([at(25.4, -1.8), at(25.4, 1.8), at(31.6, 1.8), at(31.6, -1.8)])
    const head = smooth([at(-2.2, -3), at(2.2, -3), at(2.6, 0), at(2.8, 4), at(5.2, 8.6), at(2.4, 10.6), at(-1.8, 11), at(-5.4, 9.8), at(-3, 4), at(-2.6, 0)], true, 0.55)
    const edge = smooth([at(4.2, 7.2), at(5.2, 8.6), at(2.4, 10.6), at(-1.8, 11), at(-5.4, 9.8), at(-4.4, 8), at(-1.6, 8.8), at(1.8, 8.4)], true, 0.6)
    return {
      axe:
        p.form(handle, RAMP.wood, { depth: 0.9, rim: 0.6 }) +
        p.within(handle, p.line(poly([at(-3, -0.4), at(33, -0.4)], false), 0.35, RAMP.wood.lo, 0.8) + p.line(poly([at(4, 0.6), at(30, 0.6)], false), 0.3, RAMP.wood.hi, 0.6)) +
        p.form(grip, RAMP.felt, { depth: 0.6, rim: 0.4, bounce: 0 }) +
        p.line(poly([at(27, -1.8), at(26.4, 1.8)], false) + poly([at(28.6, -1.8), at(28, 1.8)], false) + poly([at(30.2, -1.8), at(29.6, 1.8)], false), 0.4, RAMP.felt.deep) +
        p.form(head, RAMP.iron, { depth: 1.3, rim: 0.8, bounce: 0 }) +
        p.form(edge, RAMP.steel, { depth: 0.6, rim: 0.6, bounce: 0, ink: 0.5 }) +
        p.line(smooth([at(4.8, 8.9), at(2.4, 10.4), at(-1.8, 10.8), at(-5, 9.7)], false), 0.45, '#ffffff', 0.9) +
        `<path d="${ellipse(...at(0, 0), 0.9, 0.9)}" fill="${RAMP.steel.lo}" stroke="${INK}" stroke-width="0.4"/>`,
    }
  },
})

/** 🔫 左轮水枪：朝左的玩具水枪，绿色枪身，顶上透明的水仓里晃着水，橙色枪口和扳机 */
export const PISTOL = design({
  draw: (p) => {
    const gun = smooth([[3.2, 6.4], [30.4, 4.4], [34.6, 6.6], [35.2, 10.4], [33.4, 14.4], [31.8, 20.6], [33.2, 29.6], [31.4, 32], [25.4, 32.2], [22.6, 28.4], [21.8, 20.4], [15.4, 16.2], [3.4, 15.4], [2.4, 11]], true, 0.75)
    const barrel = smooth([[3.6, 7.6], [22, 6.8], [24, 9.2], [22, 12], [3.8, 12.8]], true, 0.7)
    const nozzle = smooth([[0.4, 7.8], [3.6, 7.2], [3.9, 13], [0.6, 12.4]], true, 0.6)
    const guard = smooth([[15.2, 16.2], [21.6, 17.6], [22.4, 23.2], [19.4, 25.4], [15.8, 23.6], [14.6, 19.2]], true, 0.8)
    const trigger = smooth([[17.6, 17.6], [19.4, 18], [19.6, 21.8], [18.2, 22.6], [17.4, 20.2]], true, 0.8)
    const tank = ellipse(28.6, 10.6, 4.6, 4.6)
    return {
      pistol:
        p.form(gun, RAMP.leaf, { depth: 1.6, rim: 0.9 }) +
        p.form(barrel, RAMP.leaf, { depth: 0.6, rim: 0.5, bounce: 0, ink: 0.5 }) +
        p.within(gun, p.line('M26 28.4L31.6 27.2M25.4 25.4L31 24.2M25 22.4L30.6 21.2', 0.4, RAMP.leaf.lo, 0.8)) +
        p.form(nozzle, RAMP.orange, { depth: 0.5, rim: 0.4, bounce: 0 }) +
        p.flat(guard, RAMP.leaf.lo, 0.6) +
        p.within(guard, `<path d="${ellipse(18.6, 20.8, 2.6, 3)}" fill="${RAMP.leaf.deep}"/>`) +
        p.form(trigger, RAMP.orange, { depth: 0.4, rim: 0.3, bounce: 0, ink: 0.5 }) +
        p.form(tank, RAMP.steel, { depth: 0.6, rim: 0.6, bounce: 0 }) +
        p.within(tank, `<path d="M22 11.6C25 10.6 27.8 12.2 30.4 11.2C32 10.6 33.4 10.8 34 11.2V16H22Z" fill="${RAMP.water.base}"/>` + p.line('M22 11.6C25 10.6 27.8 12.2 30.4 11.2C32 10.6 33.4 10.8 34 11.2', 0.4, RAMP.water.hi)) +
        p.gloss(27, 8.6, 1.4, 0.9),
    }
  },
})

/** 💧 水滴：尖头朝上的一颗清水，底下沉着深一点的蓝，左上一道亮 */
export const DROP = design({
  draw: (p) => {
    const drop = smooth([[18, 1.2], [22.6, 9.4], [28.2, 17.8], [29.6, 24.4], [26.4, 31.6], [18, 35], [9.6, 31.6], [6.4, 24.4], [7.8, 17.8], [13.4, 9.4]], true, 0.9)
    return {
      drop:
        p.form(drop, RAMP.water, { depth: 2.4, rim: 1.2 }) +
        p.within(drop, p.line(smooth([[12, 29.4], [18, 32], [24.2, 29.2]], false), 0.9, RAMP.water.hi, 0.5)) +
        p.gloss(12.8, 20.4, 2, 3.6, -20),
    }
  },
  rig: {
    idle: {
      parts: [{ layers: ['drop'], cx: 18, cy: 35 }],
      fx: [{ gen: 'ripples', params: { cx: 18, cy: 33.5, color: RAMP.water.hi, rings: [{ phase: 0 }, { phase: 0.16 }], window: [0.3, 0.85] } }],
    },
  },
})

/** 从圆心往外转 turns 圈的螺线，每转一圈半径长 grow·2π */
function spiral(cx: number, cy: number, grow: number, turns: number): string {
  const pts: Pt[] = []
  for (let a = 0.6; a <= turns * Math.PI * 2; a += 0.45) pts.push([cx + Math.cos(a) * a * grow, cy + Math.sin(a) * a * grow])
  return smooth(pts, false)
}

/** 🟣 迷魂眼吐出的紫珠：一团旋着涡纹的紫光 */
export const VIOLET_ORB = design({
  draw: (p) => {
    const orb = ellipse(18, 18, 16.4, 16.4)
    return {
      orb:
        p.form(orb, RAMP.violet, { depth: 3.4, rim: 1.6 }) +
        p.within(
          orb,
          p.line(spiral(18.6, 18.6, 1.15, 3.1), 1.5, RAMP.violet.deep, 0.55) + p.line(spiral(18.2, 18.2, 1.15, 3.1), 0.8, RAMP.violet.hi, 0.7),
        ) +
        p.gloss(11.4, 10.8, 5, 3),
    }
  },
})

/** 🌊 浪：海青色的一道浪卷起来，浪头翻着白沫，卷里深一些 */
export const WAVE = design({
  draw: (p) => {
    const wave = smooth([
      [0.6, 35.6], [0.8, 26], [3.4, 16.4], [9, 8.2], [16.6, 3.6], [24.6, 3.2], [30.8, 6.2], [34, 10.4], [32.2, 12.6], [28.6, 10.4], [24.2, 10.2],
      [20.2, 13], [18.8, 18.4], [21, 23.4], [25.8, 25.6], [30.6, 24.4], [33.6, 22], [35.6, 24.6], [35.6, 35.6],
    ], true, 0.85)
    const barrel = smooth([[21.2, 12.6], [25, 10.4], [29.2, 11.2], [32, 13.8], [30.8, 20.6], [27.2, 23.6], [22.6, 22.6], [19.6, 18.6], [19.8, 14.8]], true, 0.9)
    const foam = smooth([[8.6, 8.6], [15.6, 3.8], [24.6, 3], [31, 6], [34.4, 10.2], [32.4, 12.6], [30.2, 11], [29.4, 9], [25.8, 7.6], [22.4, 8.8], [19.6, 7.2], [15.6, 8.4], [12, 8.2]], true, 0.7)
    return {
      wave:
        p.form(wave, RAMP.sea, { depth: 2.4, rim: 1.2 }) +
        p.flat(barrel, RAMP.sea.lo, 0.5) +
        p.within(barrel, `<path d="${smooth([[19.6, 12], [25.6, 9.2], [31.4, 11.4], [33, 16.4], [29.4, 14.6], [25.2, 13.6], [21.4, 15.6]])}" fill="${RAMP.sea.deep}"/>` + p.line(smooth([[21.6, 19.4], [24.6, 22], [28.4, 21.6], [31, 18.4]], false), 0.6, RAMP.sea.base, 0.9) + p.line(smooth([[20.8, 16.8], [22.4, 19.6]], false), 0.5, RAMP.sea.base, 0.8)) +
        p.within(wave, p.line(smooth([[3.6, 28], [8.6, 22.6], [12.6, 21.4]], false), 0.7, RAMP.sea.hi, 0.6) + p.line(smooth([[4.4, 33.6], [10.6, 29.4], [16, 29.8], [22.6, 31.4]], false), 0.6, RAMP.sea.hi, 0.45)) +
        p.form(foam, RAMP.ghost, { depth: 0.9, rim: 0.6, bounce: 0 }) +
        `<path d="${ellipse(34.2, 13.8, 0.9, 0.9)}" fill="#f4f7f8"/><path d="${ellipse(32.8, 16.2, 0.6, 0.6)}" fill="#f4f7f8"/><path d="${ellipse(6.4, 10.6, 0.7, 0.7)}" fill="#f4f7f8"/>`,
    }
  },
})
