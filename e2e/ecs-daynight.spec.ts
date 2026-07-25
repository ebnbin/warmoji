import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（晨昏原野）：ECS 版昼夜图——相机随跨波时钟平滑缩放（正午视野最大→zoom 最小；
// 午夜视野最小→zoom 最大），夜里罩以队伍为心的迷雾（反相遮罩挖洞）。
// 用快进 combatMs 定点校验各时刻的相机缩放与夜雾开合，与旧图 e2e 同口径。

type DnScene = { run: { combatMs: number }; cameras: { main: { zoom: number } } }
type DnGame = { scene: { getScene(k: string): DnScene } }

test('ECS 昼夜图：相机随时钟涨落、夜幕起迷雾，战斗运转无报错', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
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
  await page.evaluate(() => window.__ecsLabRoster!(['juggler']))
  await enterMap(page)
  await startTestBattle(page, 'daynight')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: { ready: boolean } }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  const probe = async (combatMs: number): Promise<{ zoom: number; fog: boolean }> => {
    await page.evaluate((m) => {
      ;(window.__game as unknown as DnGame).scene.getScene('ecsArena').run.combatMs = m
    }, combatMs)
    await page.waitForTimeout(500)
    return page.evaluate(() => {
      const s = (window.__game as unknown as DnGame).scene.getScene('ecsArena')
      const fogRect = (s as unknown as { fogRect?: { visible: boolean } }).fogRect
      return { zoom: s.cameras.main.zoom, fog: fogRect?.visible ?? false }
    })
  }

  const noon = await probe(12000) // 12:00 视野最大 → zoom 最小
  const dusk = await probe(24000) // 18:00 标准视野
  const midnight = await probe(36000) // 00:00 视野最小 → zoom 最大

  expect(noon.zoom).toBeLessThan(dusk.zoom)
  expect(dusk.zoom).toBeLessThan(midnight.zoom)
  expect(midnight.zoom / noon.zoom).toBeGreaterThan(1.8)
  // 白天无雾、午夜有雾
  expect(noon.fog).toBe(false)
  expect(midnight.fog).toBe(true)
  await page.screenshot({ path: 'test-results/ecs-daynight.png' })

  expect(errors).toEqual([])
})
