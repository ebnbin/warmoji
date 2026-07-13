import type { Page } from '@playwright/test'

/** 逻辑坐标 → canvas CSS 坐标（canvas CSS 尺寸 = 窗口尺寸） */
async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

/** 点击组队页上某张角色卡的中心 */
export async function clickCard(page: Page, id: string): Promise<void> {
  const c = await page.evaluate(
    (cid) => window.__warmoji!.menu!.cards.find((x) => x.id === cid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: c.x + c.w / 2, y: c.y + c.h / 2 }) })
}

/** 通过组队页「出发」按钮真实点击开局 */
export async function startRun(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'menu' && window.__warmoji.menu?.start.enabled === true,
  )
  const s = await page.evaluate(() => window.__warmoji!.menu!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}
