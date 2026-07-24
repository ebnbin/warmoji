import Phaser from 'phaser'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import { BOSSES, ENEMY_DEFS } from '../enemies/registry'
import { PICKUPS } from '../pickups/registry'
import { WAVE } from '../run/waves'
import { submitScore } from '../run/highscore'
import { ITEMS, stackCount } from '../items/registry'
import type { ItemId } from '../items/registry'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { endRun, getRun } from '../run/state'
import type { RunState } from '../run/state'
import { browserStorage } from '../core/storage'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage, emojiText } from '../emoji/textures'
import { burstEmitter } from '../core/fx'
import { ScrollView } from './scroll'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

// 终局结算页：胜利（打满 WAVE.totalWaves 波）与失败（团灭）复用同一布局，
// 只差标题/配色/庆祝粒子。展示整局逐角色战绩（伤害/击杀/阵亡/道具）与全局汇总，
// 最高分在此提交。离开本页即丢弃 run（再来一局回队长页 / 回主菜单）。
interface ResultLayout {
  content: { w: number; h: number }
  titleY: number
  subY: number
  bestY: number
  table: { x: number; y: number; w: number; h: number }
  enemy: { x: number; y: number; w: number; h: number }
  btnY: number
}

const LANDSCAPE: ResultLayout = {
  content: { w: 1280, h: 720 },
  titleY: 64,
  subY: 122,
  bestY: 160,
  table: { x: 56, y: 190, w: 690, h: 428 },
  enemy: { x: 766, y: 190, w: 458, h: 428 },
  btnY: 668,
}

const PORTRAIT: ResultLayout = {
  content: { w: 720, h: 1280 },
  titleY: 96,
  subY: 158,
  bestY: 198,
  table: { x: 24, y: 236, w: 672, h: 496 },
  enemy: { x: 24, y: 748, w: 672, h: 392 },
  btnY: 1206,
}

