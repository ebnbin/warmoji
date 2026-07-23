import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  clickCaptain,
  clickShopNext,
  completePromote,
  confirmCaptain,
  drainCards,
  enterCaptain,
} from './helpers'

// 软渲染 + 并行争抢下墙钟不稳；技能冷却走游戏时钟，等待全用轮询
test.describe.configure({ retries: 2 })

/** 站桩会被围死：等待期间穿插绕圈走位保命 */
const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
async function kiteStep(page: Page, i: number): Promise<void> {
  const key = KEYS[i % 4]!
  await page.keyboard.down(key)
  await page.waitForTimeout(900)
  await page.keyboard.up(key)
}

/** 本波剩余毫秒（读战斗场景的 HUD 快照；不在战斗中返回 0） */
async function waveRemainMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { hudSnapshot?: () => { remainMs: number } }> }
    }
    return game?.scene?.keys?.['arena']?.hudSnapshot?.().remainMs ?? 0
  })
}

test('队长主动技能：纯 CD 门槛，开局即可放、释放进入冷却、剩余冷却跨波保留', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await enterCaptain(page)
  // 财迷 CD 最短（20s）：本波偏末释放，跨一波还能看见剩余冷却
  await clickCaptain(page, 'moneybags')
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena' && !!window.__warmoji.skill)

  // 开局：纯 CD 门槛，CD 即就绪、可立即释放（不再依赖能量豆）
  const st0 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st0.remainMs).toBe(0)
  expect(st0.ready).toBe(true)

  // 掐在本波剩余 3~13 秒时释放：保证满额 CD（20s）跨到下一波仍有剩余
  let cast = false
  for (let i = 0; i < 60; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    const remain = await waveRemainMs(page)
    if (remain <= 13_000 && remain >= 3_000) {
      await page.keyboard.press('e')
      cast = true
      break
    }
    await kiteStep(page, i)
  }
  expect(cast).toBe(true)
  // 释放 → 进入满额冷却（> 15s）
  await page.waitForFunction(() => (window.__warmoji?.skill?.remainMs ?? 0) > 15_000, undefined, {
    timeout: 8000,
  })

  // 跨波保留：打完本波穿过升级/开箱/整编/商店回战斗，剩余冷却带着上一波已消耗的进度
  //（若被错误重置会是 0 或满额 20s，都落在断言区间外）
  const waveCast = await page.evaluate(() => window.__warmoji!.wave!)
  for (let i = 0; i < 40; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    await kiteStep(page, i)
  }
  for (let i = 0; i < 12; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'arena') break
    if (scene === 'cards') await drainCards(page)
    else if (scene === 'promote') await completePromote(page)
    else if (scene === 'shop') await clickShopNext(page)
    else await page.waitForTimeout(400)
  }
  await page.waitForFunction(
    (w) => window.__warmoji?.scene === 'arena' && (window.__warmoji.wave ?? 0) === w + 1,
    waveCast,
    { timeout: 30_000 },
  )
  const st1 = await page.evaluate(() => window.__warmoji!.skill!)
  expect(st1.remainMs).toBeGreaterThan(500)
  expect(st1.remainMs).toBeLessThan(19_500)
})
