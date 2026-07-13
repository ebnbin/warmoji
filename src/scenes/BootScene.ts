import Phaser from 'phaser'

// 显式列出各平台 emoji 字体，保证 headless 测试环境（Noto）与真实设备都能渲染彩色 emoji。
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create(): void {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height * 0.32, '⚔️ WARMOJI ⚔️', {
        fontFamily: EMOJI_FONT,
        fontSize: '72px',
        color: '#f5f5f5',
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height * 0.5, '项目骨架已就绪 · 玩法开发中', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#8888aa',
      })
      .setOrigin(0.5)

    const emojis = ['😎', '🧟', '👻', '💀', '🤖']
    emojis.forEach((emoji, i) => {
      const sprite = this.add
        .text(width / 2 + (i - (emojis.length - 1) / 2) * 90, height * 0.68, emoji, {
          fontFamily: EMOJI_FONT,
          fontSize: '48px',
        })
        .setOrigin(0.5)
      this.tweens.add({
        targets: sprite,
        y: height * 0.68 - 18,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 120,
      })
    })
  }
}
