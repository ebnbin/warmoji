import type { AnimClipId, FxDecl } from '../../types/anim'
import { Painter } from './kit.ts'

/** 动画配方里的一个部件在新图里是哪几层；转过、缩放的部件要给转轴 */
export interface RigPart<N extends string = string> {
  readonly layers: readonly N[]
  readonly cx?: number
  readonly cy?: number
}

/** 一段动画在新图里怎么绑：部件按配方的顺序一一对应；特效的位置跟新图走时整段换掉 */
export interface Rig<N extends string = string> {
  readonly parts: readonly RigPart<N>[]
  readonly fx?: readonly FxDecl[]
}

/** 一张新画风的 emoji：按层画出来（层的顺序就是叠放顺序），配方里要动的部件按层名绑定 */
export interface Design<N extends string = string> {
  readonly draw: (p: Painter) => Readonly<Record<N, string>>
  readonly rig?: Partial<Readonly<Record<AnimClipId, Rig<N>>>>
}

export function design<N extends string>(d: { readonly draw: (p: Painter) => Readonly<Record<N, string>>; readonly rig?: Partial<Readonly<Record<AnimClipId, Rig<NoInfer<N>>>>> }): Design<N> {
  return d
}

/** 画出来的一张图：defs 在前，之后每层一个顶层元素 */
export interface Drawn {
  readonly body: string
  readonly layers: readonly string[]
}

export function render(id: string, d: Design): Drawn {
  const p = new Painter(`p${id.replace(/[^0-9a-z]/g, '')}-`)
  const layers = d.draw(p)
  const names = Object.keys(layers)
  const body = p.defsSvg() + names.map((name) => `<g id="${name}">${layers[name]}</g>`).join('')
  return { body, layers: names }
}
