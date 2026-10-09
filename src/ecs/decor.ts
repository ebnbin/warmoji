import type { EcsAtlas } from './atlas'
import type { PaintSprite } from './render/sprites'

/** 地上的一件布景：不是实体；地图要挪它、转它时直接改 x、y、rot */
export interface Decor extends PaintSprite {
  x: number
  y: number
  rot: number
}

/** 布景比地图写的再淡这么多：它是背景，不该和单位抢眼 */
const DECOR_FADE = 0.8

/** 图集里 id 的那张图，不描边、淡一些 */
export function decorSprite(atlas: EcsAtlas, id: string, x: number, y: number, size: number, rot: number, alpha: number): Decor {
  return { z: 1, frame: atlas.index(id), x, y, w: size, h: size, rot, color: 0xffffff, alpha: alpha * DECOR_FADE }
}

/** 只留下 keep 的布景 */
export function keepDecor(list: PaintSprite[], keep: (s: PaintSprite) => boolean): void {
  let n = 0
  for (const s of list) if (keep(s)) list[n++] = s
  list.length = n
}
