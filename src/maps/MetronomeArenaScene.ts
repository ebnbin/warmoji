import type Phaser from 'phaser'
import { ArenaScene } from './ArenaScene'
import { METRO, timeScaleFor } from './metronome'
import { viewport } from '../core/apply'

// 秒针竞技场（kind='metronome'）：沿用有界世界规则（墙/相机/钳制/游荡全继承
// ArenaScene），只叠加唯一的新机制——世界时间流速随队伍移动量放缩。
// 静止时降到 METRO.floor（近乎时停：敌人、双方攻速、弹速、刷怪、波次计时全放慢，
// 但玩家走位与呼吸恒实时），移动时回到常速。玩法即「冻结读盘 → 短促精确突进 →
// 再冻结」：移动是推进世界的货币，静则安全但停滞。
export class MetronomeArenaScene extends ArenaScene {
  /** 平滑后的移动量 0..1（低通避免时标逐帧抖动） */
  private chrono = 0
  /** 时停冷雾遮罩（屏幕固定，越静越浓） */
  private chill?: Phaser.GameObjects.Rectangle

  constructor() {
    super('arenaMetronome')
    this.worldTimeScaled = true
  }

  protected resetWorldFields(): void {
    super.resetWorldFields()
    this.chrono = 0
    this.chill = undefined
  }

  protected createWorld(): void {
    super.createWorld()
    // 冷雾遮罩：与荒漠终波红雾同款屏幕固定大矩形，alpha 由 chrono 逐帧驱动
    this.chill = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, METRO.chillColor, 0)
      .setScrollFactor(0)
      .setDepth(90)
  }

  /** 世界时间流速 = 平滑移动量映射（floor..1）；update 开头读取，驱动全世界侧时长 */
  worldTimeScale(): number {
    return timeScaleFor(this.chrono)
  }

  protected updateWorld(delta: number): void {
    // 低通平滑（实时 delta）：moveInputRaw 由本帧 moveTeam 写入
    const rate = Math.min(1, delta / METRO.easeMs)
    this.chrono += (this.moveInputRaw - this.chrono) * rate
    // 越静越冷：世界被「按住」时冷雾最浓，全速移动时透明
    this.chill?.setFillStyle(METRO.chillColor, (1 - this.chrono) * METRO.chillMaxAlpha)
  }
}
