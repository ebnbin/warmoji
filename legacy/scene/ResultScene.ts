import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import { ENEMIES } from '../data/enemies'
import { HAZARD_NAMES } from '../data/maps'
import { keysOf } from '../util/record'
import { PICKUPS } from '../data/pickups'
import { fightCount } from '../data/runs'
import { heatOf } from '../data/mutators'
import { reachLab, submitLab } from '../save/labs'
import { endRun, getRun, restartRun, runDef, skipFilled } from '../run/state'
import { starMet } from '../run/stars'
import { teamLeveled } from '../run/members'
import { fightsDone } from '../run/flow'
import { goStep } from './teamPage'
import { starText } from './runLines'
import type { RunState } from '../run/state'
import { browserStorage } from '../util/storage'
import { burstEmitter } from '../ui/fx'
import { playSfx } from '../audio/sfx'
import { beginPage, Button, Label, pageFrame, RichLabel, Table, TONE } from '../ui'
import type { PageFrame, Rect, TableCell, TableRow } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { formatBig } from '../util/format'
import { SceneKey } from './keys'

const NONE: TableCell = { text: '—', color: 'faint' }

export class ResultScene extends Phaser.Scene {
  private preserveOnRestart = false
  private run!: RunState
  private win = false
  /** 输在哪；赢了没有 */
  private reason: string | null = null
  private submitted = false
  /** 赢下带星级的一关：每条条件做到没有、几颗星、热度、破没破纪录 */
  private lab: { met: boolean[]; stars: number; heat: number; newBest: boolean; trial: boolean } | null = null

  constructor() {
    super(SceneKey.Result)
  }

