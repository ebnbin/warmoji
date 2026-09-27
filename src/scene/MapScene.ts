import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { CHARACTERS } from '../data/characters'
import { RUN_IDS, RUNS } from '../data/runs'
import { heatOf, MUTATOR_IDS, MUTATORS } from '../data/mutators'
import type { MutatorId, RunId } from '../types/runs'
import { beginRun, skipFilled } from '../run/state'
import { mutatorFits } from '../run/rules'
import { goStep } from './teamPage'
import { mapPlayLines } from './mapLines'
import { mutatorText, runRuleLines, runStepLines, starText, teamText } from './runLines'
import { loadMap, loadMutators, saveMap, saveMutators } from '../save/selection'
import { loadLabs } from '../save/labs'
import type { LabBests } from '../save/labs'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Button, Checkbox, EmojiGrid, Flow, Icon, Label, PageHeader, pageFrame, Panel, RichLabel, Row, ScrollView, Tabs, TileGrid } from '../ui'
import type { PageFrame, TabItem } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579', note: '1f9ea', team: '1f465', rules: '2696', steps: '1f4dc', stars: '2b50', heat: '1f525' } as const
/** 预设队伍里随机挑的位置 */
const RANDOM_SLOT = '2753'

/** 要选地图的玩法一种一个页签；地图固定的是关卡，都在实验关页签里挑 */
const FREE_RUNS: readonly RunId[] = RUN_IDS.filter((id) => RUNS[id].map === undefined)
const LABS: readonly RunId[] = RUN_IDS.filter((id) => RUNS[id].map !== undefined)
const LAB_TAB = { key: 'labs', emoji: '1f9ea', name: '实验关' } as const
type Mode = RunId | typeof LAB_TAB.key
/** 词缀一行：勾选框、图标、名字与热度、改了什么 */
const MUTATOR_ROW = { h: 68, gap: 8 } as const

export class MapScene extends Phaser.Scene {
  private preserveOnRestart = false
  private selectedId: MapId = MAP_IDS[0]!
  private labId: RunId | undefined = LABS[0]
  private mode: Mode = FREE_RUNS[0]!
  private frame!: PageFrame
  private mapGrid?: EmojiGrid<MapId>
  private labGrid?: TileGrid<RunId>
  private detail!: ScrollView
  private confirm!: Button
  /** 勾选的词缀，按词缀表的顺序；对当前关卡没用的开局时不带 */
  private mutators: MutatorId[] = []
  private bests: LabBests = {}
  private heatLine?: Label

  constructor() {
    super(SceneKey.Map)
  }

  preload(): void {
    preloadEmojis(this, [
      ...Object.values(GROUP_ICONS).map((id) => ({ id })),
      { id: RANDOM_SLOT, outline: 'player' as const },
      { id: LAB_TAB.emoji },
      ...MUTATOR_IDS.map((id) => ({ id: MUTATORS[id].emoji })),
      ...RUN_IDS.map((id) => ({ id: RUNS[id].emoji })),
      ...LABS.flatMap((id) => {
        const team = RUNS[id].team
        return team && team !== 'knobs' ? team.slots.flatMap((s) => (typeof s === 'string' ? [{ id: CHARACTERS[s].emoji, outline: 'player' as const }] : [])) : []
      }),
      ...MAP_IDS.flatMap((id) => [
        { id: MAPS[id].emoji },
        ...MAPS[id].decor.emojis.map((e) => ({ id: e, outline: 'player' as const })),
      ]),
    ])
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved) {
      this.selectedId = loadMap(browserStorage())
      this.mutators = loadMutators(browserStorage())
    }
    this.bests = loadLabs(browserStorage())
    this.heatLine = undefined
    const labs = this.mode === LAB_TAB.key

    const f = (this.frame = pageFrame({ sub: true, footer: true }))
    new PageHeader(this, f, { title: labs ? '选择关卡' : '选择地图', back: () => this.scene.start(SceneKey.Menu) })
    const tabs: TabItem<Mode>[] = FREE_RUNS.map((id) => ({ key: id, label: `{${RUNS[id].emoji}} ${RUNS[id].name}` }))
    if (LABS.length > 0) tabs.push({ key: LAB_TAB.key, label: `{${LAB_TAB.emoji}} ${LAB_TAB.name}` })
    new Tabs<Mode>(this, { x: f.left, y: f.subY, w: f.right - f.left }, {
      items: tabs,
      selected: this.mode,
      size: 'sm',
      onSelect: (mode) => {
        if (mode === this.mode) return
        this.mode = mode
        this.preserveOnRestart = true
        this.scene.restart()
      },
    })

