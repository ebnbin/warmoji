package dev.ebnbin.warmoji

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.utils.ScreenUtils
import dev.ebnbin.kgdx.Game
import dev.ebnbin.kgdx.game
import dev.ebnbin.warmoji.emojigrid.EmojiGridStage

val warMoji: WarMoji
    get() = game as WarMoji

class WarMoji : Game() {
    private lateinit var emojiGridStage: EmojiGridStage

    override fun create() {
        super.create()
        emojiGridStage = EmojiGridStage()
    }

    override fun resize(width: Int, height: Int) {
        super.resize(width, height)
        emojiGridStage.resize(width, height)
    }

    override fun render() {
        super.render()
        emojiGridStage.act(Gdx.graphics.deltaTime)
        ScreenUtils.clear(Color.WHITE)
        emojiGridStage.viewport.apply()
        emojiGridStage.draw()
    }

    override fun dispose() {
        emojiGridStage.dispose()
        super.dispose()
    }
}
