import { expect, test } from '@playwright/test'
import { clickMap, completePromote, confirmMap, enterMap } from './helpers'

test('地图选择：五张玩法图、选择持久化、开局进入所选地图', async ({ page }) => {
  await page.goto('/')
  await enterMap(page)

  // 五张图齐备（一种玩法一个主题），默认选中首图
  const info = await page.evaluate(() => ({
    items: window.__warmoji!.map!.items.map((i) => i.id),
    selected: window.__warmoji!.map!.selected,
  }))
  expect(info.items).toEqual(['forest', 'desert', 'river', 'void', 'metronome'])
  expect(info.selected).toBe('forest')

  // 选荒漠 → 持久化 → 刷新页面后仍记住
  await clickMap(page, 'desert')
  await page.reload()
  await enterMap(page)
  await page.waitForFunction(() => window.__warmoji?.map?.selected === 'desert')

  // 确认 → 队长页；返回键回到地图页（流程：菜单 → 地图 → 队长）
  await confirmMap(page)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__warmoji?.scene === 'map')
  await confirmMap(page)

  // 快速开一局，战斗场景运行在所选地图上
  const start = await page.evaluate(() => window.__warmoji!.captain!.start)
  const k = await page.evaluate(() => window.innerWidth / window.__warmoji!.viewW)
  await page
    .locator('#game canvas')
    .click({ position: { x: Math.round(start.x * k), y: Math.round(start.y * k) } })
  await page.waitForFunction(() => window.__warmoji?.scene === 'promote')
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
  await page.waitForFunction(() => window.__warmoji?.mapId === 'desert')
})
