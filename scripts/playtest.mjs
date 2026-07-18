// 自动游玩探针（新敌人平衡回归）：单人首发起步，读实时战场做走位（含敌弹/毒液避让），
// 商店按策略招募/升级/购物，逐波输出战报；全灭或 20 波封顶结束。不作弊。
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

// 截图输出目录：默认仓库内 playtest-out/（gitignored），PLAYTEST_OUT 可覆盖
const OUT = process.env.PLAYTEST_OUT ?? 'playtest-out'
mkdirSync(OUT, { recursive: true })
const PORT = 4331
const UNIT = 64
const MAPW = 25 * UNIT
const MAPH = 25 * UNIT
const TICK = 180

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  detached: true,
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const css = async (logical) =>
  page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
const clickAt = async (pt) => page.locator('#game canvas').click({ position: await css(pt) })
const log = (tag, obj) => console.log(`${tag} ${JSON.stringify(obj)}`)

let lastAngle = null
function decide(st) {
  const cands = 16
  let best = 0
  let bestScore = -Infinity
  for (let i = 0; i < cands; i++) {
    const th = (i / cands) * 2 * Math.PI
    const px = st.cx + Math.cos(th) * 2.5 * UNIT
    const py = st.cy + Math.sin(th) * 2.5 * UNIT
    let score = 0
    for (const e of st.enemies) {
      const d = Math.hypot(px - e.x, py - e.y)
      const R = 6 * UNIT
      if (d < R) score -= (e.fast ? 1.6 : 1) * Math.pow(1 - d / R, 2) * 10
    }
    const wm = 2 * UNIT
    if (px < wm) score -= ((wm - px) / wm) * 8
    if (px > MAPW - wm) score -= ((px - (MAPW - wm)) / wm) * 8
    if (py < wm) score -= ((wm - py) / wm) * 8
    if (py > MAPH - wm) score -= ((py - (MAPH - wm)) / wm) * 8
    if (st.nearCoin) {
      const d = Math.hypot(px - st.nearCoin.x, py - st.nearCoin.y)
      score += Math.max(0, 1 - d / (10 * UNIT)) * (st.danger < 2 ? 3 : 0.6)
    }
    score += (1 - Math.hypot(px - MAPW / 2, py - MAPH / 2) / (18 * UNIT)) * 0.5
    if (lastAngle !== null) score += Math.cos(th - lastAngle) * 0.7
    if (score > bestScore) {
      bestScore = score
      best = th
    }
  }
  lastAngle = best
  return best
}

const held = new Set()
async function applyAngle(angle) {
  const want = new Set()
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  if (dx > 0.38) want.add('ArrowRight')
  if (dx < -0.38) want.add('ArrowLeft')
  if (dy > 0.38) want.add('ArrowDown')
  if (dy < -0.38) want.add('ArrowUp')
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k) }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k) }
}
async function releaseKeys() {
  for (const k of held) await page.keyboard.up(k)
  held.clear()
}

async function snapshot() {
  return page.evaluate(() => {
    const w = window.__warmoji
    if (!w) return { scene: 'unknown' }
    if (w.scene !== 'arena') return { scene: w.scene }
    const arena = window.__game.scene.keys.arena
    const enemies = arena.enemies
      .getChildren()
      .filter((e) => e.active)
      .map((e) => {
        const k = e.getData('spec').kind
        return { x: e.x, y: e.y, fast: k === 'ghost' || k === 'boar' || k === 'blobling' }
      })
    // 敌弹与毒液池也参与避让打分
    for (const s of arena.enemyShots.getChildren()) {
      if (s.active) enemies.push({ x: s.x, y: s.y, fast: true })
    }
    for (const p of arena.poisonPools) enemies.push({ x: p.x, y: p.y, fast: false })
    const cx = arena.center.x
    const cy = arena.center.y
    let nearCoin = null
    let bd = Infinity
    for (const c of arena.coins.getChildren()) {
      if (!c.active) continue
      const d = Math.hypot(c.x - cx, c.y - cy)
      if (d < bd) {
        bd = d
        nearCoin = { x: c.x, y: c.y }
      }
    }
    let danger = 0
    for (const e of enemies) if (Math.hypot(e.x - cx, e.y - cy) < 4 * 64) danger++
    return {
      scene: 'arena',
      cx,
      cy,
      enemies,
      nearCoin,
      danger,
      wave: w.wave,
      elapsed: w.elapsed,
      hp: w.hp,
      alive: w.alive,
      level: w.level,
      kills: w.kills,
      coins: w.coins,
      fps: w.fps,
    }
  })
}

