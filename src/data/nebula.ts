import type { NebulaConfig } from '../types/maps'

/**
 * 星云的物理，长度以格、时间以秒计，质量折成 GM（格³/秒²）。
 * 黑洞按 Paczyński–Wiita 势 Φ = −GM/(r − r_s)：r_s = 2GM/c² 是视界，最内稳定圆轨道在 3·r_s，那里每单位质量的束缚能是 c²/16。
 */

/** 最内稳定圆轨道的半径，以 r_s 计 */
export const ISCO_RS = 3
/** 远处看到的黑洞阴影（光子俘获截面）的半径，以 r_s 计：3√3/2 */
export const SHADOW_RS = (3 * Math.sqrt(3)) / 2
/** 吸积的辐射效率：落到最内稳定圆轨道放出的束缚能占静质量的 1/16，其余并进黑洞 */
export const ACCRETION_ETA = 1 / 16

/** 史瓦西半径 r_s = 2GM/c²，格 */
export function schwarzschildU(gm: number, lightU: number): number {
  return (2 * gm) / (lightU * lightU)
}

/** 离黑洞 rU 格处黑洞的引力大小，格/秒²：g = GM/(r − r_s)²，视界里没有定义 */
export function holePull(gm: number, rs: number, rU: number): number {
  const d = rU - rs
  return d > 0 ? gm / (d * d) : Infinity
}

/**
 * 壳层在离星云中心 rU 格处的引力大小，格/秒²，指向中心：空腔里为零，壳层里只算内侧的质量，外缘以外如同全部质量在球心。
 * 密度 ∝ x^n（x 是进壳层的深度占壳厚 w 的比例），内侧质量 ∝ ∫(a + w·t)²·tⁿ dt，从 0 积到 x
 */
export function shellPull(shell: NebulaConfig['shell'], rU: number): number {
  const { innerU: a, outerU: b, gm, rise: n } = shell
  if (rU <= a) return 0
  const w = b - a
  const mass = (x: number): number => (a * a * x ** (n + 1)) / (n + 1) + (2 * a * w * x ** (n + 2)) / (n + 2) + (w * w * x ** (n + 3)) / (n + 3)
  return (gm * mass(Math.min(1, (rU - a) / w))) / mass(1) / (rU * rU)
}

/** 看得见的内壁离星云中心多远，格：从内壁往里沿半径的光深按 τ·x^(n+1) 涨，到 1 的那一层被黑洞的光照亮 */
export function wallU(shell: NebulaConfig['shell']): number {
  return shell.innerU + (shell.outerU - shell.innerU) * shell.tau ** (-1 / (shell.rise + 1))
}

/**
 * 走不出来的半径，格：身体在星云气体里按终速 g·质量/阻力 被拖着漂，漂得比自己能走的 speed 还快就再也走不出来。
 * fallPerSpeed 是 (质量/阻力)/最快速度：(r − r_s)² = GM·fallPerSpeed
 */
export function captureU(gm: number, rs: number, fallPerSpeed: number): number {
  return rs + Math.sqrt(gm * fallPerSpeed)
}

/** 黑洞正下方星云内壁的深度，格：活动的平面是球壳的赤道面，空腔半径 a，黑洞离球心 dU */
export function floorDepthU(innerU: number, dU: number): number {
  return Math.sqrt(Math.max(0, innerU * innerU - dU * dU))
}

/**
 * 爱因斯坦环的半径，格：镜头在黑洞正上方 cameraU 格，弱场偏折角 α = 2·r_s/b 把下方 depthU 格处正对黑洞的那一点成像成环，
 * b² = 2·r_s·D·H/(H + D)；镜头无限高时就是 √(2·r_s·D)
 */
export function einsteinU(rs: number, depthU: number, cameraU: number): number {
  return Math.sqrt((2 * rs * depthU * cameraU) / (cameraU + depthU))
}

/** 往外走停下的半径，格：壳层里引力随半径单调增大，g·fall 追上 speed 的地方；外缘都追不上就停不下 */
export function stopRadiusU(shell: NebulaConfig['shell'], fallPerSpeed: number): number {
  if (shellPull(shell, shell.outerU) * fallPerSpeed < 1) return Infinity
  let lo = shell.innerU
  let hi = shell.outerU
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (shellPull(shell, mid) * fallPerSpeed >= 1) hi = mid
    else lo = mid
  }
  return hi
}

/** 壳层外缘以外重新把它拉回来的最远半径，格：GM/r²·fall 追得上 speed */
export function shellRecaptureU(shell: NebulaConfig['shell'], fallPerSpeed: number): number {
  return Math.sqrt(shell.gm * fallPerSpeed)
}
