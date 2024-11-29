package dev.ebnbin.warmoji

import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.utils.ScreenUtils
import dev.ebnbin.kgdx.Game
import dev.ebnbin.kgdx.game

val warMoji: WarMoji
    get() = game as WarMoji

class WarMoji : Game() {
    private lateinit var spriteBatch: SpriteBatch
    private lateinit var texture: Texture

    override fun create() {
        super.create()
        spriteBatch = SpriteBatch()
        texture = Texture("libgdx.png")
    }

    override fun render() {
        super.render()
        ScreenUtils.clear(0.15f, 0.15f, 0.2f, 1f)
        spriteBatch.begin()
        spriteBatch.draw(texture, 140f, 210f)
        spriteBatch.end()
    }

    override fun dispose() {
        texture.dispose()
        spriteBatch.dispose()
        super.dispose()
    }
}
