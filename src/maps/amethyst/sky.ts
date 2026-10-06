import type { AmethystConfig } from '../../types/maps'

type Sky = AmethystConfig['sky']

const RAD = Math.PI / 180
/** 朔望月，天 */
export const LUNAR_DAYS = 29.53
/** 大气层外垂直于阳光的照度，勒克斯 */
const SOLAR_LUX = 128000
/** 满月在天顶时垂直于月光的照度，勒克斯 */
const FULL_MOON_LUX = 0.27
/** 没有月亮的晴夜，星光与气辉落在水平面上的照度，勒克斯 */
const AIRGLOW_LUX = 0.001

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function ease(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 天上的一个方向：x、y 是地图平面上朝它的单位向量（画面上方朝南、左方朝东：日出在左、正午在上、日落在右），elev 是高度角，弧度 */
export interface Bearing {
  readonly x: number
  readonly y: number
  readonly elev: number
}

/**
 * 纬度 lat、赤纬 dec 的天体在时角 ha（弧度，正午为 0、上午为负）时从地面看的方向：天球上它在子午面里的坐标按纬度转到地平坐标，
 * 西为 +x、南为 −y
 */
function bearing(lat: number, dec: number, ha: number): Bearing {
  const meridian = Math.cos(dec) * Math.cos(ha)
  const west = Math.cos(dec) * Math.sin(ha)
  const pole = Math.sin(dec)
  const up = pole * Math.sin(lat) + meridian * Math.cos(lat)
  const south = meridian * Math.sin(lat) - pole * Math.cos(lat)
  const flat = Math.hypot(west, south)
  const elev = Math.asin(Math.max(-1, Math.min(1, up)))
  return flat > 1e-9 ? { x: west / flat, y: -south / flat, elev } : { x: 0, y: -1, elev }
}

/** 时角，弧度：hour 点（0–24）时太阳离正午多远 */
export function hourAngle(hour: number): number {
  return (hour - 12) * 15 * RAD
}

/** 月龄 age 天时月亮在太阳东边多远，弧度：它比太阳晚这么多升起 */
export function lag(age: number): number {
  const a = (((age / LUNAR_DAYS) % 1) + 1) % 1
  return a * Math.PI * 2
}

/** 月相角：日月对月亮张开的角，弧度；满月为 0，朔为 π */
export function phaseOf(age: number): number {
  const e = lag(age)
  return Math.PI - Math.abs(e > Math.PI ? e - Math.PI * 2 : e)
}

export function sunBearing(sky: Sky, hour: number): Bearing {
  return bearing(sky.latitudeDeg * RAD, sky.declinationDeg * RAD, hourAngle(hour))
}

/** 月亮的赤纬按太阳的算，时角比太阳落后它在太阳东边的那段 */
export function moonBearing(sky: Sky, hour: number, age: number): Bearing {
  return bearing(sky.latitudeDeg * RAD, sky.declinationDeg * RAD, hourAngle(hour) - lag(age))
}

/** 太阳在一天里升过、落过 elevDeg 度的钟点；那天够不着这个高度就是 null */
export function crossing(sky: Sky, elevDeg: number): { rise: number; set: number } | null {
  const lat = sky.latitudeDeg * RAD
  const dec = sky.declinationDeg * RAD
  const c = (Math.sin(elevDeg * RAD) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec))
  if (c <= -1 || c >= 1) return null
  const h = Math.acos(c) / (15 * RAD)
  return { rise: 12 - h, set: 12 + h }
}

/** 一整天按太阳的高度分四段：从早上太阳升过 twilightDeg 度起，白天、黄昏、夜里、黎明各占几个钟点、各走多少真实秒 */
interface Cycle {
  readonly from: number
  readonly hours: readonly number[]
  readonly secs: readonly number[]
  readonly total: number
}

const CYCLES = new WeakMap<Sky, Cycle>()

