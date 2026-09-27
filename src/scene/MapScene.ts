import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { CHARACTERS } from '../data/characters'
import { RUN_IDS, RUNS } from '../data/runs'
import type { RunId } from '../types/runs'
import { beginRun, skipFilled } from '../run/state'
import { goStep } from './teamPage'
import { mapPlayLines } from './mapLines'
import { runRuleLines, runStepLines, teamText } from './runLines'
import { loadMap, saveMap } from '../save/selection'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Button, EmojiGrid, Flow, PageHeader, pageFrame, Panel, RichLabel, ScrollView, Tabs, TileGrid } from '../ui'
import type { PageFrame, TabItem } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579', note: '1f9ea', team: '1f465', rules: '2696', steps: '1f4dc' } as const
/** 预设队伍里随机挑的位置 */
const RANDOM_SLOT = '2753'

/** 要选地图的玩法一种一个页签；地图固定的是关卡，都在实验关页签里挑 */
const FREE_RUNS: readonly RunId[] = RUN_IDS.filter((id) => RUNS[id].map === undefined)
const LABS: readonly RunId[] = RUN_IDS.filter((id) => RUNS[id].map !== undefined)
const LAB_TAB = { key: 'labs', emoji: '1f9ea', name: '实验关' } as const
type Mode = RunId | typeof LAB_TAB.key

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

  constructor() {
    super(SceneKey.Map)
  }

  preload(): void {
    preloadEmojis(this, [
      ...Object.values(GROUP_ICONS).map((id) => ({ id })),
      { id: RANDOM_SLOT, outline: 'player' as const },
      { id: LAB_TAB.emoji },
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
    if (!preserved) this.selectedId = loadMap(browserStorage())
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
          return { key: id, emoji: RUNS[id].emoji, title: RUNS[id].name, icons: map ? [MAPS[map].emoji] : [] }
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
    const id = this.mode === LAB_TAB.key ? this.labId : this.mode
    if (!id) return
    const run = beginRun(id, this.selectedId)
    skipFilled(run)
    goStep(this, run)
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
    flow.finish()
  }

  private refresh(): void {
    if (this.mode === LAB_TAB.key) {
      const id = this.labId
      this.labGrid?.setSelected(id ?? null)
      this.confirm.setLabel('开始挑战').setEnabled(id !== undefined)
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
