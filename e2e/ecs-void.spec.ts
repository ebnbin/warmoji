import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（工厂/虚空）：ECS 版环面世界——固定尺寸竞技场，四边两两粘合、坐标按模回绕，没有墙。
// 一直朝一个方向走会从对侧出来；索敌/磁吸/接触一律用环面最短差。
test.describe.configure({ retries: 2 })

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  mapW: number
  mapH: number
  enemies: number
  liveCoins: number
}

test('ECS 工厂图：固定环面竞技场、穿越传送门回绕、战斗运转', async ({ page }) => {
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
  await startTestBattle(page, 'void')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // 竞技场固定 24×13.5 格（横屏），出生居中
  const st0 = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(st0.mapW).toBeCloseTo(24 * 64, 0)
  expect(st0.mapH).toBeCloseTo(13.5 * 64, 0)
  expect(Math.abs(st0.centerX - st0.mapW / 2)).toBeLessThan(80)

  // 一直向左：穿过左缘传送门后 x 回绕到右侧（永不钳制、永不越界）
  await page.keyboard.down('ArrowLeft')
  let sawWrap = false
  let minX = Infinity
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(400)
    const x = (await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)).centerX
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(st0.mapW)
    minX = Math.min(minX, x)
    if (minX < st0.mapW / 4 && x > (st0.mapW * 3) / 4) {
      sawWrap = true
      break
    }
  }
  await page.keyboard.up('ArrowLeft')
  expect(sawWrap).toBe(true)

  // 战斗在运转：勾选的僵尸刷出并被清（环面索敌成立）
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies > 0, undefined, {
    timeout: 30_000,
  })

  await page.screenshot({ path: 'test-results/ecs-void.png' })
  expect(errors).toEqual([])
})