export class ResultScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private win = false
  /** 最高分只在首次进入时提交一次（视口重启不重复计） */
  private submitted = false
  private best = { newBest: false, bestWave: 0, bestKills: 0 }
  private againRect = { x: 0, y: 0, w: 0, h: 0 }
  private menuRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('result')
  }

  init(data?: { win?: boolean }): void {
    if (data && 'win' in data) this.win = !!data.win
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.run = getRun()

    if (!this.submitted) {
      this.submitted = true
      // 胜利按打满的总波数记，失败按倒下的当前波记
      const wave = this.win ? WAVE.totalWaves : this.run.wave
      const r = submitScore(browserStorage(), wave, this.run.kills)
      this.best = { newBest: r.newBest, bestWave: r.score.bestWave, bestKills: r.score.bestKills }
      playSfx(this.win ? 'levelup' : 'over')
    }

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = h > w ? PORTRAIT : LANDSCAPE
    const origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const oy = origin.y
    const cx = w / 2

    // 标题（胜利带弹跳与彩带粒子）
    const title = emojiText(
      this,
      cx,
      oy + L.titleY,
      this.win ? '{1f3c6} 通关胜利！' : '{1f480} 全军覆没',
      {
        fontFamily: UI_FONT,
        fontSize: FONT.display,
        fontStyle: 'bold',
        color: this.win ? '#ffdc5d' : '#ef9a9a',
        resolution: res,
      },
      { origin: 0.5 },
    )
    title.setScale(0.6)
    this.tweens.add({ targets: title, scale: 1, duration: 380, ease: 'Back.easeOut' })
    if (this.win && !preserved) {
      const confetti = burstEmitter(this, [0xffdc5d, 0x81d4fa, 0xef9a9a, 0xa5d6a7], 420, 900)
      confetti.setDepth(5)
      this.time.delayedCall(120, () => confetti.explode(26, cx - 180, oy + L.titleY))
      this.time.delayedCall(320, () => confetti.explode(26, cx + 180, oy + L.titleY))
    }

    // 副标题：战报一行
    const captain = CAPTAINS[this.run.captainId]
    const minutes = Math.floor(this.run.combatMs / 60000)
    const seconds = Math.round((this.run.combatMs % 60000) / 1000)
    const waveText = this.win
      ? `${WAVE.totalWaves} 波全部打完`
      : `止步第 ${this.run.wave} 波`
    emojiText(
      this,
      cx,
      oy + L.subY,
      `{${captain.emoji}} ${captain.name} · ${waveText} · 击杀 ${this.run.kills} · {${PICKUPS.coin.emoji}}${this.run.coins} · 用时 ${minutes}:${String(seconds).padStart(2, '0')}`,
      { fontFamily: UI_FONT, fontSize: FONT.head, color: '#e8e8f0', resolution: res },
      { origin: 0.5 },
    )
    this.add
      .text(
        cx,
        oy + L.bestY,
        this.best.newBest
          ? '新纪录！'
          : `最佳：第 ${this.best.bestWave} 波 · 击杀 ${this.best.bestKills}`,
        { fontFamily: UI_FONT, fontSize: FONT.strong, color: '#ffdc5d', resolution: res },
      )
      .setOrigin(0.5)

    this.renderTable(origin.x + L.table.x, oy + L.table.y, L.table.w, L.table.h, res)
    this.renderEnemyPanel(origin.x + L.enemy.x, oy + L.enemy.y, L.enemy.w, L.enemy.h, res)

    // 按钮：再来一局（主）/ 回主菜单（副）；防误触 500ms 后可交互
    const btnW = 300
    const btnH = 68
    const gap = 26
    this.againRect = { x: cx - btnW - gap / 2, y: oy + L.btnY - btnH / 2, w: btnW, h: btnH }
    this.menuRect = { x: cx + gap / 2, y: oy + L.btnY - btnH / 2, w: btnW, h: btnH }
    const again = (): void => {
      endRun()
      this.scene.start('captain')
    }
    const menu = (): void => {
      endRun()
      this.scene.start('menu')
    }
    this.drawButton(this.againRect, '再来一局', true, again, res)
    this.drawButton(this.menuRect, '回主菜单', false, menu, res)
    this.time.delayedCall(500, () => {
      this.input.keyboard?.once('keydown-ENTER', again)
      this.input.keyboard?.once('keydown-SPACE', again)
    })

    this.reportResult()
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 逐角色战绩表：emoji/名字等级 + 伤害/击杀/阵亡 + 随身道具 */
  private renderTable(x: number, y: number, w: number, h: number, res: number): void {
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(x, y, w, h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(x, y, w, h, 14)

    const n = this.run.roster.length
    const headerH = 46
    // 固定行高 + 可滚动：队伍编制变大（现已达 8）也逐行清晰，不再被 area/count 压成一坨
    const rowH = 64
    const label = (tx: number, ty: number, text: string, color = '#9d9dad'): void => {
      this.add
        .text(tx, ty, text, { fontFamily: UI_FONT, fontSize: FONT.small, color, resolution: res })
        .setOrigin(0.5)
    }
    // 列布局（相对表宽的比例，横竖屏通吃）；表头用绝对坐标固定，数据行用内容内局部坐标
    label(x + w * 0.43, y + headerH / 2 + 4, '伤害')
    label(x + w * 0.55, y + headerH / 2 + 4, '承伤')
    label(x + w * 0.65, y + headerH / 2 + 4, '击杀')
    label(x + w * 0.75, y + headerH / 2 + 4, '阵亡')
    label(x + w * 0.88, y + headerH / 2 + 4, '道具')

    const colDamage = w * 0.43
    const colTaken = w * 0.55
    const colKills = w * 0.65
    const colDeaths = w * 0.75
    const colItems = w * 0.88
    const rows = new ScrollView(this, { x, y: y + headerH, w, h: h - headerH - 10 })
    this.run.roster.forEach((id, slot) => {
      const cy = rowH * slot + rowH / 2
      const def = CHARACTERS[id]
      rows.add(emojiImage(this, 46, cy, def.emoji, Math.min(58, rowH - 8), 'player'))
      rows.add(
        this.add
          .text(82, cy, def.name, {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            fontStyle: 'bold',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      const cell = (tx: number, text: string, color = '#e4e4ec'): void => {
        rows.add(
          this.add
            .text(tx, cy, text, { fontFamily: UI_FONT, fontSize: FONT.body, color, resolution: res })
            .setOrigin(0.5),
        )
      }
      const fmt = (v: number): string => (v >= 10000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
      cell(colDamage, fmt(this.run.stats.damage[slot] ?? 0))
      const taken = this.run.stats.damageTaken[slot] ?? 0
      cell(colTaken, taken > 0 ? fmt(taken) : '—', taken > 0 ? '#ffab91' : '#6f6f7d')
      cell(colKills, `${this.run.stats.kills[slot] ?? 0}`)
      const deaths = this.run.stats.deaths[slot] ?? 0
      cell(colDeaths, deaths > 0 ? `${deaths}` : '—', deaths > 0 ? '#ef9a9a' : '#6f6f7d')
      // 随身道具：去重带层数，最多 2 组图标 + 溢出计数
      const owned = this.run.memberItems[slot] ?? []
      const unique = [...new Set(owned)] as ItemId[]
      const shown = unique.slice(0, 2)
      shown.forEach((item, i) => {
        const ix = colItems - ((shown.length - 1) / 2 - i) * 38
        rows.add(emojiImage(this, ix, cy, ITEMS[item].emoji, 35))
        const stacks = stackCount(owned, item)
        if (stacks > 1) {
          rows.add(
            this.add
              .text(ix + 12, cy + 10, `${stacks}`, {
                fontFamily: UI_FONT,
                fontSize: FONT.caption,
                fontStyle: 'bold',
                color: '#ffdc5d',
                resolution: res,
              })
              .setOrigin(0.5),
          )
        }
      })
      if (unique.length > 2) {
        rows.add(
          this.add
            .text(colItems + 52, cy, `+${unique.length - 2}`, {
              fontFamily: UI_FONT,
              fontSize: FONT.caption,
              color: '#9d9dad',
              resolution: res,
            })
            .setOrigin(0.5),
        )
      }
      if (unique.length === 0) cell(colItems, '—', '#6f6f7d')
    })
    rows.setContentHeight(rowH * n)
  }

  /** 敌情面板：按敌人类型的我方击杀数与其对我方造成的伤害（按击杀降序） */
  private renderEnemyPanel(x: number, y: number, w: number, h: number, res: number): void {
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(x, y, w, h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(x, y, w, h, 14)

    const st = this.run.stats
    emojiText(
      this,
      x + 20,
      y + 24,
      '{2694} 敌情',
      {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      },
      { origin: 0 },
    )
    if (st.eliteKills > 0) {
      emojiText(
        this,
        x + w - 20,
        y + 24,
        `{2b50} 精英 ×${st.eliteKills}`,
        {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#ffdc5d',
          resolution: res,
        },
        { origin: 1 },
      )
    }

    const emojiByName = new Map<string, string>([
      ...ENEMY_DEFS.map((e) => [e.name, e.emoji] as const),
      ...BOSSES.map((e) => [e.name, e.emoji] as const),
    ])
    const names = [...new Set([...Object.keys(st.enemyKills), ...Object.keys(st.enemyDamage)])]
      .sort((a, b) => (st.enemyKills[b] ?? 0) - (st.enemyKills[a] ?? 0))
    if (names.length === 0) {
      this.add
        .text(x + w / 2, y + h / 2, '—', {
          fontFamily: UI_FONT,
          fontSize: FONT.head,
          color: '#6f6f7d',
          resolution: res,
        })
        .setOrigin(0.5)
      return
    }

    const headerH = 48
    const colKills = x + w * 0.56
    const colDmg = x + w * 0.82
    const label = (tx: number, text: string): void => {
      this.add
        .text(tx, y + headerH + 2, text, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: '#9d9dad',
          resolution: res,
        })
        .setOrigin(0.5)
    }
    label(colKills, '击杀')
    label(colDmg, '对我方伤害')
    const top = y + headerH + 22
    // 固定行高 + 可滚动：敌人种类只增不减，行多了滚动查看，不再压成重叠的细行
    const rowH = 42
    const fmt = (v: number): string => (v >= 10000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
    const bossNames = new Set(BOSSES.map((e) => e.name))
    const colKillsL = colKills - x
    const colDmgL = colDmg - x
    const rows = new ScrollView(this, { x, y: top, w, h: y + h - top - 12 })
    names.forEach((name, i) => {
      const cy = rowH * i + rowH / 2
      const isBoss = bossNames.has(name)
      const emoji = emojiByName.get(name)
      if (emoji) rows.add(emojiImage(this, 34, cy, emoji, Math.min(40, rowH - 5), isBoss ? 'elite' : 'enemy'))
      rows.add(
        this.add
          .text(58, cy, name, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: isBoss ? '#ffdc5d' : '#e4e4ec',
            resolution: res,
          })
          .setOrigin(0, 0.5),
      )
      const cell = (tx: number, text: string, color = '#e4e4ec'): void => {
        rows.add(
          this.add
            .text(tx, cy, text, { fontFamily: UI_FONT, fontSize: FONT.body, color, resolution: res })
            .setOrigin(0.5),
        )
      }
      cell(colKillsL, `${st.enemyKills[name] ?? 0}`)
      const dmg = st.enemyDamage[name] ?? 0
      cell(colDmgL, dmg > 0 ? fmt(dmg) : '—', dmg > 0 ? '#ffab91' : '#6f6f7d')
    })
    rows.setContentHeight(rowH * names.length)
  }

  private drawButton(
    rect: { x: number; y: number; w: number; h: number },
    text: string,
    filled: boolean,
    onTap: () => void,
    res: number,
  ): void {
    const g = this.add.graphics()
    if (filled) {
      g.fillStyle(0xffdc5d, 1)
      g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2)
    } else {
      g.fillStyle(0xffffff, 0.12)
      g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2)
      g.lineStyle(1, 0xffffff, 0.35)
      g.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2)
    }
    this.add
      .text(rect.x + rect.w / 2, rect.y + rect.h / 2, text, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: filled ? '#25262e' : '#f0f0f5',
        resolution: res,
      })
      .setOrigin(0.5)
    const zone = this.add.zone(rect.x, rect.y, rect.w, rect.h).setOrigin(0)
    // 防死亡瞬间误触：0.5 秒后才接受点击
    this.time.delayedCall(500, () => {
      if (!zone.active) return
      zone.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        playSfx('click')
        onTap()
      })
    })
  }

  private reportResult(): void {
    reportDebug({
      scene: 'result',
      elapsed: this.run.combatMs / 1000,
      hp: 0,
      alive: 0,
      kills: this.run.kills,
      level: this.run.xp.level,
      wave: this.run.wave,
      coins: this.run.coins,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      result: {
        win: this.win,
        rows: this.run.roster.length,
        newBest: this.best.newBest,
        again: {
          x: this.againRect.x + this.againRect.w / 2,
          y: this.againRect.y + this.againRect.h / 2,
          w: this.againRect.w,
          h: this.againRect.h,
        },
        menu: {
          x: this.menuRect.x + this.menuRect.w / 2,
          y: this.menuRect.y + this.menuRect.h / 2,
          w: this.menuRect.w,
          h: this.menuRect.h,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart({ win: this.win })
  }
}