    new Panel(this, f.detail.x, f.detail.y, f.detail.w, f.detail.h)
    this.detail = new ScrollView(this, { x: f.detail.x, y: f.detail.y + 8, w: f.detail.w, h: f.detail.h - 16 })

    this.mapGrid = undefined
    this.labGrid = undefined
    if (labs) {
      const grid = (this.labGrid = new TileGrid<RunId>(this, f.list, { minWidth: 150, height: 132 }))
      grid.onTap = (id): void => {
        this.labId = id
        this.refresh()
      }
      grid.setItems(
        LABS.map((id) => {
          const map = RUNS[id].map
          const best = this.bests[id]
          const stars = Array.from({ length: best?.stars ?? 0 }, () => GROUP_ICONS.stars)
          return { key: id, emoji: RUNS[id].emoji, title: RUNS[id].name, icons: [...(map ? [MAPS[map].emoji] : []), ...stars], badge: best && best.heat > 0 ? GROUP_ICONS.heat : undefined }
        }),
      )
    } else {
      const grid = (this.mapGrid = new EmojiGrid<MapId>(this, f.list))
      grid.onTap = (key): void => {
        this.selectedId = key
        saveMap(browserStorage(), this.selectedId)
        this.refresh()
      }
      grid.setItems(MAP_IDS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))
    }

    this.confirm = new Button(this, f.centerX, f.footerY, { label: '', keys: ['ENTER', 'SPACE'], onTap: () => this.start() })

    this.refresh()
    if (labs && this.labId) this.labGrid?.reveal(this.labId)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private start(): void {
    const mode = this.mode
    const id = mode === LAB_TAB.key ? this.labId : mode
    if (!id) return
    const run = beginRun(id, this.selectedId, mode === LAB_TAB.key ? this.applied(id) : [])
    skipFilled(run)
    goStep(this, run)
  }

  /** 这一关开局会带上的词缀：勾了又对它有用的 */
  private applied(id: RunId): MutatorId[] {
    return this.mutators.filter((m) => mutatorFits(RUNS[id], MUTATORS[m]))
  }

  private toggleMutator(id: MutatorId, on: boolean): void {
    const chosen = new Set(this.mutators)
    if (on) chosen.add(id)
    else chosen.delete(id)
    this.mutators = MUTATOR_IDS.filter((m) => chosen.has(m))
    saveMutators(browserStorage(), this.mutators)
    if (this.labId) this.showHeat(this.labId)
  }

  /** 热度的一行与开始键跟着勾选变 */
  private showHeat(id: RunId): void {
    const heat = heatOf(this.applied(id))
    this.heatLine?.setText(heat > 0 ? `这一局热度 ${heat}` : '没有勾选词缀，热度 0').setInk(heat > 0 ? 'warn' : 'muted')
    this.confirm.setLabel(heat > 0 ? `开始挑战 · 热度 ${heat}` : '开始挑战')
  }

  private renderMap(mode: RunId): void {
    const view = this.detail.clear()
    const def = MAPS[this.selectedId]
    const width = this.frame.detail.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 42, `{${def.emoji}} ${def.name}`, { kind: 'lead', iconSize: 76, gap: 14, originX: 0, maxWidth: width }), 90)
    flow.heading('主题', GROUP_ICONS.theme).text(def.desc).gap(10)
    flow.heading('地面装饰', GROUP_ICONS.decor).icons(def.decor.emojis, { outline: 'player' }).gap(4)
    flow.heading('玩法', GROUP_ICONS.play)
    for (const line of mapPlayLines(def)) flow.text(line)
    flow.text(`终波头目 ${bossFor(this.selectedId).name}`, { color: 'muted' })
    const run = RUNS[mode]
    flow.gap(10).heading(run.name, run.emoji).text(run.desc)
    flow.finish()
  }

  /** 关卡：玩法、在试什么、地图、队伍与每一步 */
  private renderLab(id: RunId): void {
    const view = this.detail.clear()
    const run = RUNS[id]
    const width = this.frame.detail.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 42, `{${run.emoji}} ${run.name}`, { kind: 'lead', iconSize: 76, gap: 14, originX: 0, maxWidth: width }), 90)
    flow.text(run.desc, { color: 'ink', indent: false }).gap(6)
    if (run.note) flow.heading('在试什么', GROUP_ICONS.note).text(run.note, { color: 'muted' }).gap(6)
    const map = MAPS[run.map ?? this.selectedId]
    flow.heading(`地图 · ${map.name}`, map.emoji).text(mapPlayLines(map)[0]!).gap(6)
    const team = run.team
    if (team && team !== 'knobs') {
      flow.heading('队伍', GROUP_ICONS.team)
      flow.icons(team.slots.map((s) => (typeof s === 'string' ? CHARACTERS[s].emoji : RANDOM_SLOT)), { size: 40, outline: 'player' })
      flow.text(teamText(team)).gap(6)
    }
    const rules = runRuleLines(run)
    if (rules.length > 0) {
      flow.heading('队伍规则', GROUP_ICONS.rules)
      for (const line of rules) flow.text(line)
      flow.gap(6)
    }
    flow.heading('流程', GROUP_ICONS.steps)
    for (const line of runStepLines(run)) flow.text(line)
    if (run.stars) {
      const best = this.bests[id]
      flow.gap(6).heading('星级', GROUP_ICONS.stars)
      flow.text(`过关得一星，下面每做到一条再得一星：${run.stars.map(starText).join('；')}`)
      flow.text(best ? `最好成绩 ${best.stars}/${1 + run.stars.length} 星${best.heat > 0 ? ` · 最高热度 ${best.heat}` : ''}` : '还没有过关', { color: best ? 'accent' : 'muted' })
    }
    this.flowMutators(flow, id)
    flow.finish()
  }

  /** 词缀：对这一关有用的一个一行，勾上就在开局时带上 */
  private flowMutators(flow: Flow, id: RunId): void {
    const fits = MUTATOR_IDS.filter((m) => mutatorFits(RUNS[id], MUTATORS[m]))
    if (fits.length === 0) return
    flow.gap(6).heading('词缀', GROUP_ICONS.heat)
    flow.text('开局前自选，叠得越多越难；赢下时记下最高热度', { color: 'muted' })
    const x = flow.indent
    const w = 24 + this.frame.detail.w - 48 - x
    for (const mid of fits) {
      const m = MUTATORS[mid]
      const box = new Checkbox(this, 30, MUTATOR_ROW.h / 2, { value: this.mutators.includes(mid), onChange: (on) => this.toggleMutator(mid, on) })
      const row = new Row(this, x, flow.y, w, MUTATOR_ROW.h, { onTap: () => box.toggle() })
      row.add([
        box,
        new Icon(this, 80, MUTATOR_ROW.h / 2, m.emoji, 38),
        new Label(this, 110, 20, m.name, { kind: 'label', bold: true }).setOrigin(0, 0.5),
        new Label(this, w - 14, 20, `热度 +${m.heat}`, { kind: 'caption', bold: true, color: 'warn' }).setOrigin(1, 0.5),
        new Label(this, 110, 48, mutatorText(m), { kind: 'caption', color: 'muted' }).setOrigin(0, 0.5).fit(w - 124),
      ])
      flow.put(row, MUTATOR_ROW.h + MUTATOR_ROW.gap)
    }
    const line = (this.heatLine = new Label(this, x, flow.y + 4, '', { kind: 'body', bold: true }))
    flow.put(line, 40)
    this.showHeat(id)
  }

  private refresh(): void {
    if (this.mode === LAB_TAB.key) {
      const id = this.labId
      this.labGrid?.setSelected(id ?? null)
      this.confirm.setLabel('开始挑战').setEnabled(id !== undefined)
      this.heatLine = undefined
      if (id) this.renderLab(id)
      return
    }
    this.mapGrid?.setSelected(this.selectedId)
    const run = RUNS[this.mode]
    this.confirm.setLabel(run.steps[0]?.kind === 'recruit' ? '招募首发' : `进入${run.name}`)
    this.renderMap(this.mode)
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
