import { expect, test } from '@playwright/test'
import { clickMap, completePromote, confirmCaptain, confirmMap, enterMap } from './helpers'

// 重竞技场场景：软渲染 + 多 worker 争抢下墙钟极不稳定，放宽预算并允许重试
test.describe.configure({ retries: 2 })

test('河流地图：单屏固定相机、挂机被水流推向下游卡边、战斗运转', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await enterMap(page)
  await clickMap(page, 'river')
  await confirmMap(page)
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'arena' && window.__warmoji.mapId === 'river',
  )

  // 相机静止：出生即视口中心，且始终不动
  const cam0 = await page.evaluate(() => ({
    x: window.__warmoji!.camX,
    y: window.__warmoji!.camY,
  }))

  // 挂机（无输入）：水流 0.5 格/秒把队伍推向下游（横屏 = 向左）
  const x0 = await page.evaluate(() => window.__warmoji!.playerX)
  await page.waitForFunction(
    (prev) => (window.__warmoji?.playerX ?? 1e9) < prev - 60,
    x0,
    { timeout: 45_000 },
  )

  // 战斗在运转：敌人刷出
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 30_000,
  })

  // 顶着下游按左：直到位置稳定（卡边），不会穿出边界
  await page.keyboard.down('ArrowLeft')
  let last = Infinity
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000)
    const x = await page.evaluate(() => window.__warmoji!.playerX)
    if (Math.abs(x - last) < 3 && x < 400) break
    last = x
  }
  await page.keyboard.up('ArrowLeft')
  const st = await page.evaluate(() => ({
    playerX: window.__warmoji!.playerX,
    playerY: window.__warmoji!.playerY,
    camX: window.__warmoji!.camX,
    camY: window.__warmoji!.camY,
    viewW: window.__warmoji!.viewW,
    viewH: window.__warmoji!.viewH,
  }))
  expect(st.playerX).toBeGreaterThan(0)
  expect(st.playerX).toBeLessThan(st.viewW / 4)
  // 队伍中心始终在河道内（跨向 = 竖直方向，河道居中宽 12 格 = 768px）
  expect(Math.abs(st.playerY - st.viewH / 2)).toBeLessThanOrEqual(384)
  // 相机自始至终纹丝不动（战斗受击抖动留少量容差）
  expect(Math.abs(st.camX - cam0.x)).toBeLessThan(24)
  expect(Math.abs(st.camY - cam0.y)).toBeLessThan(24)
})
