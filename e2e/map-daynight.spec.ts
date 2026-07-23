import { expect, test } from '@playwright/test'

// 晨昏原野：相机随跨波时钟平滑缩放（正午视野最大→zoom 最小；午夜视野最小→zoom 最大），
// 夜里罩以队伍为心的迷雾。用快进 combatMs 定点校验各时刻的相机缩放与夜雾开合。
test('昼夜图：相机随时钟涨落（正午拉远/午夜拉近），夜幕起迷雾，战斗运转无报错', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  // 进晨昏原野测试模式（免死无时限），勾一只怪让战斗运转
  await page.evaluate(() => window.__labTeam!(['juggler'], 'daynight'))
  await page.waitForFunction(() => window.__warmoji?.mapId === 'daynight')
  await page.evaluate(() => window.__setLab!(['zombie'], 'daynight'))
  await page.waitForTimeout(1000)

  type DnScene = {
    run: { combatMs: number }
    cameras: { main: { zoom: number } }
    fogRect?: { visible: boolean }
  }
  type DnGame = { scene: { getScene(k: string): DnScene } }
  const probe = async (combatMs: number): Promise<{ zoom: number; fog: boolean }> => {
    await page.evaluate((m) => {
      const s = (window.__game as unknown as DnGame).scene.getScene('arenaDayNight')
      s.run.combatMs = m
    }, combatMs)
    await page.waitForTimeout(500)
    return page.evaluate(() => {
      const s = (window.__game as unknown as DnGame).scene.getScene('arenaDayNight')
      return { zoom: s.cameras.main.zoom, fog: s.fogRect?.visible ?? false }
    })
  }

  const noon = await probe(12000) // 12:00 视野最大 → zoom 最小（拉最远）
  const dusk = await probe(24000) // 18:00 标准视野
  const midnight = await probe(36000) // 00:00 视野最小 → zoom 最大（拉最近）

  // 视野随时刻涨落：正午拉最远、午夜拉最近，黄昏居中
  expect(noon.zoom).toBeLessThan(dusk.zoom)
  expect(dusk.zoom).toBeLessThan(midnight.zoom)
  // 30 格 vs 10 格 → 午夜 zoom 显著大于正午
  expect(midnight.zoom / noon.zoom).toBeGreaterThan(1.8)
  // 白天无雾、午夜有雾
  expect(noon.fog).toBe(false)
  expect(midnight.fog).toBe(true)

  expect(errors).toEqual([])
})
