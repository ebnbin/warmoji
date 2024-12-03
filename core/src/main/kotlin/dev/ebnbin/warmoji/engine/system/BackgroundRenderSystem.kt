package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Engine
import com.badlogic.ashley.core.EntitySystem
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.graphics.GL20
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import com.badlogic.gdx.math.Rectangle
import dev.ebnbin.kgdx.graphics.copy
import dev.ebnbin.warmoji.engine.warEngine
import dev.ebnbin.warmoji.warMoji
import kotlin.random.Random

class BackgroundRenderSystem : EntitySystem() {
    private lateinit var backgroundColor: Color

    private data class Tile(
        val texture: Texture,
        val x: Float,
        val y: Float,
        val scale: Float,
        val rotation: Float,
    )

    private lateinit var tileList: List<Tile>

    private val clipArea: Rectangle = Rectangle()

    override fun addedToEngine(engine: Engine) {
        super.addedToEngine(engine)
        backgroundColor = Color(Random.nextFloat(), Random.nextFloat(), Random.nextFloat(), 1f)
        val tileList = mutableListOf<Tile>()
        val emojiTextureList = warMoji.emojiManager.textureList.shuffled().take(EMOJI_COUNT)
        for (y in 0 until warEngine.rows) {
            for (x in 0 until warEngine.columns) {
                if (Random.nextFloat() > EMOJI_DENSITY) continue
                val tile = Tile(
                    texture = emojiTextureList.random(),
                    x = x + Random.nextFloat() * EMOJI_OFFSET * 2f - EMOJI_OFFSET,
                    y = y + Random.nextFloat() * EMOJI_OFFSET * 2f - EMOJI_OFFSET,
                    scale = Random.nextFloat() * (EMOJI_SCALE_MAX - EMOJI_SCALE_MIN) + EMOJI_SCALE_MIN,
                    rotation = Random.nextFloat() * 360f,
                )
                tileList.add(tile)
            }
        }
        this.tileList = tileList
        clipArea.set(0f, 0f, warEngine.columns.toFloat(), warEngine.rows.toFloat())
    }

    override fun update(deltaTime: Float) {
        super.update(deltaTime)
        Gdx.gl.glEnable(GL20.GL_BLEND)
        warEngine.rendererManager.useShape(
            type = ShapeRenderer.ShapeType.Filled,
        ) {
            color = backgroundColor
            rect(0f, 0f, warEngine.columns.toFloat(), warEngine.rows.toFloat())
        }
        warEngine.rendererManager.useBatch(
            clipArea = clipArea,
        ) {
            color = Color.WHITE.copy(a = EMOJI_ALPHA)
            tileList.forEach { tile ->
                draw(tile.texture, tile.x, tile.y, 0.5f, 0.5f, 1f, 1f, tile.scale, tile.scale, tile.rotation, 0, 0,
                    tile.texture.width, tile.texture.height, false, true)
            }
        }
    }

    companion object {
        private const val EMOJI_COUNT = 5
        private const val EMOJI_DENSITY = 0.2f
        private const val EMOJI_OFFSET = 0.5f
        private const val EMOJI_SCALE_MIN = 0.25f
        private const val EMOJI_SCALE_MAX = 0.75f
        private const val EMOJI_ALPHA = 0.2f
    }
}
