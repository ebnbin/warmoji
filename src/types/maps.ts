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
/** 旧星云：圆心在原点的空心厚球壳，空腔里有一个黑洞，引力按普卢默软化的万有引力 g = GM·r/(r²+ε²)^{3/2} 作用于一切 */
export interface NebulaOldConfig {
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
 * 星云：深空里一团空心的星云，活动的平面是它的赤道面，空腔里有一个黑洞。人、怪、掉落物、子弹与流星都受黑洞与星云壳层的万有引力：
 * 身体在星云气体里按终速被拖着漂，子弹、冲刺与流星按弹道飞；中心进了视界就被吞掉，吞下的质量让黑洞长大。这里没有太阳，光来自吸积盘与流星
 */
export interface NebulaConfig {
  /**
   * 空心厚球壳：空腔半径、外缘半径与引力常数乘壳层质量（格³/秒²）。被推开的气体堆在外面，密度从内壁的 0 按进壳层深度占壳厚比例的 rise 次方往外缘涨。
   * 引力按牛顿壳层定理只算内侧的质量：空腔里为零，刚进壳层很弱、越往里越陡，外缘以外如同全部质量在球心。
   * tau 是整层壳沿半径的光深：黑洞的光照进去，光深到 1 的那一层是被照亮的电离前沿，也就是看得见的内壁
   */
  readonly shell: {
    readonly innerU: number
    readonly outerU: number
    readonly gm: number
    readonly rise: number
    readonly tau: number
  }
  /** 构建期校验的余量：任何身体以 speedMul 倍的最快速度往外走，最深只走进壳层 depthU 格；停下后再往外瞬移 leapU 格，引力仍把它拉回 */
  readonly contain: {
    readonly speedMul: number
    readonly depthU: number
    readonly leapU: number
  }
  readonly hole: {
    /** 引力常数乘黑洞的质量，格³/秒²：开局是下限，吞得再多也不超过 maxGm */
    readonly gm: number
    readonly maxGm: number
    /** 这片星域里的光速，格/秒：定出视界 r_s = 2GM/c²、透镜的偏折与光传过来要多久 */
    readonly lightU: number
    /** 黑洞离星云中心多远，方向随机；队伍从中心另一侧离中心 startU 格处出发 */
    readonly fromCenterU: readonly [number, number]
    readonly startU: number
  }
  /**
   * 吞下的东西折成多少 GM：身体按 bodyGm·质量·(半径/bodyRadiusU)³，掉落物、弹体各算一份。
   * 它们是被拖着几乎径直掉进去的，角动量远不够绕成盘，只有 lightEta 的静能化成光，其余全并进黑洞
   */
  readonly swallow: {
    readonly bodyGm: number
    readonly bodyRadiusU: number
    readonly pickupGm: number
    readonly shotGm: number
    readonly lightEta: number
  }
  /**
   * 吸积发光：平时吸周围带着湍流角动量的稀薄气体，在盘里转到最内稳定圆轨道才掉进去，放出质量的 1/16 乘 c²；邦迪吸积率随质量的平方涨，开局每秒吸 bondiGm。
   * 吞下东西放出的光按 riseMs 亮起、按黏滞时标 viscousMs 暗下去
   */
  readonly accretion: {
    readonly bondiGm: number
    readonly riseMs: number
    readonly viscousMs: number
  }
  /** 吸积盘从最内稳定圆轨道铺到 outerRs 个 r_s；innerK 是开局平时盘上最热那一圈（约 4 r_s）未计引力红移的色温，开尔文，随光度的四分之一次方涨 */
  readonly disk: {
    readonly outerRs: number
    readonly innerK: number
  }
  /**
   * 流星：壳层的湍流甩出一个团块，以 speedU 上下 speedJitter 倍冲进空腔，之后只受引力；它被吸积盘照着，像彗星一样拖着背向黑洞的尾巴。
   * 预警时团块先在内壁上亮起来；冲进对面的壳层就被冲压撕碎，掉进视界就被吞掉。伤害按动能随速度的平方变
   */
  readonly meteor: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    readonly speedU: number
    readonly speedJitter: number
    /** 撞上身体的半径，格 */
    readonly radiusU: number
    /** 冲进壳层多深才被撕碎，格：扫过的壳层气体和团块自己一样重的地方；还没到这么深就被引力拉回来的，落回空腔接着飞 */
    readonly shatterU: number
    /** 瞄准点在队长两侧最多偏多远 */
    readonly offsetU: number
    /** 以 speedU 撞上时的伤害 */
    readonly damage: number
    readonly gm: number
    readonly maxFlightMs: number
  }
  /** 刷怪点离黑洞的余量：比这张图最慢的敌人走不出来的半径再远这么多格 */
  readonly spawnClearU: number
  /** 画面是透视相机拍的：镜头在活动的平面上方多高，格；平面以下越深的东西在画面上越小、跟着镜头移得越慢 */
  readonly cameraU: number
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
/**
 * 浮冰：南极海上一块近似方形的浮冰，形状按断裂、碰撞的成因每局随机生成；冰面没有边，滑出冰缘就掉进冰点附近的海水里。
 * 冰面上的一切按库仑摩擦走、滑、停，积雪、老冰、新冰的摩擦各不相同；海风一阵阵吹，风压超过脚下的摩擦就被吹着滑。
 * 物理量按米、千克、秒算，一格 meterPerU 米
 */
export interface FloeConfig {
  readonly meterPerU: number
  /** 地图是边长 frameU 的方形，浮冰居中；冰面的距离场、积雪与新冰的格子边长 cellU */
  readonly frameU: number
  readonly cellU: number
  /** 平面形状，格 */
  readonly shape: {
    /** 冰面的面积，格² */
    readonly areaU: number
    /** 四条主断裂边：整块最多转 turnDeg 度，每条边再各自最多偏 sideDeg 度、离中心的距离最多差 sideU 格 */
    readonly turnDeg: number
    readonly sideDeg: number
    readonly sideU: number
    /** 每个角被一条斜裂缝切掉的概率与切进去的深度 */
    readonly cutChance: number
    readonly cutU: readonly [number, number]
    /** 长边中途拐折的幅度：裂缝不是笔直的 */
    readonly bendU: number
    /** 边上掰掉一块留下的豁口：几个、多深、口多宽 */
    readonly bites: readonly [number, number]
    readonly biteDepthU: readonly [number, number]
    readonly biteWidthU: readonly [number, number]
    /** 一条横贯冰面的裂缝已重新冻住，成了一道新冰；它从冰缘裂开、还没冻上的那一段是伸进冰里的水道：概率、水道的长与口宽、新冰的宽 */
    readonly leadChance: number
    readonly leadU: readonly [number, number]
    readonly leadWidthU: readonly [number, number]
    readonly seamWidthU: readonly [number, number]
    /** 断口的锯齿幅度；凸角被别的浮冰撞圆的半径 */
    readonly jagU: number
    readonly roundU: readonly [number, number]
  }
  /** 冰：老冰与新冰的厚度、冰与海水的密度，按阿基米德定出冰面高出海面多少 */
  readonly ice: {
    readonly thicknessM: number
    readonly youngM: number
    readonly density: number
    readonly seaDensity: number
  }
  /** 积雪：最深多少米、盖住多大比例、雪的密度；雪堆沿风向拉长，尺度 waveU；冰缘这么宽一圈被浪花打湿、留不住雪 */
  readonly snow: {
    readonly maxM: number
    readonly cover: number
    readonly density: number
    readonly waveU: number
    readonly bareU: number
  }
  /** 脚下与冰面之间的静、动摩擦系数：积雪、老冰、新冰；金币与碎片在冰上的摩擦 */
  readonly friction: {
    readonly snow: { readonly static: number; readonly kinetic: number }
    readonly ice: { readonly static: number; readonly kinetic: number }
    readonly young: { readonly static: number; readonly kinetic: number }
    readonly loose: number
  }
  /** 身体：脚下支撑圈占半径的比例；游泳的速度占走路的比例；半径 refRadiusU、质量 1 的身体在水里的阻力长度 m/c（格）与冻僵的时长（秒） */
  readonly body: {
    readonly footFrac: number
    readonly swimRatio: number
    readonly refRadiusU: number
    readonly dragU: number
    readonly freezeSec: number
    /** 爬上冰面：重心要越过冰缘这么多个身体半径 */
    readonly climbFrac: number
  }
  /** 风：平时的风速与阵风的峰值（米/秒）；阵风先起、再稳、后落，隔一阵来一次；风向每次偏一点 */
  readonly wind: {
    readonly meanMs: number
    readonly gustMs: number
    readonly firstMs: number
    readonly intervalMs: number
    readonly jitterMs: number
    readonly riseMs: number
    readonly holdMs: number
    readonly fallMs: number
    readonly veerDeg: number
    /** 空气密度；半径 refRadiusU、质量 1 的身体的 Cd·A/m（米²/千克）：越小的身体越容易被吹动 */
    readonly airDensity: number
    readonly dragArea: number
    /** 浮冰顺风漂得比海水快，漂速占平时风速的比例，南半球漂向偏在风向左边 driftDeg 度：浮冰上看，海水往反方向流 */
    readonly driftRatio: number
    readonly driftDeg: number
    /** 上风开阔水面的长度（风区），米：海面的风浪按它长成 */
    readonly fetchM: number
  }
  /** 水里的体力：冰面按地图的体力算 */
  readonly waterExertion: number
  readonly waterRegen: number
  readonly coldTickMs: number
}
export interface RiverConfig {
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
  readonly kind: 'bounded' | 'river' | 'void' | 'ruins' | 'daynight' | 'space' | 'ice' | 'nebulaOld' | 'nebula' | 'volcano' | 'ship' | 'floe'
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
  readonly nebulaOld?: NebulaOldConfig
  readonly nebula?: NebulaConfig
  readonly volcano?: VolcanoConfig
  readonly ship?: ShipConfig
  readonly floe?: FloeConfig
  readonly river?: RiverConfig
  readonly torus?: TorusConfig
  readonly finalWaveSub?: string
  readonly boss: EnemyKind
}
export type MapId = keyof typeof mapsJson

export type Hazard = 'coldWater' | 'meteor' | 'blackhole' | 'lava'

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
