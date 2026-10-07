import Phaser from 'phaser'
import { CHARACTERS, TEAM } from '../data/characters'
import { MAX_CHAR_LEVEL } from '../data/charLevel'
import { ENEMIES } from '../data/enemies'
import { FIELD, POOLS } from '../data/battlefield'
import { characterXp, growthSteps, ITEMS, RARITIES, RARITY_ORDER } from '../data/items'
import { HAZARD_NAMES, mapEnemyRoster, MAPS } from '../data/maps'
import { ROLES } from '../data/roles'
import { STAT_CATEGORIES, STAT_KEYS, STATS, statValue } from '../data/stats'
import { fightCount } from '../data/runs'
import { heatOf, MUTATORS } from '../data/mutators'
import { levelProgress, stackCount } from '../run/draft'
import { activeHudHost } from '../run/hudHost'
import type { HudSnapshot, MemberSheet } from '../run/hudHost'
import { levelCap, memberLevel, memberLook, memberOutStats, teamLeveled } from '../run/members'
import { pendingLevelUps } from '../run/levelUp'
import { xpMaxed, xpToNext } from '../run/xp'
import { endRun, getRun, leaderSlot, runDef, stepsOf, waveStartHp } from '../run/state'
import { fightAfterRecruit, fightsDone, lastFight, nextFight, plannedFights } from '../run/flow'
import type { RunState } from '../run/state'
import type { CharacterId } from '../types/characters'
import type { EnemyDef, EnemyKind } from '../types/enemies'
import type { GrowthProgress, ItemId } from '../types/items'
import type { FightDef, GroupTraits, Squad } from '../types/runs'
import { fightGoalText, mutatorText, runRuleLines } from './runLines'
import { applyCamera, VIEWPORT_CHANGED } from '../util/apply'
import { formatBig, formatTime } from '../util/format'
import { keysOf } from '../util/record'
import {
  Button,
  Chip,
  Divider,
  EmojiGrid,
  Flow,
  Icon,
  KeyValueList,
  Label,
  PageHeader,
  pageFrame,
  Panel,
  ProgressBar,
  RichLabel,
  RosterList,
  Scrim,
  ScrollView,
  Table,
  Tabs,
} from '../ui'
import type { GridItem, KeyValue, PageFrame, RosterItem, Segment, TableCell, Tone } from '../ui'
import { itemLines } from './itemLines'
import { mapPlayLines } from './mapLines'
import { markPauseShown } from './pause'
import type { PauseData, PauseFrom } from './pause'
import { characterStatGroups, staminaTone } from './statLines'
import { flowStatGroups } from './teamPage'
import { enemyStatLines } from './wikiEntries'
import { SceneKey } from './keys'

type Tab = 'stats' | 'skills' | 'items' | 'run' | 'foes'

const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'stats', label: '{1f4ca} 属性' },
  { key: 'skills', label: '{26a1} 能力' },
  { key: 'items', label: '{1f392} 道具' },
  { key: 'run', label: '{1f5fa} 本局' },
  { key: 'foes', label: '{2694} 敌情' },
]

/** 这几页看某一名队员：右边列出全队可点选 */
const MEMBER_TABS: ReadonlySet<Tab> = new Set<Tab>(['stats', 'skills', 'items'])

/** 随暂停页停住的场景，其中藏起来的不透出来：战斗只藏 HUD，地图压暗了留作背景 */
const HOSTS: Readonly<Record<PauseFrom, { readonly pause: readonly SceneKey[]; readonly hide: readonly SceneKey[] }>> = {
  [SceneKey.Battle]: { pause: [SceneKey.Battle, SceneKey.Ui], hide: [SceneKey.Ui] },
  [SceneKey.Shop]: { pause: [SceneKey.Shop], hide: [SceneKey.Shop] },
  [SceneKey.Recruit]: { pause: [SceneKey.Recruit], hide: [SceneKey.Recruit] },
}

/** 队员页详情顶部的角色头 */
const HEAD_H = 112

const NONE: TableCell = { text: '—', color: 'faint' }

/** 战斗里的操作，键位与手势照着 HUD 与战斗场景写 */
const CONTROLS: readonly string[] = [
  '移动：WASD 或方向键；触屏按住左下角的摇杆拖动',
  '放技能：Q，或点右下角的队长；能瞄准的按住拖出方向，能蓄力的按住蓄力，松手放出',
  '换队长：1～4 键依次对应弧上从上到左的队员，或直接点头像',
  '暂停：ESC，或点右上角的暂停键',
]