  init(data?: { win?: boolean; reason?: string }): void {
    if (data && 'win' in data) {
      this.win = !!data.win
      this.reason = data.reason ?? null
    }
    if (!this.preserveOnRestart) {
      this.submitted = false
      this.lab = null
    }
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.run = getRun()
    const def = runDef(this.run)
    const fights = fightCount(def)
    const reached = this.win ? fights : fightsDone(this.run) + 1

    if (!this.submitted) {
      this.submitted = true
      const id = this.run.runId
      if (def.stars && this.win) {
        const met = def.stars.map((s) => starMet(this.run, s))
        const stars = 1 + met.filter(Boolean).length
        const heat = heatOf(this.run.mutators)
        const r = id === undefined ? undefined : submitLab(browserStorage(), id, stars, heat, fights)
        this.lab = { met, stars, heat, newBest: r !== undefined && (r.newStars || r.newHeat), trial: id === undefined }
      } else if (def.stars && id !== undefined) {
        reachLab(browserStorage(), id, reached - 1)
      }
      playSfx(this.win ? 'levelup' : 'over')
    }

    const f = pageFrame({ footer: true })
    const { content } = f
    const cx = f.centerX
    const titleY = content.y + (f.portrait ? 96 : 64)
    const verdict = this.win ? '{1f3c6} 挑战成功！' : '{1f480} 挑战失败'
    const title = new RichLabel(this, cx, titleY, verdict, {
      kind: 'display',
      color: this.win ? 'accent' : 'bad',
      outline: true,
      originX: 0.5,
      maxWidth: content.w - 48,
    })
    const fullScale = title.scale
    title.setScale(fullScale * 0.6)
    this.tweens.add({ targets: title, scale: fullScale, duration: 380, ease: 'Back.easeOut' })
    if (this.win && !preserved) {
      const confetti = burstEmitter(this, [TONE.accent.face, TONE.info.face, TONE.bad.face, TONE.good.face], 420, 900)
      confetti.setDepth(5)
      this.time.delayedCall(120, () => confetti.explode(26, cx - 180, titleY))
      this.time.delayedCall(320, () => confetti.explode(26, cx + 180, titleY))
    }

    const fought = this.run.combatMs
    const minutes = Math.floor(fought / 60000)
    const seconds = Math.round((fought % 60000) / 1000)
    const waveText = fights > 1 ? (this.win ? `${fights} 场全部打完` : `止步第 ${reached} 场`) : def.name
    new RichLabel(
      this,
      cx,
      titleY + 62,
      `${this.run.roster.map((id) => `{${CHARACTERS[id].emoji}}`).join('')} · ${waveText}${teamLeveled(this.run) ? ` · 全队 Lv ${this.run.xp.level}` : ''} · 击杀 ${this.run.kills} · {${PICKUPS.coin.emoji}}${this.run.coins}${this.run.items.length > 0 ? ` · 队伍道具 ${this.run.items.length} 件` : ''} · 用时 ${minutes}:${String(seconds).padStart(2, '0')}`,
      { kind: 'heading', bold: false, color: 'soft', originX: 0.5, maxWidth: content.w - 48 },
    )
    const statusY = titleY + (f.portrait ? 102 : 100)
    const lab = this.lab
    if (lab && def.stars) {
      const missed = def.stars.filter((_, i) => !lab.met[i]).map(starText)
      new RichLabel(
        this,
        cx,
        statusY,
        `${'{2b50}'.repeat(lab.stars)} ${lab.stars}/${1 + def.stars.length} 星${missed.length > 0 ? `（没做到：${missed.join('、')}）` : ''}${lab.heat > 0 ? ` · 热度 ${lab.heat}` : ''}${lab.newBest ? ' · 新纪录！' : ''}${lab.trial ? ' · 试玩不记录' : ''}`,
        { kind: 'heading', bold: false, color: 'accent', originX: 0.5, maxWidth: content.w - 48 },
      )
    } else if (this.reason !== null) {
      new Label(this, cx, statusY, `败因：${this.reason}`, { kind: 'heading', bold: false, color: 'bad' }).setOrigin(0.5)
    }

    const top = titleY + (f.portrait ? 140 : 126)
    const [team, foes] = this.panels(f, top)
    this.renderTeam(team)
    this.renderFoes(foes)

    const origin = this.run.origin
    const again = (): void => {
      endRun()
      this.scene.start(origin ?? SceneKey.Map)
    }
    const retry = (): void => {
      const prev = this.run
      endRun()
      const run = restartRun(prev)
      skipFilled(run)
      goStep(this, run)
    }
    const btnW = 300
    const gap = 26
    const first = { label: '再试一次', onTap: retry }
    const second = { label: origin === SceneKey.Editor ? '返回编辑器' : '返回选图', onTap: again }
    new Button(this, cx - btnW / 2 - gap / 2, f.footerY, { ...first, width: btnW, armMs: 500, keys: ['ENTER', 'SPACE'] })
    new Button(this, cx + btnW / 2 + gap / 2, f.footerY, { ...second, width: btnW, variant: 'secondary', armMs: 500 })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  /** 队伍表与敌情表的位置：横屏并排，竖屏上下 */
  private panels(f: PageFrame, top: number): [Rect, Rect] {
    const x = f.content.x + (f.portrait ? 24 : 40)
    const w = f.content.w - (f.portrait ? 48 : 80)
    const h = f.bodyBottom - top
    if (f.portrait) {
      const th = Math.round(h * 0.56)
      return [
        { x, y: top, w, h: th },
        { x, y: top + th + 20, w, h: h - th - 20 },
      ]
    }
    const tw = Math.round(w * 0.59)
    return [
      { x, y: top, w: tw, h },
      { x: x + tw + 20, y: top, w: w - tw - 20, h },
    ]
  }

  private renderTeam(rect: Rect): void {
    const st = this.run.stats
    // 这一局上过场的都列出来，换下去的也算
    const rows: TableRow[] = keysOf(this.run.kept).map((id) => {
      const taken = st.damageTaken[id] ?? 0
      const deaths = st.deaths[id] ?? 0
      return {
        icon: CHARACTERS[id].emoji,
        outline: 'player',
        name: CHARACTERS[id].name,
        cells: [
          formatBig(st.damage[id] ?? 0),
          taken > 0 ? { text: formatBig(taken), color: 'warn' } : NONE,
          `${st.kills[id] ?? 0}`,
          deaths > 0 ? { text: `${deaths}`, color: 'bad' } : NONE,
        ],
      }
    })
    new Table(this, rect, {
      columns: [
        { label: '伤害', at: 0.5 },
        { label: '承伤', at: 0.65 },
        { label: '击杀', at: 0.79 },
        { label: '阵亡', at: 0.92 },
      ],
      rows,
      rowH: 62,
      nameBold: true,
    })
  }

  private renderFoes(rect: Rect): void {
    const st = this.run.stats
    const kinds = [...new Set([...keysOf(st.enemyKills), ...keysOf(st.enemyDamage)])].sort(
      (a, b) => (st.enemyKills[b] ?? 0) - (st.enemyKills[a] ?? 0),
    )
    const dmgCell = (dmg: number): TableCell => (dmg > 0 ? { text: formatBig(dmg), color: 'warn' } : NONE)
    const rows: TableRow[] = [
      ...kinds.map((k): TableRow => {
        const e = ENEMIES[k]
        const boss = e.role === 'boss'
        return {
          icon: e.emoji,
          outline: boss ? 'elite' : 'enemy',
          name: e.name,
          nameColor: boss ? 'accent' : 'ink',
          cells: [`${st.enemyKills[k] ?? 0}`, dmgCell(st.enemyDamage[k] ?? 0)],
        }
      }),
      ...keysOf(st.hazardDamage).map((h): TableRow => ({ name: HAZARD_NAMES[h], cells: ['0', dmgCell(st.hazardDamage[h] ?? 0)] })),
    ]
    new Table(this, rect, {
      title: '{2694} 敌情',
      aside: st.eliteKills > 0 ? `{2b50} 精英 ×${st.eliteKills}` : undefined,
      columns: [
        { label: '击杀', at: 0.56 },
        { label: '对我方伤害', at: 0.82 },
      ],
      rows,
      rowH: 48,
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart({ win: this.win, reason: this.reason ?? undefined })
  }
}
