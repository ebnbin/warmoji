import { STAMINA } from '../data/stamina'
import type { MapDef } from '../types/maps'

const MAP_PLAY_LABEL: Record<MapDef['kind'], string> = {
  bounded: '有界竞技场：方形场地，边界围合',
  river: '奔流河道：万物随水流漂移，逆流而战',
  void: '环面战场：四壁皆传送门，出这头即现那头',
  ruins: '断壁废墟：墙挡人 / 挡弹 / 挡视线，靠掩体与探头作战',
  daynight: '昼夜原野：30×30 有界，视野随时间涨落——正午纵览全场、午夜相机收窄并四合迷雾；昼夜各出一批怪',
  space: '深空星海：圆形禁锢场，越往外阻力越大、谁也逃不出；天体不时沿直线横扫（敌我通吃、有预警可躲）',
  ice: '浮冰：25×25 方形浮冰，全场打滑——不跟手、刹不住、会过冲，击退也滑得更远；滑出冰面即落水，每秒掉血又游得慢（敌我通吃），把敌人推下水淹死是活路。相机永远跟随',
}

/** 地图的玩法：世界规则，地面费力的再讲体力怎么掉怎么回 */
export function mapPlayLines(def: MapDef): string[] {
  const lines = [MAP_PLAY_LABEL[def.kind]]
  if (def.exertion) {
    lines.push(
      `地面费力：赶路每走一格耗 ${+(def.exertion * 100).toFixed(1)}% 体力，体力低于 ${Math.round(STAMINA.slowFrom * 100)}% 开始变慢、见底只剩 ${Math.round(STAMINA.floor * 100)}% 速度；站定片刻开始回，歇得越久回得越快。全队按最累的人走，敌人也会累`,
    )
  }
  return lines
}
