import mapsJson from '../assets/maps.json'
import mapDefaultsJson from '../assets/mapdefaults.json'

import { ENEMIES } from './enemies'
import type { EnemyDef } from '../types/enemies'
import type { DecorInstance, MapDecor, MapDef, MapDefaults, MapId } from '../types/maps'

export const MAPS = mapsJson as unknown as Record<MapId, MapDef>

export const MAP_IDS = Object.keys(MAPS) as readonly MapId[]

export function bossFor(id: MapId): EnemyDef {
  return ENEMIES[MAPS[id].boss]!
}

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
        rotation: (rand() * 2 - 1) * Math.PI,
      })
    }
  }
  return out
}

export const MAP = mapDefaultsJson as unknown as MapDefaults
