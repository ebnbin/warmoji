package dev.ebnbin.warmoji

import dev.ebnbin.kgdx.Game
import dev.ebnbin.kgdx.game
import dev.ebnbin.warmoji.engine.WarEngine

val warMoji: WarMoji
    get() = game as WarMoji

class WarMoji : Game() {
    lateinit var emojiManager: EmojiManager
        private set

    override fun create() {
        super.create()
        emojiManager = EmojiManager()
        sceneList = listOf(WarEngine())
    }

    override fun dispose() {
        sceneList = null
        emojiManager.dispose()
        super.dispose()
    }
}
