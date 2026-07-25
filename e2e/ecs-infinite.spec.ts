import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P5（荒漠·无限世界）：ECS 版无界图——出生在原点、负坐标合法、相机不设 bounds 只管跟人；
// 刷怪落在队伍中心外的环带；远离队伍的敌人休眠（冻结 AI、不占刷怪上限），回到活跃范围自然接管。

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  camX: number
  dormant: number
  enemies: number
  enemyPos: { x: number; y: number }[]
}

test('ECS 无限图：出生在原点、走进负坐标不被钳制、远处敌人休眠', async ({ page }) => {
  test.setTimeout(120_000)
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
  await startTestBattle(page, 'desert')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // ① 出生在原点（有界图在图心，无限图没有图心）
  const born = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(Math.abs(born.centerX)).toBeLessThan(80)
  expect(Math.abs(born.centerY)).toBeLessThan(80)

  // ② 环带刷怪：勾选的僵尸陆续在队伍中心外圈登场
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies > 0, undefined, {
    timeout: 25_000,
  })

  // ③ 无边界：一路向左穿过原点走进负坐标（有界图会被钳在半格处），相机跟进
  await page.keyboard.down('ArrowLeft')
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.centerX < -400, undefined, {
    timeout: 25_000,
  })
  await page.keyboard.up('ArrowLeft')
  const moved = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(moved.camX).toBeLessThan(0)
  expect(Math.abs(moved.camX - moved.centerX)).toBeLessThan(80)

  // ④ 休眠：把一只敌人丢到活跃方形（半边长 32 格）之外，它该冻结不动
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 60, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.dormant >= 1, undefined, {
    timeout: 15_000,
  })
  // 取离队伍最远的那只（即刚投放的休眠者）的位置，隔一段时间应纹丝不动
  const farthest = (): { x: number; y: number } => {
    const d = (window as unknown as { __ecs: EcsDbg }).__ecs
    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - d.centerX, p.y - d.centerY)
    return d.enemyPos.reduce((a, b) => (dist(b) > dist(a) ? b : a))
  }
  const p0 = await page.evaluate(farthest)
  await page.waitForTimeout(1500)
  const p1 = await page.evaluate(farthest)
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(1)

  await page.screenshot({ path: 'test-results/ecs-infinite.png' })
  expect(errors).toEqual([])
})
