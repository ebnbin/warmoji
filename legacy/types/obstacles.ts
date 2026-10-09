import type obstaclesJson from '../assets/obstacles.json'

/** 一种障碍的材质：挡什么、能不能被穿过、打不打得坏 */
export interface ObstacleDef {
  readonly name: string
  /** 穿墙的身体（幽灵、蜜蜂）穿不穿得过 */
  readonly phase: boolean
  /** 挡不挡视线 */
  readonly opaque: boolean
  /** 弹体要攒几次贯穿才穿得过：0 是一碰就过，null 是打不穿 */
  readonly pierce: number | null
  /** 结构强度：破坏力除以它才是能打掉的体积；null 是打不坏 */
  readonly strength: number | null
}

/** 竖直方向占的层：从第 lo 层到第 hi 层（含），第 0 层贴着地 */
export type Span = readonly [lo: number, hi: number]

export interface ObstacleTuning {
  /**
   * 竖直方向按层算：半径 refRadiusU 格的标准身体占 layers 层、高 heightM 米，一层就是 heightM / layers 米。
   * 占 n 层的身体过得去从它脚下往上 ⌊n·step⌋ 层以内的障碍：走着的跨过去，飘着的从上面过去
   */
  readonly body: {
    readonly refRadiusU: number
    readonly heightM: number
    readonly layers: number
    readonly step: number
  }
  /** 爆炸与落地的冲击从离地 blastM 米处打出去 */
  readonly blastM: number
  readonly materials: Readonly<Record<string, ObstacleDef>>
}

export type ObstacleId = keyof (typeof obstaclesJson)['materials']
