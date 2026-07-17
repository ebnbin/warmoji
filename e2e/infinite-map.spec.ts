import { expect, test } from '@playwright/test'
import { clickMap, completePromote, confirmCaptain, confirmMap, enterMap } from './helpers'

test('无限地图：进入无界竞技场，战斗运转，移动/相机无边界钳制', async ({ page }) => {
  await page.goto('/')
  await enterMap(page)
  await clickMap(page, 'wilds')
  await confirmMap(page)
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'arena' && window.__warmoji.mapId === 'wilds',
  )

  // 战斗在运转：敌人刷出（环带采样围绕队伍）
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 20_000,
  })

  // 无边界：出生在原点，一路向左穿过原点走进负坐标（有界图会被钳在半格处）
  await page.keyboard.down('ArrowLeft')
  await page.waitForFunction(() => (window.__warmoji?.playerX ?? 0) < -200, undefined, {
    timeout: 15_000,
  })
  await page.keyboard.up('ArrowLeft')

  // 相机跟进负坐标区域（未设 bounds），休眠计数已在上报
  const st = await page.evaluate(() => ({
    playerX: window.__warmoji!.playerX,
    camX: window.__warmoji!.camX,
    dormant: window.__warmoji!.dormant,
  }))
  expect(st.camX).toBeLessThan(0)
  expect(Math.abs(st.camX - st.playerX)).toBeLessThan(50)
  expect(st.dormant).toBeGreaterThanOrEqual(0)
})
