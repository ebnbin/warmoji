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

export interface ObstacleTuning {
  /** 身高：半径 refRadiusU 格（不算队长倍率）的身体高 heightM 米，别的按半径缩放；跨得过的高度、眼睛的高度按身高的比例 */
  readonly body: {
    readonly refRadiusU: number
    readonly heightM: number
    readonly step: number
    readonly eye: number
  }
  /** 平射的弹体齐胸飞，近战与范围效果也按这个高度看够不够得着；抛射的从 launchM 出手，落到地上；爆炸与落地的冲击从离地 blastM 处打出去 */
  readonly shot: {
    readonly flatM: number
    readonly launchM: number
    readonly blastM: number
  }
  readonly materials: Readonly<Record<string, ObstacleDef>>
}

export type ObstacleId = keyof (typeof obstaclesJson)['materials']
