import { ArenaScene } from './ArenaScene'

// 晨昏原野（kind='daynight'）：有界竞技场 + 昼夜循环特性。
// 昼夜的相机缩放/夜幕迷雾/两批怪出怪已下沉为 ArenaScene 的数据驱动可选特性（按 map.dayNight 装配）——
// 本类只剩场景键路由的薄壳；任何有界图配上 dayNight 数据即可获得同款昼夜玩法（组合式地图特性）。
export class DayNightArenaScene extends ArenaScene {
  constructor() {
    super('arenaDayNight')
  }
}
