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
  volcano: '火山：32×32 以内一块崖壁围着的盆地，边缘弯弯曲曲、每局不同：崖壁和陡峭的山体都是硬边界（脚下堆着碎石的地方就是边），走到跟前就停住，子弹照样飞过去。盆地边上有一座活火山，大约每分钟喷发一次：先冒烟发红、地动山摇，随后火山口里的熔岩湖涨过口沿，熔岩往四面八方顺着地势飞快地流下来，高峰时能盖住约四分之一的盆地，流到崖脚就被挡住。熔岩盖住的地方敌我都挨烫，站进去的敌人一样会被烧死；离火山口越远凉得越快，外围先结壳凝成黑色的岩石、又能站人，越靠近火山烫得越久；旧岩石会让下一次的熔岩改道',
  nebula: '星云：空心的星云，空腔里某处有一个黑洞。人、怪、掉落物、子弹、流星都受它的万有引力，越近越强：身体在星云气体里被拖着漂，子弹和流星的轨迹被引弯。中心掉进视界就被吞噬（敌我通吃）；虚线圈是当前队长走不出来的范围，冲刺、跳跃、瞬移能冲出来。空腔外没有墙，是厚重的星云壳层：空腔里感觉不到它的引力，走进壳层越深被拉回得越狠，越轻的身体走得越深；子弹射进去会被拉回来。壳层落下的碎块化作流星横穿空腔，被黑洞加速后砸得更疼，扎回壳层就烧毁',
}

const num = (v: number): string => `${+v.toFixed(2)}`
const pct = (v: number): string => `${Math.round(v * 100)}%`

/** 这张图的地面怎么耗体力、怎么回 */
export function mapStaminaLine(def: MapDef): string {
  const s = def.stamina
  const parts = [`赶路每走一格耗 ${num(s.exertion)} 点，歇着回复 ×${num(s.regen)}`]
  if (def.river) parts.push(`逆流 ×${num(def.river.upstream)}、顺流 ×${num(def.river.downstream)}`)
  if (def.ice) parts.push(`落水后每格耗 ${num(def.ice.waterExertion)} 点、回复 ×${num(def.ice.waterRegen)}`)
  return `体力：${parts.join('；')}（敌我通吃）`
}

const STAMINA_RULE = `体力低于 ${pct(STAMINA.slowFrom)} 开始变慢、见底只剩 ${pct(STAMINA.floor)} 速度；站定片刻开始回，歇得越久回得越快。队长决定全队跑多快，队员跟在后面只耗队长那份的 ${pct(STAMINA.draft)}；全队按最累的活人减速，敌人也会累`

/** 地图的玩法：世界规则、这张图的体力，再讲体力怎么掉怎么回 */
export function mapPlayLines(def: MapDef): string[] {
  return [MAP_PLAY_LABEL[def.kind], mapStaminaLine(def), STAMINA_RULE]
}
