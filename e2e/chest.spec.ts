import { expect, test, type Page } from '@playwright/test'
import { completePromote, drainCards, startRun } from './helpers'

// 存活到波末受随机刷怪影响，慢渲染环境下偶发全灭，允许重试（同 wave.spec）
test.describe.configure({ retries: 2 })

/** 按逻辑坐标点击 canvas（canvas CSS 尺寸 = 窗口尺寸） */
async function clickLogical(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(
    ({ x, y }) => {
      const k = window.innerWidth / window.__warmoji!.viewW
      return { x: Math.round(x * k), y: Math.round(y * k) }
    },
    { x, y },
  )
  await page.locator('#game canvas').click({ position: p })
}

test('宝箱：战斗后进开箱页，可应用给角色或丢弃返半价，全开完进正常流程', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.addInitScript(() => localStorage.setItem('warmoji.captain.v1', 'moneybags'))
  await page.goto('/')
  await startRun(page)

  // 战斗中塞两个已知宝箱（都是角色装备）：gemHeart 应用给角色 + whetstone 丢弃返金币。
  // 拾取只收集不生效——战斗结束才进开箱页
  await page.evaluate(() => {
    window.__addChest!('gemHeart')
    window.__addChest!('whetstone')
  })

  // 走位撑到波末：拾了宝箱 → 波末先升级抽卡、再进开箱页
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1400)
    await page.keyboard.up(key)
  }
  // 先抽完升级卡，再落到开箱页
  await drainCards(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'chests', undefined, {
    timeout: 15_000,
  })

  // 第一个宝箱 = gemHeart：通用道具，全部角色可选（含槽位 0），只列角色（无 -1）
  let c = await page.evaluate(() => window.__warmoji!.chests!)
  expect(c.item).toBe('gemHeart')
  expect(c.targets.some((t) => t.slot === 0)).toBe(true)
  expect(c.targets.every((t) => t.slot >= 0)).toBe(true)
  const remain0 = c.remaining
  // 应用给槽位 0（开局那名角色）
  const t0 = c.targets.find((t) => t.slot === 0)!
  await clickLogical(page, t0.x + t0.w / 2, t0.y + t0.h / 2)
  await page.waitForFunction((r) => (window.__warmoji?.chests?.remaining ?? 0) < r, remain0)

  // 第二个宝箱 = whetstone：丢弃返当前波次价一半金币
  c = await page.evaluate(() => window.__warmoji!.chests!)
  expect(c.item).toBe('whetstone')
  const coinsBefore = await page.evaluate(() => window.__warmoji!.coins!)
  const refund = c.discard.refund
  expect(refund).toBeGreaterThan(0)
  await clickLogical(page, c.discard.x, c.discard.y)
  await page.waitForFunction((n) => window.__warmoji?.coins === n, coinsBefore + refund)

  // 剩余（若有随机掉落的）宝箱统一开完：有目标就应用，否则丢弃
  for (let i = 0; i < 12; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'chests') break
    const cc = await page.evaluate(() => window.__warmoji!.chests!)
    const before = cc.remaining
    if (cc.targets.length > 0) {
      const t = cc.targets[0]!
      await clickLogical(page, t.x + t.w / 2, t.y + t.h / 2)
    } else {
      await clickLogical(page, cc.discard.x, cc.discard.y)
    }
    await page.waitForFunction(
      (b) => window.__warmoji?.scene !== 'chests' || (window.__warmoji?.chests?.remaining ?? 0) < b,
      before,
    )
  }

  // 全部开完 → 正常下一站：波 1 末有招募名额，进整编页
  await page.waitForFunction(() => window.__warmoji?.scene !== 'chests')
  expect(await page.evaluate(() => window.__warmoji?.scene)).toBe('promote')

  // 应用确实落到了角色身上：走到商店后，某个角色的持有道具数 ≥ 1（本局未购物）
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop', undefined, { timeout: 20_000 })
  const maxOwned = await page.evaluate(() =>
    window
      .__warmoji!.shop!.slots.filter((s) => s.id !== 'captain')
      .reduce((m, s) => Math.max(m, s.owned), 0),
  )
  expect(maxOwned).toBeGreaterThanOrEqual(1)

  expect(errors).toEqual([])
})
