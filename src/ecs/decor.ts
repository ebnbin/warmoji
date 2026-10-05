import type { EcsAtlas } from './atlas'
import type { PaintSprite } from './render/sprites'

/** 地上的一件布景：不是实体；地图要挪它、转它时直接改 x、y、rot */
export interface Decor extends PaintSprite {
  x: number
  y: number
  rot: number
}

/** 图集里 id 的那张图，描边与单位一样 */
export function decorSprite(atlas: EcsAtlas, id: string, x: number, y: number, size: number, rot: number, alpha: number): Decor {
  return { z: 1, frame: atlas.index(id, 'player'), x, y, w: size, h: size, rot, color: 0xffffff, alpha }
}

/** 只留下 keep 的布景 */
export function keepDecor(list: PaintSprite[], keep: (s: PaintSprite) => boolean): void {
  let n = 0
  for (const s of list) if (keep(s)) list[n++] = s
  list.length = n
}
