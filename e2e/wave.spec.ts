import { expect, test } from '@playwright/test'
import {
  clickShopBuy,
  clickShopCandidate,
  clickShopNext,
  clickShopRefresh,
  clickShopSlot,
  clickShopUpgrade,
  startRun,
} from './helpers'

// 存活 30 秒受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('波次循环：单人首发 → 商店购买/刷新/招募/升级 → 下一波扩编上场', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // 预选财迷队长（验证免费刷新）+ 牛仔首发（单人输出稳）
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'moneybags')
    localStorage.setItem('warmoji.lineup.v1', JSON.stringify(['cowboy']))
  })
  await page.goto('/')
  await startRun(page)
  const alive0 = await page.evaluate(() => window.__warmoji!.alive)
  expect(alive0).toBe(1)

  // 站桩会被围死：小步绕圈走位撑到波次结束
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'shop') break
    expect(scene, '波次中途不应全灭或离开战斗').toBe('arena')
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1400)
    await page.keyboard.up(key)
  }
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop', undefined, {
    timeout: 15_000,
  })

  // 商店：战果带入；击杀+波末保底经验应至少升到 2 级（= 至少 1 个可用点数）
  let shop = await page.evaluate(() => window.__warmoji!.shop!)
  expect(shop.wave).toBe(2)
  expect(shop.coins).toBeGreaterThanOrEqual(1)
  expect(shop.freeRefreshes).toBe(3)
  expect(shop.level).toBeGreaterThanOrEqual(2)
  expect(shop.points).toBeGreaterThanOrEqual(1)

  // 上架位 = 队长 + 1 名队员 + 招募位
  expect(shop.slots.map((s) => s.id)).toEqual(['captain', 'cowboy', 'recruit'])
  expect(shop.slots[1]!.offer).not.toBeNull()
  expect(shop.slots[1]!.memberLevel).toBe(1)

  // 注入经验保证招募+升级都可测（走正常升级结算）；点一下槽位触发重绘
  await page.evaluate(() => window.__addXp!(600))
  await clickShopSlot(page, 'cowboy')
  await page.waitForFunction(() => (window.__warmoji?.shop?.points ?? 0) >= 2)

  // 升级：牛仔 Lv.1 → Lv.2，点数 -1
  const beforeUp = await page.evaluate(() => window.__warmoji!.shop!)
  expect(beforeUp.upgrade.enabled).toBe(true)
  await clickShopUpgrade(page)
  await page.waitForFunction(
    (want) => window.__warmoji?.shop?.slots.find((s) => s.id === 'cowboy')?.memberLevel === want,
    2,
  )
  const afterUp = await page.evaluate(() => window.__warmoji!.shop!)
  expect(afterUp.points).toBe(beforeUp.points - 1)

  // 招募：聚焦招募位 → 挑法师 → 招募成功后法师占据新槽位（带上架道具）
  await clickShopSlot(page, 'recruit')
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedId === 'recruit')
  await clickShopCandidate(page, 'mage')
  await page.waitForFunction(() => window.__warmoji?.shop?.recruit.selected === 'mage')
  await clickShopBuy(page)
  await page.waitForFunction(() =>
    window.__warmoji?.shop?.slots.some((s) => s.id === 'mage'),
  )
  shop = await page.evaluate(() => window.__warmoji!.shop!)
  expect(shop.slots.map((s) => s.id)).toEqual(['captain', 'cowboy', 'mage', 'recruit'])
  expect(shop.points).toBe(afterUp.points - 1)
  expect(shop.slots.find((s) => s.id === 'mage')!.offer).not.toBeNull()

  // 注入金币走道具购买：扣款、持有 +1、自动补货
  await page.evaluate(() => window.__addCoins!(200))
  await clickShopSlot(page, 'mage')
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedId === 'mage')
  await clickShopRefresh(page) // 免费刷新一次触发重绘同步金币
  await page.waitForFunction(() => window.__warmoji?.shop?.freeRefreshes === 2)
  const before = await page.evaluate(() => window.__warmoji!.shop!)
  const slot = before.slots.find((s) => s.id === 'mage')!
  expect(before.buy.enabled).toBe(true)
  await clickShopBuy(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, before.coins - slot.price!)
  const bought = await page.evaluate(() => window.__warmoji!.shop!)
  const slotAfter = bought.slots.find((s) => s.id === 'mage')!
  expect(slotAfter.owned).toBe(slot.owned + 1)
  expect(slotAfter.offer, '购买后自动补货').not.toBeNull()
  await page.screenshot({ path: 'test-results/shop.png' })

  // 用完剩余免费刷新（不扣钱），再刷新一次转为付费（扣 2 金币）
  for (let n = 2; n > 0; n--) {
    await clickShopRefresh(page)
    await page.waitForFunction((exp) => window.__warmoji?.shop?.freeRefreshes === exp, n - 1)
  }
  const paidBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidBefore).toBe(bought.coins)
  await clickShopRefresh(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, paidBefore - 2)

  // 继续下一波：扩编后 2 人上场，金币与击杀延续
  const coinsIntoWave = paidBefore - 2
  const killsBefore = await page.evaluate(() => window.__warmoji!.kills)
  await clickShopNext(page)
  await page.waitForFunction(() => (window.__warmoji?.wave ?? 0) === 2)
  const start2 = await page.evaluate(() => window.__warmoji!)
  expect(start2.alive).toBe(2)
  expect(start2.coins ?? 0).toBeGreaterThanOrEqual(coinsIntoWave)
  await page.waitForFunction((k) => (window.__warmoji?.kills ?? 0) > k, killsBefore, {
    timeout: 20_000,
  })
  expect(errors).toEqual([])
})