function cycleOf(sky: Sky): Cycle {
  let c = CYCLES.get(sky)
  if (c) return c
  const hi = crossing(sky, sky.twilightDeg)
  const lo = crossing(sky, -sky.twilightDeg)
  if (!hi || !lo) throw new Error('紫水晶洞穴的太阳每天要升过、落过晨昏的高度')
  const hours = [hi.set - hi.rise, lo.set - hi.set, lo.rise + 24 - lo.set, hi.rise - lo.rise]
  const secs = [sky.dayS, sky.duskS, sky.nightS, sky.dawnS]
  c = { from: hi.rise, hours, secs, total: secs.reduce((a, b) => a + b, 0) }
  CYCLES.set(sky, c)
  return c
}

/** 从这一圈起点（早上太阳升过 twilightDeg 度）走到 hour 点要多少真实秒 */
function secsInto(c: Cycle, hour: number): number {
  let h = (((hour - c.from) % 24) + 24) % 24
  let s = 0
  for (let k = 0; k < 4; k++) {
    if (h <= c.hours[k]!) return s + (h / c.hours[k]!) * c.secs[k]!
    h -= c.hours[k]!
    s += c.secs[k]!
  }
  return s
}

/** 开局后 sec 秒时：几点（0–24），从开局那天零点起过了多少天 */
export function clockAt(sky: Sky, sec: number): { hour: number; days: number } {
  const c = cycleOf(sky)
  const t = secsInto(c, sky.startHour) + sec
  const n = Math.floor(t / c.total)
  let left = t - n * c.total
  let h = c.from
  for (let k = 0; k < 4; k++) {
    if (left <= c.secs[k]! || k === 3) {
      h += c.hours[k]! * Math.min(1, left / c.secs[k]!)
      break
    }
    left -= c.secs[k]!
    h += c.hours[k]!
  }
  return { hour: h % 24, days: n + h / 24 }
}

/** 从 fromHour 点往后走到 toHour 点要多少真实秒 */
export function secsUntil(sky: Sky, fromHour: number, toHour: number): number {
  const c = cycleOf(sky)
  const d = secsInto(c, toHour) - secsInto(c, fromHour)
  return d >= 0 ? d : d + c.total
}

/** 太阳高 elevDeg 度时阳光穿过的大气有天顶的几倍厚（Kasten–Young） */
function airMass(elevDeg: number): number {
  const h = Math.max(elevDeg, -0.5)
  return 1 / (Math.sin(h * RAD) + 0.50572 * (h + 6.07995) ** -1.6364)
}

/** 垂直于阳光的直射照度，勒克斯：按大气质量消光，日面沉下地平线时淡出 */
export function sunLux(sky: Sky, elevDeg: number): number {
  if (elevDeg <= -1) return 0
  return SOLAR_LUX * Math.exp(-sky.extinction * airMass(elevDeg)) * ease(-1, 0.5, elevDeg)
}

/** 晴天的天光落在水平面上的照度，勒克斯：白天随太阳升高变亮；日落后按暮光的对数曲线变暗，最暗是星光与气辉 */
export function skyLux(elevDeg: number): number {
  if (elevDeg >= 0) return 500 + 16000 * Math.sin(elevDeg * RAD) ** 0.75
  const d = -elevDeg
  return 10 ** (2.7 - 0.33 * d - 0.005 * d * d) + AIRGLOW_LUX
}

/** 月相角 phase（弧度）时月亮比满月暗多少（按相角的经验式）：弦月只有满月的一成上下 */
function moonDim(phase: number): number {
  const a = Math.abs(phase) / RAD
  return 10 ** (-0.4 * (0.026 * a + 4e-9 * a ** 4))
}

/** 垂直于月光的直射照度，勒克斯 */
export function moonLux(sky: Sky, elevDeg: number, phase: number): number {
  if (elevDeg <= -1) return 0
  return FULL_MOON_LUX * moonDim(phase) * Math.exp(-sky.extinction * (airMass(elevDeg) - 1)) * ease(-1, 0.5, elevDeg)
}

