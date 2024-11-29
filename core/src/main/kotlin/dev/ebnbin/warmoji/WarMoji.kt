package dev.ebnbin.warmoji

import dev.ebnbin.kgdx.Game
import dev.ebnbin.kgdx.game
import dev.ebnbin.warmoji.emojigrid.EmojiGridStage

val warMoji: WarMoji
    get() = game as WarMoji

class WarMoji : Game() {
    override fun create() {
        super.create()
        stageList = listOf(EmojiGridStage())
    }
}
