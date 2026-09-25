export interface PartKeyframe {
  readonly t: number
  readonly rotate?: number
  readonly tx?: number
  readonly ty?: number
  readonly scale?: number
  readonly scaleX?: number
  readonly scaleY?: number
  readonly opacity?: number
}
export interface AnimPart {
  readonly indices: readonly number[]
  readonly cx?: number
  readonly cy?: number
  readonly keyframes: readonly PartKeyframe[]
}
export type FxSide = 'back' | 'front'
export interface FxParams {
  readonly rise: {
    readonly particles: readonly { x: number; phase: number; size: number; color: string; drift?: number }[]
    readonly y0: number
    readonly y1: number
  }
  readonly shine: {
    readonly clip: { cx: number; cy: number; r: number }
    readonly id: string
  }
  readonly sparkles: {
    readonly stars: readonly { x: number; y: number; r: number; phase: number; color?: string }[]
  }
  readonly ripples: {
    readonly cx: number
    readonly cy: number
    readonly color: string
    readonly rings: readonly { phase: number }[]
    readonly window: readonly [number, number]
  }
  readonly bolts: {
    readonly bolts: readonly {
      points: readonly (readonly [number, number])[]
      window: readonly [number, number]
      color?: string
      width?: number
    }[]
  }
  readonly steam: {
    readonly wisps: readonly { x: number; y0: number; phase: number }[]
  }
}
export type FxGen = keyof FxParams
export type FxDecl<G extends FxGen = FxGen> = {
  readonly [K in G]: { readonly gen: K; readonly layer?: FxSide; readonly params: FxParams[K] }
}[G]
export type AnimClipKind = 'loop' | 'cycle'
export type AnimClipId = 'idle' | 'attack'
export interface AnimClipEntry {
  readonly kind?: AnimClipKind
  readonly frames?: number
  readonly viewBox?: string
  readonly parts: readonly AnimPart[]
  readonly fx?: readonly FxDecl[]
}
export interface AnimResourceEntry {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly anatomy: string
  readonly clips: Readonly<Partial<Record<AnimClipId, AnimClipEntry>>>
}
export interface AnimResource {
  readonly def: { readonly frames: number; readonly durMs: number }
  readonly animations: Readonly<Record<string, AnimResourceEntry>>
}
