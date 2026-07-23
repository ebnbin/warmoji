import Phaser from 'phaser'
import { UNIT } from '../core/units'
import { viewport } from '../core/apply'
import { MAPS } from './registry'
import { ArenaScene } from './ArenaScene'
import { enemyMixAt } from '../enemies/registry'
import type { EnemyMixEntry } from '../enemies/registry'
import {
  DAYNIGHT,
  fogAlphaAt,
  fogRadiusAt,
  hourAt,
  isDayAt,
  visionGridsAt,
} from './daynight'

// 迷雾覆盖层：以队伍为心的圆内清明、圈外昏暗（几何遮罩反相实现），世界坐标随相机缩放
const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
// 暗幕铺满可视区即可（正午视野约 30 格≈1920px，远小于此），一律世界坐标
const FOG_SPAN = 9000

// 晨昏原野（kind='daynight'）：复用整套有界世界规则（30×30 盒子边界/相机/落点/游荡逃跑），
// 叠加昼夜循环：
// · 主时钟 = 跨波累计战斗秒（combatMs+elapsed），48 秒一整天；相机随时刻余弦缩放
//   （正午 30 格拉最远、午夜 10 格拉最近、黄昏黎明 20 格标准）
// · 夜幕：夜里额外罩一层以队伍为心的迷雾圈，随夜深收紧、淡入
// · 出怪：白天/黑夜两批不同的怪，白天更密、夜晚更疏（相位切换即改写出怪表与刷怪间隔）
export class DayNightArenaScene extends ArenaScene {
  private fogRect?: Phaser.GameObjects.Rectangle
  private fogMaskShape?: Phaser.GameObjects.Graphics
  private lastDay = true

  constructor() {
    super('arenaDayNight')
  }

  protected resetWorldFields(): void {
    this.fogRect = undefined
    this.fogMaskShape = undefined
    this.lastDay = true
  }

  protected createWorld(): void {
    super.createWorld()
    // 夜雾层：暗矩形 + 反相几何遮罩（圈内被挖空显清明，圈外留暗幕）。
    // 位置/半径每帧在 updateWorld 里按队伍中心与时刻改写；此处仅建对象（center 尚未就绪）
    this.fogRect = this.add
      .rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0)
      .setDepth(FOG_DEPTH)
      .setVisible(false)
    this.fogMaskShape = this.make.graphics()
    const mask = this.fogMaskShape.createGeometryMask()
    mask.invertAlpha = true
    this.fogRect.setMask(mask)
    // 相位基线：据开场时刻定，供 updateWorld 检测昼夜翻转
    this.lastDay = isDayAt(hourAt(this.run.combatMs / 1000))
  }

  private clockHour(): number {
    return hourAt((this.run.combatMs + this.elapsedMs) / 1000)
  }

  /** 出怪表按相位取白天/黑夜两批之一（缺相位数据兜底走并集 mix） */
  protected buildEnemyMix(): EnemyMixEntry[] {
    const m = MAPS[this.run.mapId]
    const rows = (isDayAt(this.clockHour()) ? m.dayMix : m.nightMix) ?? m.mix
    return enemyMixAt(rows, this.testMode ? 10 : this.run.wave)
  }

  /** 白天更密、夜晚更疏（夜里视野小+迷雾遮，稀疏也不轻松） */
  protected spawnIntervalScale(): number {
    return isDayAt(this.clockHour()) ? DAYNIGHT.daySpawnScale : DAYNIGHT.nightSpawnScale
  }

  protected updateWorld(_delta: number): void {
    void _delta
    const hour = this.clockHour()
    // 相机随时刻平滑缩放：视野 V 格 → zoom = 标准 ×(20/V)
    const zoom = (viewport.renderScale * DAYNIGHT.visionMid) / visionGridsAt(hour)
    this.cameras.main.setZoom(zoom)
    this.updateFog(hour)
    // 昼夜翻转：改写出怪表（白天/黑夜两批），波内也能实时换批
    const day = isDayAt(hour)
    if (day !== this.lastDay) {
      this.lastDay = day
      this.enemyMix = this.buildEnemyMix()
    }
  }

  private updateFog(hour: number): void {
    const rect = this.fogRect
    const shape = this.fogMaskShape
    if (!rect || !shape) return
    const alpha = fogAlphaAt(hour)
    if (alpha <= 0.001) {
      rect.setVisible(false)
      return
    }
    const r = fogRadiusAt(hour) * UNIT
    shape.clear()
    shape.fillStyle(0xffffff)
    shape.fillCircle(this.center.x, this.center.y, r)
    rect.setPosition(this.center.x, this.center.y).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }

  protected finalWaveWarningSub(): string {
    return '击败它，或撑过头目波——注意昼夜轮替，夜幕里它更难缠！'
  }
}
