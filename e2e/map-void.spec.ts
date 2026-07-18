import { expect, test } from '@playwright/test'
import { clickMap, completePromote, confirmCaptain, confirmMap, enterMap } from './helpers'

// 重竞技场场景：软渲染 + 并行争抢下墙钟不稳，放宽预算并允许重试
test.describe.configure({ retries: 2 })

test('虚空地图：固定环面竞技场、穿越传送门回绕、战斗运转', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await enterMap(page)
  await clickMap(page, 'void')
  await confirmMap(page)
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'arena' && window.__warmoji.mapId === 'void',
  )

  // 竞技场固定 24×13.5 格（横屏），出生居中，相机静止
  const st0 = await page.evaluate(() => ({
    viewW: window.__warmoji!.viewW,
    viewH: window.__warmoji!.viewH,
    camX: window.__warmoji!.camX,
    camY: window.__warmoji!.camY,
  }))
  expect(st0.viewW).toBeCloseTo(24 * 64, 0)
  expect(st0.viewH).toBeCloseTo(13.5 * 64, 0)

  // 一直向左：穿过左缘传送门后 x 回绕到右侧（永不钳制、永不越界）
  await page.keyboard.down('ArrowLeft')
  let sawWrap = false
  let minX = Infinity
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(400)
    const d = await page.evaluate(() => ({
      x: window.__warmoji!.playerX,
      scene: window.__warmoji!.scene,
    }))
    if (d.scene !== 'arena') break
    expect(d.x).toBeGreaterThanOrEqual(0)
    expect(d.x).toBeLessThanOrEqual(st0.viewW)
    minX = Math.min(minX, d.x)
    if (minX < st0.viewW / 4 && d.x > (st0.viewW * 3) / 4) {
      sawWrap = true
      break
    }
  }
  await page.keyboard.up('ArrowLeft')
  expect(sawWrap).toBe(true)

  // 战斗在运转 + 相机全程静止
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 30_000,
  })
  const st1 = await page.evaluate(() => ({
    camX: window.__warmoji!.camX,
    camY: window.__warmoji!.camY,
  }))
  expect(Math.abs(st1.camX - st0.camX)).toBeLessThan(24)
  expect(Math.abs(st1.camY - st0.camY)).toBeLessThan(24)
})
