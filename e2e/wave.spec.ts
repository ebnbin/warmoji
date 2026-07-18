import { expect, test } from '@playwright/test'
import {
  clickCaptain,
  clickFormationMember,
  clickPromoteConfirm,
  clickPromoteItem,
  clickShopBuy,
  clickShopNext,
  clickShopRefresh,
  clickShopSlot,
  completePromote,
  confirmCaptain,
  enterCaptain,
  startRun,
} from './helpers'

// 存活 30 秒受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('波次循环：波末固定招募 1 人 → 商店购物 → 下一波扩编上场', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // 预选财迷队长（验证免费刷新）；开局整编默认招募第一位候选
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'moneybags')
  })
  await page.goto('/')
  await startRun(page)
  const alive0 = await page.evaluate(() => window.__warmoji!.alive)
  expect(alive0).toBe(1)

  // 站桩会被围死：小步绕圈走位撑到波次结束
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'promote' || scene === 'shop') break
    expect(scene, '波次中途不应全灭或离开战斗').toBe('arena')
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1400)
    await page.keyboard.up(key)
  }

  // 波末必进整编页：本波 1 个招募名额；第 2 波解锁 6 张、1 张已入队
  await page.waitForFunction(() => window.__warmoji?.scene === 'promote', undefined, {
    timeout: 15_000,
  })
  const promote = await page.evaluate(() => window.__warmoji!.promote!)
  expect(promote.mode).toBe('recruit')
  expect(promote.due).toBe(1)
  expect(promote.items).toHaveLength(10)
  expect(promote.items.filter((i) => i.state === 'open')).toHaveLength(5)
  expect(promote.items.filter((i) => i.state === 'taken')).toHaveLength(1)
  const recruitId = promote.items.find((i) => i.state === 'open')!.id
  await clickPromoteItem(page, recruitId)
  await page.waitForFunction(
    (id) => (window.__warmoji?.promote?.picked ?? []).includes(id),
    recruitId,
  )
  await page.screenshot({ path: 'test-results/promote-done.png' })
  await clickPromoteConfirm(page)

  // 名额用完直接进商店：上架位 = 队长 + 2 名队员，新队员在列
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)
  const shop = await page.evaluate(() => window.__warmoji!.shop!)
  expect(shop.wave).toBe(2)
  expect(shop.freeRefreshes).toBe(3)
  expect(shop.slots).toHaveLength(3)
  expect(shop.slots.map((s) => s.id)).toContain(recruitId)
  expect(shop.slots[1]!.offer).not.toBeNull()

  // 注入金币走道具购买：扣款、持有 +1、自动补货
  await page.evaluate(() => window.__addCoins!(200))
  await clickShopSlot(page, recruitId)
  await page.waitForFunction((id) => window.__warmoji?.shop?.focusedId === id, recruitId)
  await clickShopRefresh(page) // 免费刷新一次触发重绘同步金币
  await page.waitForFunction(() => window.__warmoji?.shop?.freeRefreshes === 2)
  const before = await page.evaluate(() => window.__warmoji!.shop!)
  const slot = before.slots.find((s) => s.id === recruitId)!
  expect(before.buy.enabled).toBe(true)
  await clickShopBuy(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, before.coins - slot.price!)
  const bought = await page.evaluate(() => window.__warmoji!.shop!)
  const slotAfter = bought.slots.find((s) => s.id === recruitId)!
  expect(slotAfter.owned).toBe(slot.owned + 1)
  expect(slotAfter.offer, '购买后自动补货').not.toBeNull()
  await page.screenshot({ path: 'test-results/shop.png' })

  // 用完剩余免费刷新（不扣钱），再刷新一次转为付费
  for (let n = 2; n > 0; n--) {
    await clickShopRefresh(page)
    await page.waitForFunction((exp) => window.__warmoji?.shop?.freeRefreshes === exp, n - 1)
  }
  const paidBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidBefore).toBe(bought.coins)
  await clickShopRefresh(page)
  await page.waitForFunction((exp) => (window.__warmoji?.shop?.coins ?? -1) < exp, paidBefore)
  const paidAfter = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidAfter).toBeLessThan(paidBefore)

  // 继续下一波：扩编 2 人上场，金币与击杀延续
  const coinsIntoWave = paidAfter
  const killsBefore = await page.evaluate(() => window.__warmoji!.kills)
  await clickShopNext(page)
  await page.waitForFunction(() => (window.__warmoji?.wave ?? 0) === 2)
  const start2 = await page.evaluate(() => window.__warmoji!)
  expect(start2.alive).toBe(2)
  expect(start2.coins).toBe(coinsIntoWave)
  expect(start2.kills).toBe(killsBefore)
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

test('满员阵型：神童自选招满 → 阵型首秀选中心 → 互换稳定次序 → 满员上场', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'prodigy')
  })
  await page.goto('/')
  await enterCaptain(page)
  await clickCaptain(page, 'prodigy')
  await confirmCaptain(page)

  // 开局整编一次给足 5 个名额：开放 5 人 → 命定十卡全解锁，点前 5 张入伍
  //（顺序即槽位，1 号位 = 默认中心；卡池随机，全部按调试载荷动态取）
  const p0 = await page.evaluate(() => window.__warmoji!.promote!)
  expect(p0.mode).toBe('recruit')
  expect(p0.due).toBe(5)
  expect(p0.items).toHaveLength(10)
  expect(p0.items.every((i) => i.state === 'open')).toBe(true)
  expect(p0.confirm.enabled).toBe(false)
  const picks = p0.items.slice(0, 5).map((i) => i.id)
  for (const id of picks) {
    await clickPromoteItem(page, id)
    await page.waitForFunction(
      (k) => (window.__warmoji?.promote?.picked ?? []).includes(k),
      id,
    )
  }
  await page.waitForFunction(() => window.__warmoji?.promote?.confirm.enabled === true)
  await clickPromoteConfirm(page)

  // 满员自动进入阵型首秀（N 保 1），默认中心 = 1 号位（首个点选者）
  await page.waitForFunction(() => window.__warmoji?.promote?.mode === 'formation')
  const f0 = await page.evaluate(() => window.__warmoji!.promote!)
  expect(f0.mode).toBe('formation')
  expect(f0.formation!.center).toBe(picks[0])
  expect(f0.items).toHaveLength(5)
  const order0 = f0.items.map((i) => i.id)
  const swapTo = picks[1]!
  await clickFormationMember(page, swapTo)
  // 稳定次序：互换只动新中心与旧中心两人，其他外圈不跳位
  const order1 = await page.evaluate(() => window.__warmoji!.promote!.items.map((i) => i.id))
  expect(order1).toEqual([
    swapTo,
    ...order0.slice(1).map((id) => (id === swapTo ? picks[0]! : id)),
  ])
  await completePromote(page)
  // 神童自带启动资金：开战前先过一次商店
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop')
  await clickShopNext(page)
  await page.waitForFunction(() => window.__warmoji?.alive === 5)
  const st = await page.evaluate(() => ({
    wave: window.__warmoji!.wave,
    formation: window.__warmoji!.formation,
  }))
  expect(st.wave).toBe(15)
  expect(st.formation).toBe('guard')
})