/** 月光被大气散开后落在水平面上的照度，勒克斯 */
export function moonSkyLux(sky: Sky, elevDeg: number, phase: number): number {
  return 0.12 * moonLux(sky, elevDeg, phase) * Math.sqrt(Math.max(0, Math.sin(elevDeg * RAD)))
}

type Rgb = [number, number, number]

/** 阳光的颜色（线性 RGB，最亮的分量为 1）：高处暖白，低处金黄，贴着地平线发红 */
export function sunTint(elevDeg: number): Rgb {
  const t = ease(-1, 20, elevDeg)
  return [1, 0.45 + 0.5 * t, 0.2 + 0.68 * t]
}

/** 天光的颜色：白天淡蓝，日落时橙粉，暮色转紫，入夜是深蓝 */
export function skyTint(elevDeg: number): Rgb {
  if (elevDeg >= 0) {
    const t = ease(0, 15, elevDeg)
    return [1 - 0.28 * t, 0.66 + 0.18 * t, 0.55 + 0.45 * t]
  }
  const a = ease(-5, 0, elevDeg)
  const b = ease(-14, -5, elevDeg)
  const dusk: Rgb = [0.55 + 0.45 * a, 0.45 + 0.21 * a, 0.95 - 0.4 * a]
  return [0.38 + (dusk[0] - 0.38) * b, 0.45 + (dusk[1] - 0.45) * b, 1 + (dusk[2] - 1) * b]
}

/** 此刻天上的样子：几点、开局那天零点起过了几天，日月的方向、月龄与月相角；直射按垂直于光线、天光按水平面，勒克斯 */
export interface SkyNow {
  hour: number
  days: number
  sun: Bearing
  moon: Bearing
  age: number
  phase: number
  sunLux: number
  skyLux: number
  moonLux: number
  moonSkyLux: number
}

export function blankSky(): SkyNow {
  const down = { x: 0, y: -1, elev: -1 }
  return { hour: 0, days: 0, sun: down, moon: down, age: 0, phase: 0, sunLux: 0, skyLux: 0, moonLux: 0, moonSkyLux: 0 }
}

/** 开局后 sec 秒时天上的样子；月龄从这一局开局时的 age0 起，每过一天长一天 */
export function skyAt(sky: Sky, sec: number, age0: number, out: SkyNow): SkyNow {
  const { hour, days } = clockAt(sky, sec)
  const age = (age0 + days) % LUNAR_DAYS
  out.hour = hour
  out.days = days
  out.sun = sunBearing(sky, hour)
  out.moon = moonBearing(sky, hour, age)
  out.age = age
  out.phase = phaseOf(age)
  out.sunLux = sunLux(sky, out.sun.elev / RAD)
  out.skyLux = skyLux(out.sun.elev / RAD)
  out.moonLux = moonLux(sky, out.moon.elev / RAD, out.phase)
  out.moonSkyLux = moonSkyLux(sky, out.moon.elev / RAD, out.phase)
  return out
}

/** 火把在水平距离 distU 格处的地面照度，勒克斯：点光源 I·cosθ/d² */
export function torchLux(torch: AmethystConfig['torch'], distU: number): number {
  const h = torch.heightM
  return (torch.candela * h) / (distU * distU + h * h) ** 1.5
}

/** 火把把地面照到 lux 的最远水平距离，格 */
export function torchReach(torch: AmethystConfig['torch'], lux: number): number {
  const h = torch.heightM
  return Math.sqrt(Math.max(0, ((torch.candela * h) / lux) ** (2 / 3) - h * h))
}

/** 洞里的平均照度 lux 时看得清多少：按对数在 darkLux 到 brightLux 之间平滑过渡，0 是只看得见火光，1 是看得清整个洞 */
export function clarity(view: AmethystConfig['view'], lux: number): number {
  return ease(Math.log10(view.darkLux), Math.log10(view.brightLux), Math.log10(Math.max(lux, 1e-9)))
}

/** 洞里的平均照度 lux 时镜头短边看到多少格 */
export function spanAt(view: AmethystConfig['view'], lux: number): number {
  return view.nightU + (view.dayU - view.nightU) * clarity(view, lux)
}
