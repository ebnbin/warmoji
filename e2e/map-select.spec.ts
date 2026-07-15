import { expect, test } from '@playwright/test'
import { clickMap, confirmMap, enterMap } from './helpers'

test('地图选择：三张主题图、选择持久化、开局进入所选地图', async ({ page }) => {
  await page.goto('/')
  await enterMap(page)

  // 三张图齐备，默认选中首图
  const info = await page.evaluate(() => ({
    items: window.__warmoji!.map!.items.map((i) => i.id),
    selected: window.__warmoji!.map!.selected,
  }))
  expect(info.items).toEqual(['forest', 'desert', 'snow'])
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
  for (let i = 0; i < 24; i++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji!.scene,
      c: window.__warmoji!.promote?.confirm,
      points: window.__warmoji!.promote?.points ?? 0,
    }))
    if (st.scene !== 'promote') break
    await page
      .locator('#game canvas')
      .click({ position: { x: Math.round(st.c!.x * k), y: Math.round(st.c!.y * k) } })
    await page.waitForFunction(
      (prev) =>
        window.__warmoji?.scene !== 'promote' || (window.__warmoji.promote?.points ?? 99) < prev,
      st.points,
      { timeout: 15_000 },
    )
  }
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
  await page.waitForFunction(() => window.__warmoji?.mapId === 'desert')
})
