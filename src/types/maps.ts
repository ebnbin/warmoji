import type mapsJson from '../assets/maps.json'
import type { Palette } from '../util/palette'
import type { EnemyKind, EnemyMixRow } from './enemies'

export interface MapDecor {
  readonly emojis: readonly string[]
  readonly sizeU: readonly [number, number]
  readonly alpha: readonly [number, number]
  readonly density: readonly [number, number]
}
interface WallsConfig {
  readonly blocks: number
  readonly maxLen: number
  readonly centerClearU: number
  readonly spawnMinCellDist: number
  readonly reflowMs: number
  /** 身体撞墙时的半径上限，过道一格宽 */
  readonly bodyRadiusCapU: number
}
export interface DayNightConfig {
  readonly cycleSec: number
  readonly startHour: number
  readonly visionMax: number
  readonly visionMid: number
  readonly visionMin: number
  readonly fogRadiusDusk: number
  readonly fogRadiusMidnight: number
  readonly fogAlphaMax: number
  readonly daySpawnScale: number
  readonly nightSpawnScale: number
}
/** 地面对体力的影响：赶路每走一格扣几点体力，歇着时体力回复乘多少 */
export interface GroundStamina {
  readonly exertion: number
  readonly regen: number
}
export interface IceConfig {
  readonly floeU: number
  readonly traction: number
  readonly waterTraction: number
  readonly waterViscosity: number
  /** 水里的体力：冰面按地图的体力算 */
  readonly waterExertion: number
  readonly waterRegen: number
  readonly waterTeamDps: number
  readonly waterEnemyDps: number
  readonly waterTickMs: number
}
export interface SpaceConfig {
  readonly blackholeRadiusU: number
  readonly meteor: {
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    readonly radiusU: number
    readonly speedU: number
    readonly travelU: number
    readonly offsetU: number
    readonly damage: number
  }
}
/** 星云：圆心在原点的空心厚球壳，空腔里有一个黑洞，引力按普卢默软化的万有引力 g = GM·r/(r²+ε²)^{3/2} 作用于一切 */
export interface NebulaConfig {
  /** 壳层的引力按牛顿壳层定理：空腔里为零，壳层里只算内侧那部分质量，外缘以外如同全部质量在中心 */
  readonly shell: {
    readonly innerU: number
    readonly outerU: number
    /** 引力常数乘壳层总质量，格³/秒² */
    readonly gm: number
  }
  /** 构建期校验的余量：任何身体以 speedMul 倍的最快速度走到停下处，再往外瞬移 leapU 格，引力仍把它拉回 */
  readonly contain: {
    readonly speedMul: number
    readonly leapU: number
  }
  readonly hole: {
    /** 引力常数乘黑洞质量，格³/秒² */
    readonly gm: number
    readonly softeningU: number
    /** 视界半径：中心进了这个圈就被吞噬 */
    readonly horizonU: number
    /** 黑洞离星域中心的距离范围，方向随机 */
    readonly fromCenterU: readonly [number, number]
    /** 刷怪点与据点离黑洞至少多远 */
    readonly clearU: number
  }
  readonly meteor: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    /** 流星本体半径：中心距小于它就被砸中 */
    readonly radiusU: number
    /** 从壳层内壁冲进空腔时的速度 */
    readonly speedU: number
    /** 瞄准点在队长两侧最多偏多远 */
    readonly offsetU: number
    /** 以 speedU 飞行时的伤害，按动能随速度的平方变化 */
    readonly damage: number
    /** 轨迹按这个步长积分，最长飞这么久 */
    readonly stepMs: number
    readonly maxFlightMs: number
  }
}
/**
 * 火山：能走的是方形地图里一块边缘不规则的盆地，四周是崖壁与高地；一座火山背靠盆地边，山体谁也上不去。
 * 火山定期从火山口喷发，熔岩往四面八方顺着地势流，盖住的地方敌我都受伤，冷却凝固成岩石后又能站人
 */
