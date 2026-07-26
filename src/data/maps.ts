import mapsJson from '../assets/maps.json'
import mapDefaultsJson from '../assets/mapdefaults.json'

import { ENEMIES } from './enemies'
import type { EnemyDef } from '../types/enemies'
import type { DecorInstance, MapDecor, MapDef, MapDefaults, MapId } from '../types/maps'

// 地图 = 关卡：一种玩法一个主题——黑森林（有界竞技场）、荒漠（无限世界
// + 终波缩圈）、奔流（单屏河流 + 水流漂移），每张图都是不同的世界规则。
// 装饰配置只固定「规则」（emoji 池/尺寸/透明度/密度/倾斜），每局的具体摆放
// 由 rollDecor 按 run 内的种子随机生成——一局一景，同局各波不变。

export const MAPS = mapsJson as unknown as Record<MapId, MapDef>

export const MAP_IDS = Object.keys(MAPS) as readonly MapId[]

/** 本图终波 Boss 定义（按 map.boss 引用 enemies 目录） */
export function bossFor(id: MapId): EnemyDef {
  return ENEMIES[MAPS[id].boss]!
}

/** 本图会实际出现的全部敌人：波次编排的常规怪 + 终波 Boss + 它们衍生的子代
 * （巢穴生成 / 死亡分裂，如泡泡→小泡泡、虫巢→小飞虫）。按出现序去重，子代紧随亲代、
 * Boss 末位。测试模式的敌人清单据此按图裁剪，只列本图有的敌人。 */
export function mapEnemyRoster(id: MapId): EnemyDef[] {
  const seen = new Set<string>()
  const out: EnemyDef[] = []
  const add = (def: EnemyDef): void => {
    if (seen.has(def.kind)) return
    seen.add(def.kind)
    out.push(def)
    if (def.spawner) add(def.spawner.into)
    for (const fx of def.onDeath ?? []) if (fx.kind === 'split') add(fx.into)
  }
  for (const row of MAPS[id].mix) {
    const def = ENEMIES[row.kind]
    if (def) add(def)
  }
  add(bossFor(id))
  return out
}

// ── 装饰散布 ────────────────────────────────────────────────

/** 低频值噪声场：晶格随机值 + 平滑双线性插值，返回 (xU,yU) → 0..1。
 * 晶格取自同一 rand 流，保证同种子同摆放 */
function noiseField(
  rand: () => number,
  cols: number,
  rows: number,
  waveU: number,
): (x: number, y: number) => number {
  const gw = Math.ceil(cols / waveU) + 2
  const gh = Math.ceil(rows / waveU) + 2
  const lattice: number[] = []
  for (let i = 0; i < gw * gh; i++) lattice.push(rand())
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  return (x, y) => {
    const gx = Math.min(gw - 2, Math.max(0, x / waveU))
    const gy = Math.min(gh - 2, Math.max(0, y / waveU))
    const ix = Math.floor(gx)
    const iy = Math.floor(gy)
    const fx = smooth(gx - ix)
    const fy = smooth(gy - iy)
    const v00 = lattice[iy * gw + ix]!
    const v10 = lattice[iy * gw + ix + 1]!
    const v01 = lattice[(iy + 1) * gw + ix]!
    const v11 = lattice[(iy + 1) * gw + ix + 1]!
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
  }
}

/** 逐局随机的装饰摆放：地图自身的 1×1 格即虚拟网格，每格按密度掷是否放置。
 * 防「太整齐」两板斧：低频噪声场调制每格密度（自然成簇、留出空地），
 * 摆放中心允许溢出到邻格（±1.1 格）而非只在本格内 jitter；
 * 中心钳制进地图，避免探出边缘 */
export function rollDecor(
  def: MapDecor,
  rand: () => number,
  cols: number,
  rows: number,
): DecorInstance[] {
  const density = def.density[0] + rand() * (def.density[1] - def.density[0])
  const noise = noiseField(rand, cols, rows, 6)
  const out: DecorInstance[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      // 场值重映射：低处近乎空地、高处密聚（均值 ≈0.76，总量仍由 density 主导）
      const local = density * (0.15 + 1.7 * Math.pow(noise(cx + 0.5, cy + 0.5), 1.5))
      if (rand() >= local) continue
      const emoji = def.emojis[Math.min(def.emojis.length - 1, Math.floor(rand() * def.emojis.length))]!
      const sizeU = def.sizeU[0] + rand() * (def.sizeU[1] - def.sizeU[0])
      const clamp = (v: number, max: number): number =>
        Math.min(Math.max(v, sizeU / 2), max - sizeU / 2)
      out.push({
        emoji,
        xU: clamp(cx + 0.5 + (rand() * 2 - 1) * 1.1, cols),
        yU: clamp(cy + 0.5 + (rand() * 2 - 1) * 1.1, rows),
        sizeU,
        alpha: def.alpha[0] + rand() * (def.alpha[1] - def.alpha[0]),
        // 全部 360° 随机旋转：装饰是「散落在地上的东西」，没有统一朝向才自然
        rotation: (rand() * 2 - 1) * Math.PI,
      })
    }
  }
  return out
}

export const MAP = mapDefaultsJson as unknown as MapDefaults
