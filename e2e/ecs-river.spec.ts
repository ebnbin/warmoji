import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（奔流）：ECS 版河流图——单屏固定相机 + 恒定水流（万物随波逐流）。
// 挂机被水流推向下游并卡在河道边；队伍始终钳在河道内；相机纹丝不动。
test.describe.configure({ retries: 2 })

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  camX: number
  camY: number
  mapW: number
  mapH: number
  enemies: number
}

test('ECS 奔流图：固定相机 + 挂机被水流推向下游卡边、队伍不出河道', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await page.evaluate(() => window.__ecsLabRoster!(['juggler'], ['zombie']))
  await enterMap(page)
  await startTestBattle(page, 'river')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  const born = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  // 单屏世界：出生在视口中心，相机居中锁死
  expect(Math.abs(born.centerX - born.mapW / 2)).toBeLessThan(80)
  expect(Math.abs(born.camX - born.mapW / 2)).toBeLessThan(4)

  // 挂机（无输入）：水流把队伍推向下游（横屏 = 向左）
  await page.waitForFunction(
    (x0) => (window as unknown as { __ecs: EcsDbg }).__ecs.centerX < x0 - 60,
    born.centerX,
    { timeout: 45_000 },
  )

  // 战斗在运转：勾选的僵尸在河道里刷出
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies > 0, undefined, {
    timeout: 30_000,
  })

  // 顶着下游按左：卡在河道上游边，不会穿出边界
  await page.keyboard.down('ArrowLeft')
  let last = Infinity
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(800)
    const x = (await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)).centerX
    if (Math.abs(x - last) < 3 && x < 400) break
    last = x
  }
  await page.keyboard.up('ArrowLeft')

  const st = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(st.centerX).toBeGreaterThan(0)
  expect(st.centerX).toBeLessThan(st.mapW / 4)
  // 队伍中心始终在河道内（跨向 = 竖直，河道居中宽 12 格）
  expect(Math.abs(st.centerY - st.mapH / 2)).toBeLessThanOrEqual(6 * 64)
  // 相机自始至终纹丝不动（受击抖动留容差）
  expect(Math.abs(st.camX - born.camX)).toBeLessThan(40)
  expect(Math.abs(st.camY - born.camY)).toBeLessThan(40)

  await page.screenshot({ path: 'test-results/ecs-river.png' })
  expect(errors).toEqual([])
})