/** 暂停页上的一名队员：战斗中取此刻的样子，战斗外按本局记下的道具、成长与生命算 */
interface Member extends MemberSheet {
  readonly slot: number
  readonly id: CharacterId
  readonly items: readonly ItemId[]
  readonly growth: GrowthProgress
}

interface Foe {
  readonly def: EnemyDef
  /** 从第几场起出没 */
  readonly since: number
}

/** 这一局会出的敌人：按首次出没的场次排，巢穴生出的与死后分裂出的跟着母体；配比按这一批的，再按这一阶段的；沙盒是这张图出没的全部 */
function runFoes(run: RunState): Foe[] {
  const since = new Map<EnemyKind, number>()
  const order: EnemyDef[] = []
  const add = (def: EnemyDef, n: number): void => {
    const known = since.get(def.kind)
    if (known !== undefined) {
      since.set(def.kind, Math.min(known, n))
      return
    }
    since.set(def.kind, n)
    order.push(def)
    if (def.spawner) add(def.spawner.into, n)
    for (const fx of def.onDeath ?? []) if (fx.kind === 'split') add(fx.into, n)
  }
  if (runDef(run).team === 'knobs') {
    for (const e of mapEnemyRoster(run.mapId)) add(e, 1)
    return order.map((def) => ({ def, since: 1 }))
  }
  plannedFights(run).forEach((f, i) => {
    const n = i + 1
    for (const p of f.phases) {
      const group = (g: GroupTraits): void => {
        if (g.enemy) add(ENEMIES[g.enemy], n)
        else for (const m of g.mix ?? p.mix ?? []) add(ENEMIES[m.kind], n)
      }
      const squad = (sq: Squad): void => {
        group(sq)
        if (sq.escort) add(ENEMIES[sq.escort.enemy], n)
      }
      for (const s of p.spawns) {
        if (s.kind === 'batch') squad(s.squad)
        else if (s.kind === 'waves') s.squads.forEach(squad)
        else group(s)
      }
    }
  })
  return order.map((def) => ({ def, since: since.get(def.kind)! })).sort((a, b) => a.since - b.since)
}

/** 这一场登场的头目，各阶段的都算 */
function fightBosses(f: FightDef): EnemyDef[] {
  const squads = f.phases.flatMap((p) => p.spawns).flatMap((s) => (s.kind === 'batch' ? [s.squad] : s.kind === 'waves' ? s.squads : []))
  return squads.flatMap((sq) => (sq.enemy && ENEMIES[sq.enemy].role === 'boss' ? [ENEMIES[sq.enemy]] : []))
}

/** 多场的一局里这一场的特别之处：有头目，或有一队必出精英 */
function fightTag(f: FightDef): string {
  if (fightBosses(f).length > 0) return '（首领场）'
  return f.phases.some((p) => p.spawns.some((s) => s.kind === 'batch' && (s.squad.elites ?? 0) > 0)) ? '（精英场）' : ''
}

