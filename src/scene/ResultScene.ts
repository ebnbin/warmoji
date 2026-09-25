import Phaser from 'phaser'
import { CAPTAINS } from '../data/captains'
import { CHARACTERS } from '../data/characters'
import { BOSSES, ENEMY_DEFS } from '../data/enemies'
import { PICKUPS } from '../data/pickups'
import { WAVE } from '../data/waves'
import { submitScore } from '../save/highscore'
import { ITEMS } from '../data/items'
import type { ItemId } from '../types/items'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { endRun, getRun } from '../run/state'
import type { RunState } from '../run/state'
import { browserStorage } from '../util/storage'
import { applyBackground } from '../util/background'
import { emojiImage } from '../emoji/hold'
import { emojiText } from '../ui/emojiText'
import { burstEmitter } from '../util/fx'
import { ScrollView } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { stackCount } from '../run/draft'

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
  /** 视口重启不重复提交 */
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

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private renderTable(x: number, y: number, w: number, h: number, res: number): void {
    const panel = this.add.graphics()
    roundRect(panel, x, y, w, h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })

    const n = this.run.roster.length
    const headerH = 46
    const rowH = 64
    const label = (tx: number, ty: number, text: string, color = '#9d9dad'): void => {
      this.add
        .text(tx, ty, text, { fontFamily: UI_FONT, fontSize: FONT.small, color, resolution: res })
        .setOrigin(0.5)
    }
    // 表头用绝对坐标，数据行用滚动内容局部坐标
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

  private renderEnemyPanel(x: number, y: number, w: number, h: number, res: number): void {
    const panel = this.add.graphics()
    roundRect(panel, x, y, w, h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })

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
      roundRect(g, rect.x, rect.y, rect.w, rect.h, rect.h / 2, { fill: 0xffdc5d })
    } else {
      roundRect(g, rect.x, rect.y, rect.w, rect.h, rect.h / 2, { fill: 0xffffff, fillAlpha: 0.12, stroke: 0xffffff, strokeAlpha: 0.35 })
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
    // 防死亡瞬间误触
    this.time.delayedCall(500, () => {
      if (!zone.active) return
      zone.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        playSfx('click')
        onTap()
      })
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart({ win: this.win })
  }
}
