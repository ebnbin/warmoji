/**
 * 鸡爪槭的叶片从上往下看：掌状深裂，裂片是披针形、尖头渐尖，最下面一对小裂片斜着朝后，几片裂片在叶心连成一块；叶柄从后面两片小裂片之间伸出来。
 * 叶片的本地坐标以叶心为原点、正中那片裂片的尖朝 +u，长度按正中那片裂片的长为 1
 */

/** 七片裂片：方位（弧度，0 是正中那片）、长、最宽处的半宽；五裂的叶子没有最下面那一对 */
const ANGLE = [0, 0.74, -0.74, 1.46, -1.46, 2.2, -2.2] as const
const LENGTH = [1, 0.94, 0.94, 0.78, 0.78, 0.46, 0.46] as const
const WIDTH = [0.155, 0.155, 0.155, 0.145, 0.145, 0.11, 0.11] as const
const COS = ANGLE.map(Math.cos)
const SIN = ANGLE.map(Math.sin)
/** 叶心那块的圆心往前挪多少、半径多大 */
const PALM_U = 0.02
const PALM_R = 0.21
/** 叶柄：从叶心往后伸多长、多粗 */
export const STALK_LEN = 0.62
export const STALK_W = 0.028

/** 最近一次 bladeDist 里离这一点最近的那片裂片：序号（−1 是叶心那块）、离它的中脉多远、顺着中脉走到了几成 */
export const BLADE = { lobe: -1, axis: 0, along: 0 }

const fract = (v: number): number => v - Math.floor(v)

/** 裂片顺着中脉走到 t 成处的半宽占最宽处的几成：从叶心那头窄窄地长出来，五成处最宽，往外收成细长的尖，两片裂片之间的缺口才深 */
function lobeWidth(t: number): number {
  if (t < 0.5) {
    const k = Math.max(0, (t - 0.05) / 0.45)
    return 0.15 + 0.85 * k * k * (3 - 2 * k)
  }
  const x = (t - 0.5) / 0.5
  return (1 - x) * (1 - x) * (1 + 0.8 * x)
}

/**
 * (u, v) 离叶片边缘多远，叶片单位，叶片里为负；lobes 是 5 或 7 片裂片，teeth 是每片裂片的边上有几个锯齿（0 不画锯齿）。
 * 顺带把最近的那片裂片记进 BLADE
 */
export function bladeDist(u: number, v: number, lobes: number, teeth: number): number {
  const pu = u - PALM_U
  let best = Math.sqrt(pu * pu + v * v) - PALM_R
  BLADE.lobe = -1
  BLADE.axis = Math.sqrt(u * u + v * v)
  BLADE.along = 0
  for (let j = 0; j < lobes; j++) {
    const a = u * COS[j]! + v * SIN[j]!
    if (a <= 0) continue
    const c = Math.abs(v * COS[j]! - u * SIN[j]!)
    const L = LENGTH[j]!
    const t = a / L
    let d: number
    if (t >= 1) d = Math.sqrt((a - L) * (a - L) + c * c)
    else {
      let hw = WIDTH[j]! * lobeWidth(t)
      if (teeth > 0) hw *= 1 - 0.16 * fract(t * teeth + 0.3) * (0.4 + 0.6 * t)
      d = c - hw
    }
    if (d < best) {
      best = d
      BLADE.lobe = j
      BLADE.axis = c
      BLADE.along = Math.min(1, t)
    }
  }
  return best
}

/** 一片叶子在本地坐标里伸得最远的地方离叶心多远：外接圆的半径 */
export const BLADE_REACH = 1.02
