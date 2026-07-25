import { BoundedScene } from './BoundedScene'

// 残垣（kind='ruins'）：有界竞技场 + 断壁特性。断壁网格（WallGrid）/流场寻路（FlowField）/
// 视线遮挡/穿墙分流/碾墙已下沉为 BoundedScene 的数据驱动可选特性（按 map.walls 装配）——
// 本类只剩场景键路由的薄壳；任何有界图配上 walls 数据即可获得同款断壁玩法，
// 且可与 dayNight 等其它可选特性自由叠加组合。
export class RuinsScene extends BoundedScene {
  constructor() {
    super('arenaRuins')
  }
}