/** 暂停页：一局之中的信息都在这里，盖在战斗、商店或招募页上，下层停住 */
export class PauseScene extends Phaser.Scene {
  private preserveOnRestart = false
  private opened: PauseData = { from: SceneKey.Battle }
  private leaving = false
  private tab: Tab = 'stats'
  private slot = 0
  private foe: EnemyKind | null = null
  private run!: RunState
  private frame!: PageFrame
  /** 队员数据取自战斗此刻的状态 */
  private live = false
  private members: Member[] = []
  private foes: Foe[] = []
  private detail!: ScrollView
  private headObjs: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super(SceneKey.Pause)
  }

  init(data: PauseData): void {
    this.opened = data
  }

  create(): void {
    applyCamera(this)
    markPauseShown(true)
    const host = HOSTS[this.opened.from]
    for (const k of host.pause) if (this.scene.isActive(k)) this.scene.pause(k)
    for (const k of host.hide) this.scene.setVisible(false, k)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.leaving = false
    this.headObjs = []
    this.run = getRun()
    this.members = this.readMembers()
    this.foes = runFoes(this.run)
    if (!preserved) {
      this.tab = 'stats'
      const want = this.opened.slot
      this.slot = want !== undefined && this.members[want] ? want : Math.max(0, this.members.findIndex((m) => m.leader))
      this.foe = null
    }

    const f = (this.frame = pageFrame({ sub: true, footer: true, tallDetail: true }))
    new Scrim(this, { depth: -1, alpha: 0.9, block: false })
    new PageHeader(this, f, { title: '{23f8} 已暂停' })
    new Tabs(this, { x: f.left, y: f.subY, w: f.right - f.left }, {
      items: TABS,
      selected: this.tab,
      columns: f.portrait ? TABS.length : undefined,
      onSelect: (tab) => this.selectTab(tab),
    })
    const D = f.detail
    new Panel(this, D.x, D.y, D.w, D.h)
    if (MEMBER_TABS.has(this.tab)) this.createMemberTab()
    else if (this.tab === 'run') this.createRunTab()
    else this.createFoesTab()

    const btnW = 300
    const gap = 24
    new Button(this, f.centerX - btnW / 2 - gap / 2, f.footerY, { label: '继 续', width: btnW, keys: ['SPACE'], onTap: () => this.close() })
    new Button(this, f.centerX + btnW / 2 + gap / 2, f.footerY, { label: '结束本局', width: btnW, variant: 'danger', onTap: () => this.quit() })
    this.input.keyboard?.on('keydown-ESC', () => this.close())

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      markPauseShown(false)
      // 与下层恢复在同一帧生效，不先露出一帧
      if (this.leaving) for (const k of host.hide) this.scene.setVisible(true, k)
    })
  }

  /** 回到打开暂停页的界面，下层接着跑 */
  private close(): void {
    if (this.leaving) return
    this.leaving = true
    for (const k of HOSTS[this.opened.from].pause) this.scene.resume(k)
    this.scene.stop()
  }

  /** 结束本局：回到这一局的来处，没有就回主菜单 */
  private quit(): void {
    if (this.leaving) return
    this.leaving = true
    const origin = this.run.origin
    endRun()
    for (const k of HOSTS[this.opened.from].pause) this.scene.stop(k)
    this.scene.start(origin ?? SceneKey.Menu)
  }

  private selectTab(tab: Tab): void {
    if (tab === this.tab) return
    this.tab = tab
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private readMembers(): Member[] {
    const run = this.run
    const sheets = this.opened.from === SceneKey.Battle ? (activeHudHost()?.teamSheets() ?? []) : []
    this.live = sheets.length > 0
    return run.roster.map((id, slot): Member => {
      const items = run.memberItems[slot] ?? []
      const growth = run.memberGrowth[slot] ?? {}
      const sheet = sheets[slot]
      if (sheet) return { ...sheet, slot, id, items, growth }
      const stats = memberOutStats(run, slot)
      return {
        slot,
        id,
        items,
        growth,
        emoji: memberLook(run, slot),
        level: memberLevel(run, slot),
        leader: slot === leaderSlot(run),
        alive: true,
        hp: waveStartHp(run.memberHp[slot] ?? stats.maxHp, stats.maxHp),
        max: stats.maxHp,
        reviveSec: 0,
        stamina: 1,
        tired: false,
        now: stats,
        lasting: stats,
      }
    })
  }

  /** 战斗里的计时与战场效果；从商店或招募页打开时没有 */
  private snapshot(): HudSnapshot | undefined {
    return this.opened.from === SceneKey.Battle ? activeHudHost()?.hudSnapshot() : undefined
  }

  private createMemberTab(): void {
    const f = this.frame
    const D = f.detail
    const list = new RosterList<number>(this, f.list)
    list.onTap = (slot): void => {
      if (slot === this.slot) return
      this.slot = slot
      list.setSelected(slot)
      this.renderMember()
    }
    list.setSelected(this.slot)
    list.setItems(
      this.members.map(
        (m): RosterItem<number> => ({
          key: m.slot,
          emoji: m.emoji,
          outline: 'player',
          badge: !m.alive ? '1f480' : m.leader ? '2b50' : undefined,
          title: CHARACTERS[m.id].name,
          aside: `Lv ${m.level}`,
          asideColor: 'accent',
          hp: m.alive && m.max > 0 ? m.hp / m.max : 0,
          dim: !m.alive,
        }),
      ),
    )
    new Divider(this, D.x + 16, D.y + HEAD_H - 2, D.w - 32)
    this.detail = new ScrollView(this, { x: D.x, y: D.y + HEAD_H + 4, w: D.w, h: D.h - HEAD_H - 12 })
    this.renderMember()
  }

  private renderMember(): void {
    for (const o of this.headObjs) o.destroy()
    this.headObjs = []
    const view = this.detail.clear()
    const m = this.members[this.slot]
    if (!m) return
    this.renderHead(m)
    const flow = new Flow(this, view, { x: 24, y: 12, width: view.viewport.w - 48 })
    if (this.tab === 'stats') this.flowStats(flow, m)
    else if (this.tab === 'skills') flowStatGroups(flow, characterStatGroups(m.id, m.items, m.level, { growth: m.growth, base: false }))
    else this.flowItems(flow, m)
    flow.finish()
  }

  /** 角色头：头像、名字与身份，生命条、体力条与经验条 */
  private renderHead(m: Member): void {
    const D = this.frame.detail
    const def = CHARACTERS[m.id]
    const keep = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      this.headObjs.push(obj)
      return obj
    }
    const x0 = D.x + 116
    const right = D.x + D.w - 24
    keep(new Icon(this, D.x + 60, D.y + 56, m.emoji, 84, 'player').setAlpha(m.alive ? 1 : 0.4))
    const name = keep(new Label(this, x0, D.y + 32, def.name, { kind: 'lead' }).setOrigin(0, 0.5))
    const chips: { text: string; tone: Tone }[] = [{ text: ROLES[def.role].name, tone: 'steel' }]
    if (m.leader) chips.push({ text: '队长', tone: 'accent' })
    if (m.tired) chips.push({ text: '疲惫', tone: 'warn' })
    let cx = name.x + name.width + 14
    for (const c of chips) {
      const chip = keep(new Chip(this, cx, D.y + 32, c.text, { tone: c.tone, originX: 0 }))
      cx += chip.chipWidth + 8
    }

    const half = (right - x0 - 28) / 2
    const ratio = m.max > 0 ? Math.min(1, m.hp / m.max) : 0
    const hpText = !m.alive
      ? m.reviveSec === null
        ? '倒下 · 这一场不会自己起来'
        : `倒下 · ${m.reviveSec} 秒后复活`
      : `生命 ${Math.ceil(m.hp)} / ${Math.round(m.max)} · 体力 ${Math.round(m.stamina * m.now.maxStamina)} / ${Math.round(m.now.maxStamina)}${this.opened.from === SceneKey.Battle ? '' : '（下一波开局）'}`
    keep(new Label(this, x0, D.y + 68, hpText, { kind: 'label', bold: true, color: !m.alive ? 'bad' : ratio > 0.5 ? 'good' : 'warn' }).setOrigin(0, 0.5))
    keep(new ProgressBar(this, x0, D.y + 86, half, 14, { tone: 'hp', value: m.alive ? ratio : 0 }))
    if (m.alive) keep(new ProgressBar(this, x0, D.y + 102, half, 6, { tone: staminaTone(m.stamina), value: m.stamina }))

    const top = levelCap(this.run)
    const prog = levelProgress(characterXp(m.items), this.run.minLevel, top)
    const capText = top < MAX_CHAR_LEVEL ? '等级上限' : '满级'
    // 沙盒的等级是调出来的，靠全队升级的一局按升级时的选择，都不来自买道具攒的经验
    const tuned = runDef(this.run).team === 'knobs'
    const picked = teamLeveled(this.run)
    const lvText = tuned
      ? `Lv ${m.level}`
      : picked
        ? `Lv ${m.level}${m.level >= top ? ` · ${capText}` : ''}`
        : prog.maxed
          ? `Lv ${m.level} · ${capText}`
          : `Lv ${m.level} · 经验 ${prog.cur}/${prog.need}`
    const lvRatio = tuned ? 1 : picked ? (top > 1 ? (m.level - 1) / (top - 1) : 1) : prog.ratio
    keep(new Label(this, right, D.y + 68, lvText, { kind: 'label', bold: true, color: 'accent' }).setOrigin(1, 0.5))
    keep(new ProgressBar(this, right - half, D.y + 86, half, 14, { tone: lvRatio >= 1 ? 'accent' : 'info', value: lvRatio }))
  }

  /** 属性表按分类列出；战斗中此刻值与常驻值不同的高亮并附常驻值，没有加成的压暗 */
  private flowStats(flow: Flow, m: Member): void {
    const w = this.detail.viewport.w - 48
    const def = CHARACTERS[m.id]
    for (const cat of keysOf(STAT_CATEGORIES)) {
      const rows = STAT_KEYS.filter((k) => STATS[k].category === cat).map((k): KeyValue => {
        const now = statValue(k, m.now[k])
        const lasting = statValue(k, m.lasting[k])
        const changed = now !== lasting
        return { key: STATS[k].name, value: now, highlight: changed, note: changed ? `常驻 ${lasting}` : undefined, dim: !changed && m.now[k] === STATS[k].base }
      })
      if (cat === 'mobility') rows.push({ key: '质量', value: `${def.body.mass}` })
      flow.heading(STAT_CATEGORIES[cat].name, STAT_CATEGORIES[cat].icon)
      const list = new KeyValueList(this, 24, flow.y, w, rows, 2)
      flow.put(list, list.listHeight + 16)
    }
    const note = this.live ? '灰色的属性还没有任何加成；黄色的数值此刻受限时效果、战场效果或体力影响，旁边灰字是常驻值' : '灰色的属性还没有任何加成'
    flow.text(note, { kind: 'caption', color: 'faint', indent: false })
  }

  /** 已有道具：稀有的在前，逐条写明效果，成长道具附上已成长的次数 */
  private flowItems(flow: Flow, m: Member): void {
    const owned = m.items
    if (owned.length === 0) {
      const def = runDef(this.run)
      flow.text(stepsOf(this.run).some((s) => s.kind === 'shop') ? '还没有道具：在商店给这名队员购买' : `${def.name}不带道具`, { color: 'muted', indent: false })
      return
    }
    flow.text(teamLeveled(this.run) ? `共 ${owned.length} 件` : `共 ${owned.length} 件 · 角色经验 ${characterXp(owned)}`, { color: 'muted', indent: false })
    flow.gap(6)
    const rank = (id: ItemId): number => RARITY_ORDER.indexOf(ITEMS[id].rarity)
    for (const id of [...new Set(owned)].sort((a, b) => rank(b) - rank(a))) {
      const def = ITEMS[id]
      const rarity = RARITIES[def.rarity]
      const n = stackCount(owned, id)
      const segs: Segment[] = [{ icon: def.emoji, size: 34 }, { text: def.name, color: def.rarity === 'common' ? 'ink' : rarity.tone }]
      if (def.maxStacks !== undefined) segs.push({ text: `${n}/${def.maxStacks}`, color: 'muted' })
      else if (n > 1) segs.push({ text: `×${n}`, color: 'muted' })
      const head = new RichLabel(this, 24, flow.y + 18, segs, { kind: 'heading', originX: 0, gap: 10 })
      flow.put(head).put(new Chip(this, 24 + head.spanWidth + 14, flow.y + 18, rarity.label, { tone: rarity.tone, originX: 0 }))
      flow.y += 44
      for (const line of itemLines(def)) flow.text(line)
      if (def.grow) flow.text(`已成长 ${growthSteps(id, m.growth[id] ?? 0)} 次`, { color: 'good' })
      flow.gap(10)
    }
  }

  private createRunTab(): void {
    const f = this.frame
    const D = f.detail
    const run = this.run
    const snap = this.snapshot()
    const map = MAPS[run.mapId]
    const view = new ScrollView(this, { x: D.x, y: D.y + 8, w: D.w, h: D.h - 16 })
    const width = D.w - 48
    const flow = new Flow(this, view, { x: 24, y: 12, width })
    flow.put(new RichLabel(this, 24, 40, `{${map.emoji}} ${map.name}`, { kind: 'lead', iconSize: 64, gap: 14, originX: 0, maxWidth: width }), 80)
    flow.text(map.desc, { color: 'muted', indent: false }).gap(6)
    flow.heading('玩法', '1f579')
    for (const line of mapPlayLines(map)) flow.text(line)
    flow.gap(6)

    flow.heading('进度', '1f3c1')
    const def = runDef(run)
    const total = fightCount(def)
    const remain = snap?.remainMs ?? null
    const cur = nextFight(run)
    if (total > 1) {
      const done = fightsDone(run)
      const prev = lastFight(run)
      const tag = (f: FightDef): string => fightTag(f)
      flow.text(
        snap && cur
          ? `${cur.name}进行中${tag(cur)}${remain === null ? '' : ` · 还剩 ${formatTime(Math.ceil(remain / 1000))}`}`
          : `${prev ? `${prev.name}已完成 · ` : ''}下一场是${cur?.name ?? ''}${cur ? tag(cur) : ''}`,
        { color: 'ink', bold: true },
      )
      const barText = new Label(this, 24 + width, flow.y + 10, `${done} / ${total} 场`, { kind: 'label', color: 'soft' }).setOrigin(1, 0.5)
      const bar = new ProgressBar(this, flow.indent, flow.y + 2, 24 + width - barText.width - 16 - flow.indent, 16, { tone: 'accent', value: done / total })
      flow.put(bar).put(barText, 34)
      const numbered = plannedFights(run).map((f, i) => ({ f, n: i + 1 }))
      const elites = numbered.filter(({ f, n }) => n > done && tag(f) === `（精英场）`).map(({ n }) => n)
      const bosses = numbered.flatMap(({ f, n }) => {
        const names = fightBosses(f).map((b) => b.name)
        return names.length > 0 ? [`第 ${n} 场是首领场：${names.join('、')}`] : []
      })
      flow.text([elites.length > 0 ? `精英场还有第 ${elites.join('、')} 场` : '', ...bosses].filter(Boolean).join(' · '))
    } else {
      flow.text(`${def.name} · 已打 ${formatTime(snap?.seconds ?? 0)}${remain === null ? '' : ` · 还剩 ${formatTime(Math.ceil(remain / 1000))}`}`)
    }
    if (cur) flow.text(`${snap ? '这一' : '下一'}场的目标：${fightGoalText(cur)}`)
    flow.gap(6)

    const rules = runRuleLines(def)
    const muts = run.mutators
    if (rules.length > 0 || muts.length > 0) {
      flow.heading('队伍规则', '2696')
      for (const line of rules) flow.text(line)
      if (muts.length > 0) flow.text(`词缀 · 热度 ${heatOf(muts)}：${muts.map((id) => `${MUTATORS[id].name}（${mutatorText(MUTATORS[id])}）`).join('、')}`, { color: 'warn' })
      if (Number.isFinite(run.lives)) flow.text(run.lives > 0 ? `眼下还能起来 ${run.lives} 次` : '命已经用完，倒下就再也起不来', { color: run.lives > 0 ? 'soft' : 'bad' })
      flow.gap(6)
    }

    flow.heading('收获', '1fa99')
    const combatMs = run.combatMs + (snap ? snap.seconds * 1000 : 0)
    flow.text(`金币 ${run.coins} · 击杀 ${run.kills}${run.stats.eliteKills > 0 ? `（精英 ${run.stats.eliteKills}）` : ''} · 战斗用时 ${formatTime(combatMs / 1000)}`)
    const hazards = keysOf(run.stats.hazardDamage).map((h) => `${HAZARD_NAMES[h]} ${formatBig(run.stats.hazardDamage[h] ?? 0)}`)
    if (hazards.length > 0) flow.text(`地形伤害：${hazards.join(' · ')}`, { color: 'warn' })
    const size = run.roster.length
    const joinAt = fightAfterRecruit(run)
    const picked = teamLeveled(run)
    flow.text(
      size >= TEAM.maxSize
        ? `队伍 ${size} / ${TEAM.maxSize} 人，已满员`
        : picked
          ? `队伍 ${size} / ${TEAM.maxSize} 人 · 全队升级时可以招募新队员`
          : joinAt
            ? `队伍 ${size} / ${TEAM.maxSize} 人 · ${joinAt.name}开打前招募新队员`
            : `队伍 ${size} 人`,
    )
    if (picked) {
      const xp = xpMaxed(run) ? '满级' : `经验 ${run.xp.xp}/${xpToNext(run)}`
      const waiting = pendingLevelUps(run)
      flow.text(`全队 Lv ${run.xp.level} · ${xp}${waiting > 0 ? ` · 还有 ${waiting} 次升级没领` : ''}`, { color: 'info' })
    }
    flow.gap(6)

    if (snap) {
      flow.heading('生效中的战场效果', '2728')
      if (snap.battleFx.length === 0) flow.text('眼下没有', { color: 'muted' })
      for (const fx of snap.battleFx) {
        this.flowEffect(flow, fx.emoji, `${fx.name}：${fx.desc} · 还剩 ${Math.ceil(fx.remainMs / 1000)} 秒`, fx.polarity === 'buff')
      }
      flow.gap(6)
    }
    flow.heading('这张图的战场效果', '1f4e6')
    flow.text(`带光圈的敌人死后掉落，在地上留 ${FIELD.groundMs / 1000} 秒，队员碰到就生效`, { color: 'muted' })
    for (const p of POOLS[run.mapId]) this.flowEffect(flow, p.emoji, `${p.name}：${p.desc}`, p.polarity === 'buff')
    flow.gap(6)
    flow.heading('操作', '1f3ae')
    for (const line of CONTROLS) flow.text(line)
    flow.finish()

    const st = run.stats
    new Table(this, f.list, {
      title: '{1f3c6} 战绩',
      aside: st.eliteKills > 0 ? `{2b50} 精英 ×${st.eliteKills}` : undefined,
      columns: [
        { label: '伤害', at: 0.5 },
        { label: '承伤', at: 0.65 },
        { label: '击杀', at: 0.79 },
        { label: '阵亡', at: 0.92 },
      ],
      rows: this.members.map((m) => {
        const taken = st.damageTaken[m.slot] ?? 0
        const deaths = st.deaths[m.slot] ?? 0
        return {
          icon: m.emoji,
          outline: 'player' as const,
          name: CHARACTERS[m.id].name,
          cells: [
            formatBig(st.damage[m.slot] ?? 0),
            taken > 0 ? { text: formatBig(taken), color: 'warn' as const } : NONE,
            `${st.kills[m.slot] ?? 0}`,
            deaths > 0 ? { text: `${deaths}`, color: 'bad' as const } : NONE,
          ],
        }
      }),
      rowH: 58,
      nameBold: true,
    })
  }

  private flowEffect(flow: Flow, emoji: string, text: string, good: boolean): void {
    flow.put(
      new RichLabel(this, flow.indent, flow.y + 16, [{ icon: emoji, size: 32 }, { text, color: good ? 'good' : 'bad' }], {
        kind: 'label',
        originX: 0,
        gap: 8,
        maxWidth: this.frame.detail.w - 24 - flow.indent,
      }),
      40,
    )
  }

  private createFoesTab(): void {
    const f = this.frame
    const D = f.detail
    const grid = new EmojiGrid<EnemyKind>(this, f.list)
    grid.onTap = (kind): void => {
      if (kind === this.foe) return
      this.foe = kind
      grid.setSelected(kind)
      this.renderFoe()
    }
    grid.setItems(
      this.foes.map(
        ({ def, since }): GridItem<EnemyKind> => ({ key: def.kind, emoji: def.emoji, outline: def.role === 'boss' ? 'elite' : 'enemy', dim: since > fightsDone(this.run) + 1 }),
      ),
    )
    if (!this.foes.some((x) => x.def.kind === this.foe)) this.foe = this.foes[0]?.def.kind ?? null
    grid.setSelected(this.foe)
    this.detail = new ScrollView(this, { x: D.x, y: D.y + 8, w: D.w, h: D.h - 16 })
    this.renderFoe()
  }

  private renderFoe(): void {
    const view = this.detail.clear()
    const foe = this.foes.find((x) => x.def.kind === this.foe)
    if (!foe) return
    const { def, since } = foe
    const w = view.viewport.w
    const boss = def.role === 'boss'
    const name = new Label(this, 136, 44, def.name, { kind: 'lead' }).setOrigin(0, 0.5)
    const desc = new Label(this, 136, 74, def.desc, { kind: 'label', color: 'muted', wrap: w - 160 })
    view.add([new Icon(this, 72, 62, def.emoji, 88, boss ? 'elite' : 'enemy'), name, desc])
    if (boss) view.add(new Chip(this, name.x + name.width + 12, 44, '首领', { tone: 'bad', originX: 0 }))
    const flow = new Flow(this, view, { x: 24, y: Math.max(136, desc.y + desc.height + 16), width: w - 48 })
    const st = this.run.stats
    flow.heading('本局', '1f3c6')
    const many = fightCount(runDef(this.run)) > 1
    const when = many ? (boss ? `第 ${since} 场登场的头目` : `第 ${since} 场起出没`) : boss ? '这一场的头目' : '这一场会出现'
    flow.text(since > fightsDone(this.run) + 1 ? `${when} · 还没登场` : when)
    flow.text(`击杀 ${st.enemyKills[def.kind] ?? 0} · 对我方造成 ${formatBig(st.enemyDamage[def.kind] ?? 0)} 伤害`)
    flow.gap(6)
    flow.heading('特性', '1f4d6')
    for (const line of enemyStatLines(def)) flow.text(line)
    flow.finish()
  }
}