export interface VolcanoConfig {
  /** 地形格子的边长，高度与厚度也以格计；地形铺满镜头能看到的地图外一圈 */
  readonly cellU: number
  readonly rim: {
    /** 盆地的边离方形地图的边多远：按噪声在两者之间起伏，起伏的波长 waveU；方形的角按 cornerU 的半径磨圆 */
    readonly insetU: readonly [number, number]
    readonly waveU: number
    readonly cornerU: number
    /** 窄过两倍 neckU 的缝和尖角填成岩壁 */
    readonly neckU: number
    /** 崖壁从崖脚到崖顶 cliffU 格宽、高 cliffHeight；崖顶往外的高地每格降 backSlope */
    readonly cliffU: number
    readonly cliffHeight: number
    readonly backSlope: number
  }
  readonly cone: {
    /** 火山口圆心离最近的地图边多远 */
    readonly insetU: readonly [number, number]
    readonly craterU: number
    /** 陡峭的山体：离火山口约这么远以内身体进不去，飞行物照飞；山脚的半径按方位角在 ±blockJitter 倍内起伏 */
    readonly blockU: number
    readonly blockJitter: number
    /** 口沿的高度与山脚（挡路圈边上）的高度，其间按指数往下降，山脚的缓坡铺到 radiusU 处与平地齐平 */
    readonly height: number
    readonly footHeight: number
    readonly radiusU: number
    readonly craterDepth: number
    /** 火山口里熔岩湖的液面比火山口底高多少 */
    readonly lakeDepth: number
    /** 山坡上放射状冲沟的深度 */
    readonly gullyDepth: number
  }
  /** 地势：朝地图里整体下倾的坡度，起伏的幅度与波长 */
  readonly terrain: {
    readonly tilt: number
    readonly relief: number
    readonly waveU: number
  }
  readonly eruption: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    /** 喷发前的预兆：冒烟、发红、地震 */
    readonly warnMs: number
    /** 熔岩漫过口沿的流量（格³/秒）：peakMs 内涨到 rate，之后按时间常数 waneMs 衰减，effuseMs 后停 */
    readonly rate: number
    readonly peakMs: number
    readonly waneMs: number
    readonly effuseMs: number
    /** 每次喷发熔岩集中从口沿的几股漫出，股心落在朝盆地的方向两侧 lobeSpreadDeg 内，每股宽约几度；其余方向只漫出股心的 lobeFloor 倍 */
    readonly lobes: readonly [number, number]
    readonly lobeSpreadDeg: number
    readonly lobeDeg: number
    readonly lobeFloor: number
    /** 开局前已经喷过几次，地图上留下旧熔岩 */
    readonly history: number
  }
  readonly lava: {
    readonly stepMs: number
    /** 流动：每秒流走可流部分的比例，按温度的幂变慢 */
    readonly mobility: number
    readonly mobilityPow: number
    /** 屈服强度（厚度乘坡度）：最热时与将凝固时；朝某个方向流要厚过它除以那个方向的坡度 */
    readonly yieldHot: number
    readonly yieldCold: number
    /** 冷却：温度每秒降 cooling·(1+(r/coolRadiusU)²)，r 是离火山口的距离，离得越远冷得越快 */
    readonly cooling: number
    readonly coolRadiusU: number
    /** 温度低于它就凝固成岩石 */
    readonly solidus: number
    readonly teamDps: number
    readonly enemyDps: number
    readonly tickMs: number
  }
}
/** 一列涌浪：波高（米）、周期（秒）、相对船头往哪个方向传（度，0 为顺着船头、90 为从左舷推向右舷） */
export interface Swell {
  readonly heightM: number
  readonly periodS: number
  readonly towardDeg: number
}
/** 身体脚下或金币与甲板之间的库仑摩擦系数 */
export interface Friction {
  readonly static: number
  readonly kinetic: number
}
/**
 * 船：海上航行的一艘帆船，能走的是舷墙围着的甲板，舷墙与桅杆是硬边界。甲板上的人、怪、召唤物、掉落物、炮弹都有重量，
 * 船按静水力学与刚体动力学横摇、纵摇，海浪也推着它摇；甲板倾斜后重力沿甲板的分量让东西按库仑摩擦滑、炮弹按滚动摩擦滚，赶路按恒定功率上坡慢、下坡快。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface ShipConfig {
  readonly meterPerU: number
  /** 甲板的平面形状，格：船长沿地图的长边，船头朝右（竖屏朝上） */
  readonly hull: {
    /** 甲板从船尾横板到船首柱的长、最宽处的宽 */
    readonly lengthU: number
    readonly beamU: number
    /** 船头从最宽处收到船首柱的那段占船长的比例，半宽按余弦的 bowPow 次方收拢 */
    readonly bow: number
    readonly bowPow: number
    /** 船尾从最宽处收到横板的那段占船长的比例，按指数 sternPow 的超椭圆收拢；横板的半宽占最宽处的比例，横板中间往后鼓出船宽的 transomBulge 倍 */
    readonly stern: number
    readonly sternPow: number
    readonly transom: number
    readonly transomBulge: number
    /** 舷墙的厚度；船壳外至少留多宽的海面 */
    readonly bulwarkU: number
    readonly seaU: number
    /** 窄过两倍 neckU 的尖角填掉 */
    readonly neckU: number
    /** 桅杆立在船长方向的哪里（占船长的比例，从船尾算起），半径多少格；桅杆挡路 */
    readonly masts: readonly number[]
    readonly mastU: number
  }
  /** 空船的静水力学，米：吃水、舯剖面系数（横剖面面积占宽乘吃水的比例）、重心高、型深；海水密度，千克/米³ */
  readonly hydro: {
    readonly draftM: number
    readonly midship: number
    readonly kgM: number
    readonly depthM: number
    readonly rho: number
    /** 横摇、纵摇的惯性半径占船宽、船长的比例；附加质量占惯量的比例；阻尼比 */
    readonly rollGyration: number
    readonly pitchGyration: number
    readonly rollAdded: number
    readonly pitchAdded: number
    readonly rollDamping: number
    readonly pitchDamping: number
  }
  /** 甲板上的重量，千克：身体按半径的三次方与身体的质量折算，重心离甲板 bodyHeightM 米 */
  readonly weight: {
    readonly bodyKg: number
    readonly bodyRadiusU: number
    readonly bodyHeightM: number
    readonly pickupKg: number
    readonly ballKg: number
  }
  /** 海：船速（米/秒）与几列涌浪 */
  readonly sea: {
    readonly speedMs: number
    readonly swells: readonly Swell[]
  }
  /** 摩擦：身体脚下、金币的静与动摩擦系数；炮弹的滚动摩擦系数 */
  readonly friction: {
    readonly body: Friction
    readonly coin: Friction
    readonly ballRolling: number
  }
  /** 赶路按恒定功率 P = m·v·(c − g∥)：c 是平地上的阻力（米/秒²），下坡最多快到 downhillMax 倍；每格的费力按 1 − g∥/c，最少 effortMin */
  readonly gait: {
    readonly flatResistance: number
    readonly downhillMax: number
    readonly effortMin: number
  }
  /** 甲板上散着的炮弹：几颗、半径（格）、与舷墙桅杆和彼此相撞的恢复系数 */
  readonly balls: {
    readonly count: number
    readonly radiusU: number
    readonly restitution: number
  }
}
export interface OldRiverConfig {
  readonly viewScale: number
  readonly width: number
  readonly flow: number
  /** 正逆流、正顺流赶路时费力的倍率，斜着走按夹角插值 */
  readonly upstream: number
  readonly downstream: number
  /** 拾取物漂过下游边多远消失 */
  readonly coinCullPad: number
  /** 敌人漂过下游边多远就被冲走 */
  readonly enemyCullPad: number
  readonly driftCount: number
  readonly driftSpeedMul: readonly [number, number]
  readonly waveSlow: number
  readonly waveFast: number
}
/**
 * 河流：林子与岩石围着的一片空地，一条山溪从崖上落进深潭，往下分成一大一小两股，各自从断崖边落进深谷。
 * 河道按流量定宽深、按曼宁公式定坡降，水流是浅水方程在这副河床上的稳态解；空地的形状、河的走向与出入口都由种子定。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface RiverConfig {
  readonly meterPerU: number
  /** 地形格子的边长，格；地形铺满镜头能看到的地图外一圈 */
  readonly cellU: number
  /** 空地：能走的地面连同河面的面积，格²；轮廓按方位角的低阶起伏（相对半径，从二阶起）加二维噪声的起伏（格，波长 waveU） */
  readonly clearing: {
    readonly areaU2: readonly [number, number]
    readonly lobes: readonly number[]
    readonly wobbleU: number
    readonly waveU: number
    /** 地图的边离空地最远处多远 */
    readonly padU: number
    /** 窄过两倍 neckU 的缝和尖角不能走 */
    readonly neckU: number
  }
  /** 河网：进水口在空地边上随机的方位；两个出水口在它对面 oppositeDeg 以内的一个、与旁边隔开 spreadDeg 的另一个，离进水口都至少 apartDeg */
  readonly network: {
    readonly oppositeDeg: number
    readonly spreadDeg: readonly [number, number]
    readonly apartDeg: number
    /** 分叉点在进水口到两出水口中点的哪一段 */
    readonly splitAt: readonly [number, number]
    /** 大股、小股在分叉处偏离主河道的角度 */
    readonly majorTurnDeg: readonly [number, number]
    readonly minorTurnDeg: readonly [number, number]
    /** 河道蜿蜒的幅度，格；弯道半径至少是河宽的 minBend 倍；河岸离空地边至少 edgeGapU */
    readonly meanderU: number
    readonly minBend: number
    readonly edgeGapU: number
  }
  /** 水力几何：流量（米³/秒）按 share 分给大股；水面宽 W = widthCoef·√Q、平均水深 D = depthCoef·Q^0.4（米）；坡降由曼宁糙率反算 */
  readonly flow: {
    readonly discharge: number
    readonly share: number
    readonly widthCoef: number
    readonly depthCoef: number
    readonly manning: number
    /** 横断面的形状指数：水深按 1 − |ξ|^bedShape 从深泓往两岸收 */
    readonly bedShape: number
    /** 弯顶的深潭、过渡段的浅滩相对平均的水深倍率；深泓往凹岸偏到半宽的 thalwegShift 倍 */
    readonly pool: number
    readonly riffle: number
    readonly thalwegShift: number
    /** 河岸高出水面多少米、岸坡多宽（格）；岸顶以外的滩地每格升多少米，起伏多少米 */
    readonly bankM: number
    readonly bankU: number
    readonly floodSlope: number
    readonly reliefM: number
  }
  /** 瀑布：进水口的崖高与崖面的进深、崖下深潭的深（米）与半径（相对主河道水面宽）；出水口外深谷的深，断崖外还能被冲过去的那一段多长（格） */
  readonly falls: {
    readonly cliffM: number
    readonly cliffU: number
    readonly poolM: number
    readonly poolR: number
    readonly gorgeM: number
    readonly lipU: number
  }
  /** 树：树冠半径（格）、伸进空地的树冠下有多宽能走；林子按二维噪声和岩石分地盘，林子占多少；伸进空地的林舌、空地里的树丛与孤树各几处 */
  readonly trees: {
    readonly crownU: readonly [number, number]
    readonly overhangU: number
    readonly forest: number
    readonly tongues: readonly [number, number]
    readonly groves: readonly [number, number]
    readonly lone: readonly [number, number]
  }
  /** 石头：河里与空地上各几块，半径（格），露出水面或地面多高（米） */
  readonly rocks: {
    readonly inRiver: readonly [number, number]
    readonly onLand: readonly [number, number]
    readonly radiusU: readonly [number, number]
    readonly heightM: readonly [number, number]
  }
  /**
   * 水里的身体：半径 radiusU 格、质量倍率为 1 的身体重 kg 千克、高 heightM 米，别的身体质量按半径的三次方与质量倍率、身高按半径缩放（半径不算队长倍率）；
   * 身体的密度（千克/米³）与水里的阻力系数；脚下与河床的摩擦系数：水带走人的比例 = 推力 ÷（推力 + 它 × 脚下的压力），倒下后贴着河床滑也按它
   */
  readonly body: {
    readonly kg: number
    readonly radiusU: number
    readonly heightM: number
    readonly density: number
    readonly drag: number
    readonly grip: number
    /** 站着时胯以下迎水的是两条腿：腿宽占身宽、胯高占身高的比例 */
    readonly legs: number
    readonly hip: number
    /** 站着时重心到脚掌下游边的水平距离占身高的比例：水的推力绕脚掌的力矩大过脚下的压力乘它就被推倒 */
    readonly lever: number
    /** 倒在水里时身体的厚占身宽的比例：顺着游的方向迎水的是身宽 × 厚，横着被冲的是身长 × 厚 */
    readonly chest: number
    /** 蹚水本身的减速：水深到胯时自己走的速度慢这么多（比例），水浅按比例少；倒下以后划水的推力（米/秒²） */
    readonly wade: number
    readonly swim: number
    /** 水深不到这个（米）算干地 */
    readonly wetM: number
  }
}
export interface TorusConfig {
  readonly arenaLong: number
  readonly arenaShort: number
  readonly projectileLifeMs: number
  readonly frame: number
}
export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly kind: 'bounded' | 'oldRiver' | 'void' | 'ruins' | 'daynight' | 'space' | 'ice' | 'nebula' | 'volcano' | 'ship' | 'river'
  readonly size?: { readonly w: number; readonly h: number }
  readonly stamina: GroundStamina
  readonly palette: Palette
  readonly decor: MapDecor
  readonly drift?: readonly string[]
  readonly mix: readonly EnemyMixRow[]
  readonly dayMix?: readonly EnemyMixRow[]
  readonly nightMix?: readonly EnemyMixRow[]
  readonly walls?: WallsConfig
  readonly dayNight?: DayNightConfig
  readonly ice?: IceConfig
  readonly space?: SpaceConfig
  readonly nebula?: NebulaConfig
  readonly volcano?: VolcanoConfig
  readonly ship?: ShipConfig
  readonly oldRiver?: OldRiverConfig
  readonly river?: RiverConfig
  readonly torus?: TorusConfig
  readonly finalWaveSub?: string
  readonly boss: EnemyKind
}
export type MapId = keyof typeof mapsJson

export type Hazard = 'coldWater' | 'meteor' | 'blackhole' | 'lava' | 'falls'

export interface DecorInstance {
  emoji: string
  xU: number
  yU: number
  sizeU: number
  alpha: number
  rotation: number
}
export interface MapDefaults {
  readonly width: number
  readonly height: number
  readonly cameraMargin: number
}