async function shopState() {
  return page.evaluate(() => window.__warmoji.shop)
}

async function focusSlot(id) {
  const s = await shopState()
  const r = s.slots.find((x) => x.id === id)
  if (!r) return false
  await clickAt({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
  await page.waitForFunction((sid) => window.__warmoji?.shop?.focusedId === sid, id, { timeout: 8000 })
  return true
}

/** 整编页：强制招募/升级逐步结算，随后的队形环节维持现状直接出发（波末必进本页） */
async function promotePhase() {
  const actions = []
  for (let guard = 0; guard < 24; guard++) {
    const scene = await page.evaluate(() => window.__warmoji.scene)
    if (scene !== 'promote') break
    const pr = await page.evaluate(() => window.__warmoji.promote)
    if (pr.mode === 'formation') {
      await clickAt({ x: pr.confirm.x, y: pr.confirm.y })
      await page.waitForFunction(() => window.__warmoji?.scene !== 'promote', undefined, { timeout: 10000 })
      break
    }
    let pickKey = pr.selected
    if (pr.mode === 'recruit') {
      const wish = ['mage', 'robot', 'troll', 'snowman', 'unicorn', 'kangaroo', 'juggler']
      const ids = pr.items.map((x) => x.id)
      pickKey = wish.find((x) => ids.includes(x)) ?? ids[0]
    } else {
      // 升级优先主力（按 slot 顺序即可）
      pickKey = pr.items[0]?.id ?? pr.selected
    }
    if (!pickKey) break
    if (pickKey !== pr.selected) {
      const it = pr.items.find((x) => x.id === pickKey)
      await clickAt({ x: it.x + it.w / 2, y: it.y + it.h / 2 })
      await page.waitForFunction((k) => window.__warmoji?.promote?.selected === k, pickKey, { timeout: 8000 })
    }
    const confirm = await page.evaluate(() => window.__warmoji.promote.confirm)
    const before = pr.points
    await clickAt({ x: confirm.x, y: confirm.y })
    await page.waitForFunction(
      (prev) =>
        window.__warmoji?.scene !== 'promote' ||
        (window.__warmoji.promote?.points ?? 99) < prev,
      before,
      { timeout: 10000 },
    )
    actions.push(`${pr.mode === 'recruit' ? '招募' : '升级'}${pickKey}`)
  }
  return actions
}

function scoreTable(wave, hpRatio) {
  const early = wave <= 5
  const low = hpRatio < 0.6
  return {
    luckyCoin: early ? 90 : 45,
    magnetCoil: early ? 85 : 35,
    heavyArms: 70,
    marchFlag: 48,
    whetstone: 80,
    rageBracer: low ? 40 : 74,
    stimulant: 72,
    frostCore: 73,
    scope: 66,
    powerCell: 66,
    blastPowder: 66,
    longHaft: 62,
    lance: 62,
    returnString: 62,
    gemHeart: low ? 86 : 52,
    shellArmor: low ? 82 : 47,
    padHelmet: low ? 58 : 40,
    reviveWatch: 36,
  }
}

async function buyItems(lastCombat) {
  const bought = []
  for (let guard = 0; guard < 24; guard++) {
    const s = await shopState()
    const hpRatio = lastCombat ? lastCombat.hp / (lastCombat.alive * 100 || 1) : 1
    const table = scoreTable(s.wave, Math.min(1, hpRatio))
    const cands = s.slots
      .filter((x) => x.offer && x.price !== null && x.price <= s.coins)
      .sort((a, b) => (table[b.offer] ?? 10) - (table[a.offer] ?? 10))
    if (!cands.length) break
    const pick = cands[0]
    if (!(await focusSlot(pick.id))) break
    const coinsBefore = (await shopState()).coins
    const buy = await page.evaluate(() => window.__warmoji.shop.buy)
    if (!buy.enabled) continue
    await clickAt({ x: buy.x, y: buy.y })
    await page.waitForFunction((c) => (window.__warmoji?.shop?.coins ?? 99999) < c, coinsBefore, { timeout: 8000 })
    bought.push(pick.offer)
  }
  return bought
}

const levelHistory = []

async function shopPhase(lastCombat) {
  // 波末必进整编页：强制结算点数 + 队形环节，随后进商店
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' || (window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop),
  )
  const actions = await promotePhase()
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)
  const s0 = await shopState()
  const doneWave = s0.wave - 1
  levelHistory.push(s0.level)
  log('WAVE_END', {
    wave: doneWave,
    level: s0.level,
    kills: await page.evaluate(() => window.__warmoji.kills),
    coins: s0.coins,
    endHp: lastCombat ? `${lastCombat.hp}/${lastCombat.alive}人` : '?',
  })
  const bought = await buyItems(lastCombat)
  const after = await shopState()
  log('SHOP', {
    nextWave: after.wave,
    points: actions,
    items: bought.length,
    coinsLeft: after.coins,
  })
  const start = after.start
  await clickAt({ x: start.x, y: start.y })
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}

