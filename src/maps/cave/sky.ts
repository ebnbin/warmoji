import type { CaveConfig } from '../../types/maps'

type Sky = CaveConfig['sky']

const DEG = Math.PI / 180
/** 朔望月，天 */
export const SYNODIC_DAYS = 29.53
/** 大气层外的太阳照度，勒克斯 */
const SUN_LUX = 128000
/** 满月在天顶时地面的照度，勒克斯 */
const FULL_MOON_LUX = 0.3
/** 晴夜只剩星光与气辉时地面的照度，勒克斯 */
const STARLIGHT_LUX = 0.001

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 天上的一个方向：x、y 是地图平面上朝它的单位向量（地图上方朝南、左方朝东，光总从画面上半边来），elev 是高度角，弧度 */
export interface SkyDir {
  readonly x: number
  readonly y: number
  readonly elev: number
}

/** 纬度 lat、赤纬 decl、时角 hourAngle（正午为 0，上午为负）处的天体，从地面看过去的方向 */
function horizon(lat: number, decl: number, hourAngle: number): SkyDir {
  const east = -Math.cos(decl) * Math.sin(hourAngle)
  const north = Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.cos(hourAngle) * Math.sin(lat)
  const up = Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(hourAngle) * Math.cos(lat)
  const flat = Math.hypot(east, north)
  const elev = Math.asin(Math.max(-1, Math.min(1, up)))
  return flat > 1e-9 ? { x: -east / flat, y: north / flat, elev } : { x: 0, y: -1, elev }
}

/** 一天中 hour 点（0–24）时太阳的方向 */
export function sunAt(sky: Sky, hour: number): SkyDir {
  return horizon(sky.latitudeDeg * DEG, sky.declinationDeg * DEG, (hour - 12) * 15 * DEG)
}

/** 月龄 age 天（0 是朔、约 14.8 是望）的月亮离太阳往东多少，弧度：它晚这么多升起 */
export function elongation(age: number): number {
  const a = (((age / SYNODIC_DAYS) % 1) + 1) % 1
  return a * Math.PI * 2
}

/** 月相角：日月对月亮张开的角，弧度；满月为 0，朔为 π */
export function phaseAngle(age: number): number {
  const e = elongation(age)
  return Math.PI - Math.abs(e > Math.PI ? e - Math.PI * 2 : e)
}

/** 一天中 hour 点、月龄 age 天时月亮的方向：赤纬按太阳的算，时角比太阳落后它离太阳的角 */
export function moonAt(sky: Sky, hour: number, age: number): SkyDir {
  return horizon(sky.latitudeDeg * DEG, sky.declinationDeg * DEG, (hour - 12) * 15 * DEG - elongation(age))
}

/** 太阳高度 elevDeg 度时的大气质量（Kasten–Young）：天顶为 1，越贴近地平线越厚 */
function airMass(elevDeg: number): number {
  const h = Math.max(elevDeg, -0.5)
  return 1 / (Math.sin(h * DEG) + 0.50572 * (h + 6.07995) ** -1.6364)
}

/** 垂直于阳光的直射照度，勒克斯：按大气质量消光，日面沉下地平线时淡出 */
export function sunDirectLux(sky: Sky, elevDeg: number): number {
  if (elevDeg <= -0.8) return 0
  return SUN_LUX * Math.exp(-sky.extinction * airMass(elevDeg)) * smooth(-0.8, 0.6, elevDeg)
}

/** 太阳高度 elevDeg 度时晴天的天光在水平面上的照度，勒克斯：白天随太阳升高变亮；日落后按暮光的对数曲线变暗，最暗是星光 */
export function skyLux(elevDeg: number): number {
  if (elevDeg >= 0) return 400 + 15000 * Math.sin(elevDeg * DEG) ** 0.7
  const h = -elevDeg
  return 10 ** (2.602 - 0.33 * h - 0.004 * h * h) + STARLIGHT_LUX
}

/** 月相角 phase（弧度）时月亮比满月暗多少：亮度随相角的经验式，弦月只有满月的约十分之一 */
function moonPhaseFactor(phase: number): number {
  const a = Math.abs(phase) / DEG
  return 10 ** (-0.4 * (0.026 * a + 4e-9 * a ** 4))
}

/** 垂直于月光的直射照度，勒克斯 */
export function moonDirectLux(sky: Sky, elevDeg: number, phase: number): number {
  if (elevDeg <= -0.8) return 0
  return FULL_MOON_LUX * moonPhaseFactor(phase) * Math.exp(-sky.extinction * (airMass(elevDeg) - 1)) * smooth(-0.8, 0.6, elevDeg)
}

/** 月光被大气散开后在水平面上的照度，勒克斯 */
export function moonSkyLux(sky: Sky, elevDeg: number, phase: number): number {
  return 0.1 * moonDirectLux(sky, elevDeg, phase) * Math.sqrt(Math.max(0, Math.sin(elevDeg * DEG)))
}

/** 太阳高度 elevDeg 度时，地平线上的光是什么颜色（线性 RGB，最亮的分量为 1）：高处冷白，低处金黄，贴地发红 */
export function sunColor(elevDeg: number): [number, number, number] {
  const t = smooth(-1, 22, elevDeg)
  return [1 - 0.04 * t, 0.48 + 0.5 * t, 0.22 + 0.78 * t]
}

