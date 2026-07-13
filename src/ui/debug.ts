// e2e 测试通过 window.__warmoji 断言游戏内部状态（见 e2e/），勿删。
export function reportDebug(state: WarmojiDebug): void {
  window.__warmoji = state
}