try {
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'angel')
  })
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await clickAt(await page.evaluate(() => window.__warmoji.menu.start))
  // 地图选择页：沿用记忆/默认地图直接确认
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map)
  await clickAt(await page.evaluate(() => window.__warmoji.map.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'captain')
  await clickAt(await page.evaluate(() => window.__warmoji.captain.start))
  // 开局整编：按心愿单强制招募（点数花完直接开战）
  await page.waitForFunction(() => window.__warmoji?.scene === 'promote' && !!window.__warmoji.promote)
  const starters = await promotePhase()
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
  log('START', { captain: 'angel', starters })

  const t0 = Date.now()
  let lastCombat = null
  const shots = new Set()
  for (;;) {
    if (Date.now() - t0 > 38 * 60_000) {
      log('DONE', { reason: '时间上限', levels: levelHistory })
      break
    }
    const st = await snapshot().catch(() => ({ scene: 'err' }))
    if (st.scene === 'arena') {
      lastCombat = { hp: Math.round(st.hp), alive: st.alive, fps: st.fps }
      // 战斗实拍：新敌人渐入的几个波次
      if ([3, 5, 7].includes(st.wave) && st.elapsed > 12 && !shots.has(st.wave)) {
        shots.add(st.wave)
        await page.screenshot({ path: `${OUT}/en-combat-w${st.wave}.png` })
      }
      await applyAngle(decide(st))
      await new Promise((r) => setTimeout(r, TICK))
    } else if (st.scene === 'shop' || st.scene === 'promote') {
      // 波末整编（招募/升级/队形）与商店都由 shopPhase 一体处理
      await releaseKeys()
      lastAngle = null
      await shopPhase(lastCombat)
    } else if (st.scene === 'result') {
      await releaseKeys()
      const fin = await page.evaluate(() => ({
        win: window.__warmoji.result?.win ?? false,
        wave: window.__warmoji.wave,
        kills: window.__warmoji.kills,
        level: window.__warmoji.level,
      }))
      await page.screenshot({ path: `${OUT}/en-result.png` })
      log('RESULT', fin)
      log('DONE', { reason: fin.win ? '通关' : '全灭', levels: levelHistory })
      break
    } else {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
} catch (err) {
  log('ERR', { message: String(err).slice(0, 300) })
} finally {
  await releaseKeys().catch(() => {})
  await browser.close()
  try {
    process.kill(-server.pid)
  } catch {
    /* 服务可能已退出 */
  }
}