/** 太阳高度 elevDeg 度时天光的颜色：白天冷白，日落时泛一点灰粉，入夜后是冷蓝 */
export function skyColor(elevDeg: number): [number, number, number] {
  if (elevDeg >= 0) {
    const t = smooth(0, 15, elevDeg)
    return [0.9 + 0.04 * t, 0.8 + 0.18 * t, 0.8 + 0.2 * t]
  }
  const t = smooth(-12, 0, elevDeg)
  return [0.5 + 0.4 * t, 0.66 + 0.14 * t, 0.86 - 0.06 * t]
}

/** 时间流速的查表：一天里每个钟点对应开天以来过了多少真实秒 */
interface Clock {
  readonly secs: Float64Array
}

const CLOCK_STEPS = 2880
const clocks = new WeakMap<Sky, Clock>()

/** 太阳高度在 dwellCenterDeg 附近时同样的钟点走得更久：按高度的高斯窗放慢，积分成每个钟点对应的真实秒数，一整天 dayS 秒 */
function clockOf(sky: Sky): Clock {
  let c = clocks.get(sky)
  if (c) return c
  const secs = new Float64Array(CLOCK_STEPS + 1)
  let sum = 0
  for (let i = 0; i < CLOCK_STEPS; i++) {
    const elev = sunAt(sky, ((i + 0.5) * 24) / CLOCK_STEPS).elev / DEG
    sum += 1 + sky.dwell * Math.exp(-(((elev - sky.dwellCenterDeg) / sky.dwellWidthDeg) ** 2))
    secs[i + 1] = sum
  }
  for (let i = 0; i <= CLOCK_STEPS; i++) secs[i] = (secs[i]! / sum) * sky.dayS
  c = { secs }
  clocks.set(sky, c)
  return c
}

/** 从零点算起到 hour 点要过多少真实秒 */
function secOfHour(sky: Sky, hour: number): number {
  const h = ((hour % 24) + 24) % 24
  const f = (h / 24) * CLOCK_STEPS
  const i = Math.min(CLOCK_STEPS - 1, Math.floor(f))
  const s = clockOf(sky).secs
  return s[i]! + (s[i + 1]! - s[i]!) * (f - i)
}

/** 开局后 sec 秒时天上过了多少天（从开局那天的零点算），小数部分是一天里的钟点占比 */
export function daysAt(sky: Sky, sec: number): number {
  const total = secOfHour(sky, sky.startHour) + sec
  const day = Math.floor(total / sky.dayS)
  const inDay = total - day * sky.dayS
  const s = clockOf(sky).secs
  let lo = 0
  let hi = CLOCK_STEPS
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (s[mid]! <= inDay) lo = mid
    else hi = mid
  }
  const f = lo + (inDay - s[lo]!) / Math.max(1e-9, s[lo + 1]! - s[lo]!)
  return day + f / CLOCK_STEPS
}

/** 开局后 sec 秒时是几点 */
export function hourAt(sky: Sky, sec: number): number {
  const d = daysAt(sky, sec)
  return (d - Math.floor(d)) * 24
}

/** 从 fromHour 点往后走到 toHour 点要多少真实秒 */
export function secsBetween(sky: Sky, fromHour: number, toHour: number): number {
  const d = secOfHour(sky, toHour) - secOfHour(sky, fromHour)
  return d >= 0 ? d : d + sky.dayS
}

/** 太阳在一天里升到 elevDeg 度与落到 elevDeg 度的钟点；那天够不着这个高度就是 null */
export function crossings(sky: Sky, elevDeg: number): { rise: number; set: number } | null {
  const lat = sky.latitudeDeg * DEG
  const decl = sky.declinationDeg * DEG
  const c = (Math.sin(elevDeg * DEG) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl))
  if (c <= -1 || c >= 1) return null
  const h = Math.acos(c) / (15 * DEG)
  return { rise: 12 - h, set: 12 + h }
}

/** 正午的太阳高度，度 */
export function noonElevDeg(sky: Sky): number {
  return 90 - Math.abs(sky.latitudeDeg - sky.declinationDeg)
}

/** 洞里的平均照度 lux 时能看清多少：按对数在 darkLux 到 brightLux 之间平滑过渡，0 是只看得见火光，1 是看得清整个洞 */
export function visibility(view: CaveConfig['view'], lux: number): number {
  return smooth(Math.log10(view.darkLux), Math.log10(view.brightLux), Math.log10(Math.max(lux, 1e-9)))
}

/** 洞里的平均照度 lux 时镜头短边看到多少格 */
export function viewU(view: CaveConfig['view'], lux: number): number {
  return view.nightU + (view.dayU - view.nightU) * visibility(view, lux)
}

/** 火把在水平距离 distU 格处的地面照度，勒克斯：点光源 I·cosθ/d²，一格 1 米 */
export function torchLux(torch: CaveConfig['torch'], distU: number): number {
  const h = torch.heightM
  return (torch.candela * h) / (distU * distU + h * h) ** 1.5
}

/** 火把把地面照到 lux 的最远水平距离，格 */
export function torchReachU(torch: CaveConfig['torch'], lux: number): number {
  const h = torch.heightM
  return Math.sqrt(Math.max(0, ((torch.candela * h) / lux) ** (2 / 3) - h * h))
}

/** 半径 radiusM 的圆形天窗正下方、离洞顶 depthM 米处的天空视角系数：看得见的天空占整个半球天光的多少 */
export function discViewFactor(radiusM: number, depthM: number): number {
  return (radiusM * radiusM) / (radiusM * radiusM + depthM * depthM)
}
