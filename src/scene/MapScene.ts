import Phaser from 'phaser'
import { browserStorage } from '../util/storage'
import type { MapId } from '../types/maps'
import { bossFor, MAP_IDS, MAPS } from '../data/maps'
import { beginSandboxRun } from '../ecs/sandbox/knobs'
import { beginRun, teamStep } from '../run/state'
import { nextAfterTeam } from './teamPage'
import { mapPlayLines } from './mapLines'
import { loadMap, saveMap } from '../save/selection'
import { preloadEmojis } from '../emoji/hold'
import { beginPage, Button, EmojiGrid, Flow, Label, PageHeader, pageFrame, Panel, RichLabel, ScrollView, Switch } from '../ui'
import type { PageFrame } from '../ui'
import { VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const GROUP_ICONS = { theme: '1f5fa', decor: '1f33f', play: '1f579' } as const

export class MapScene extends Phaser.Scene {
  private preserveOnRestart = false
  private selectedId: MapId = MAP_IDS[0]!
  private sandbox = false
  private frame!: PageFrame
  private grid!: EmojiGrid<MapId>
  private detail!: ScrollView
  private confirm!: Button

  constructor() {
    super(SceneKey.Map)
  }

  preload(): void {
    preloadEmojis(this, [
      ...Object.values(GROUP_ICONS).map((id) => ({ id })),
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

    const f = (this.frame = pageFrame({ footer: true }))
    new PageHeader(this, f, { title: '选择地图', back: () => this.scene.start(SceneKey.Menu) })
    new Label(this, f.right - 100, f.headerY, '试炼场', { kind: 'label', bold: true, color: 'soft' }).setOrigin(1, 0.5)
    new Switch(this, f.right - 42, f.headerY, {
      value: this.sandbox,
      onChange: (on) => {
        this.sandbox = on
        this.refresh()
      },
    })

    new Panel(this, f.detail.x, f.detail.y, f.detail.w, f.detail.h)
    this.detail = new ScrollView(this, { x: f.detail.x, y: f.detail.y + 8, w: f.detail.w, h: f.detail.h - 16 })

    this.grid = new EmojiGrid(this, f.list)
    this.grid.onTap = (key): void => {
      this.selectedId = key
      saveMap(browserStorage(), this.selectedId)
      this.refresh()
    }
    this.grid.setItems(MAP_IDS.map((id) => ({ key: id, emoji: MAPS[id].emoji })))

    this.confirm = new Button(this, f.centerX, f.footerY, { label: '', keys: ['ENTER', 'SPACE'], onTap: () => this.start() })

    this.refresh()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private start(): void {
    if (this.sandbox) {
      beginSandboxRun(this.selectedId)
      this.scene.start(SceneKey.Battle)
      return
    }
    const run = beginRun([], this.selectedId)
    this.scene.start(teamStep(run) ?? nextAfterTeam(run))
  }

  private renderDetail(): void {
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
    flow.finish()
  }

  private refresh(): void {
    this.grid.setSelected(this.selectedId)
    this.confirm.setLabel(this.sandbox ? '进入试炼场' : '招募首发')
    this.renderDetail()
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
