import { expect, test } from '@playwright/test'
import { enterLab, enterMap } from './helpers'

// 慢渲染环境下移动量平滑/敌人刷新有抖动，允许重试
test.describe.configure({ retries: 2 })

// 时停技能 = 「秒针」机制窗口化：窗口内动则时行、静则时停；窗口外恒常速。
// 时标随移动量的爬升/回落是低通平滑，帧率越低越慢——故用 waitForFunction 轮询到位，
// 而非「固定等待 + 严格阈值」（后者在双 worker 低帧环境下会抖）。
test('时停：窗口内静则冻结、动则恢复；窗口外常速', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'forest')
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
  await page.evaluate(() => {
    window.__arena = () => (window.__game as { scene: { getScene: (k: string) => unknown } }).scene.getScene('arena')
  })

  const scale = (): Promise<number> =>
    page.evaluate(() => (window.__arena() as { worldTimeScale: () => number }).worldTimeScale())
  const waitScale = (cmp: '<' | '>', v: number): Promise<unknown> =>
    page.waitForFunction(
      ([c, t]) => {
        const s = (window.__arena() as { worldTimeScale: () => number }).worldTimeScale()
        return c === '<' ? s < (t as number) : s > (t as number)
      },
      [cmp, v] as const,
      { timeout: 15_000 },
    )

  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__spawnEnemy!('zombie', 8, 0))
  await page.waitForTimeout(400)

  // 窗口外：恒常速（即便静止不动）
  expect(await scale()).toBe(1)
  await page.waitForTimeout(800)
  expect(await scale()).toBe(1)

  // 开启 15（世界）秒时停窗口；用很长的世界时长确保静止时窗口几乎不排空
  await page.evaluate(() => (window.__arena() as { startTimeStop: (ms: number) => void }).startTimeStop(600_000))

  // 静止：世界时标降到近乎凝固（chrono 起点即 0，立即成立）
  await waitScale('<', 0.2)

  // 移动：世界时标回升到接近常速（动则时行），且队伍中心明显位移
  const px0 = await page.evaluate(() => window.__warmoji!.playerX)
  await page.keyboard.down('ArrowRight')
  await waitScale('>', 0.85)
  const px1 = await page.evaluate(() => window.__warmoji!.playerX)
  await page.keyboard.up('ArrowRight')
  expect(px1 - px0).toBeGreaterThan(20)

  // 松手回到静止：世界再次凝固
  await waitScale('<', 0.2)

  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

declare global {
  interface Window {
    __spawnEnemy?: (kind: string, dxU?: number, dyU?: number) => void
    __arena: () => unknown
  }
}
