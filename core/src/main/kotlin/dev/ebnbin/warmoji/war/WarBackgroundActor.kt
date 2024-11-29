package dev.ebnbin.warmoji.war

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.GL20
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.Batch
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import com.badlogic.gdx.math.Rectangle
import com.badlogic.gdx.scenes.scene2d.Actor
import com.badlogic.gdx.scenes.scene2d.utils.ScissorStack
import dev.ebnbin.warmoji.warMoji
import kotlin.random.Random

class WarBackgroundActor(rows: Int, columns: Int) : Actor() {
    init {
        setSize(columns.toFloat(), rows.toFloat())
    }

    private val shapeRenderer: ShapeRenderer = ShapeRenderer().also {
        it.setColor(Random.nextFloat(), Random.nextFloat(), Random.nextFloat(), 1f)
    }

    private class Tile(
        val texture: Texture,
        val x: Float,
        val y: Float,
        val scale: Float,
        val rotation: Float,
    )

    private val tileList: List<Tile> = mutableListOf<Tile>().also { tileList ->
        val emojiTextureList = warMoji.emojiManager.textureList.shuffled().take(EMOJI_COUNT)
        for (y in 0 until rows) {
            for (x in 0 until columns) {
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
    }

    override fun draw(batch: Batch, parentAlpha: Float) {
        super.draw(batch, parentAlpha)
        batch.end()
        Gdx.gl.glEnable(GL20.GL_BLEND)
        shapeRenderer.projectionMatrix = batch.projectionMatrix
        shapeRenderer.begin(ShapeRenderer.ShapeType.Filled)
        shapeRenderer.rect(x, y, width, height)
        shapeRenderer.end()
        Gdx.gl.glDisable(GL20.GL_BLEND)
        batch.begin()

        val oldColor = batch.color.cpy()
        batch.color = batch.color.cpy().also { it.a *= parentAlpha * EMOJI_ALPHA }
        val area = Rectangle(x, y, width, height)
        val scissor = Rectangle()
        ScissorStack.calculateScissors(requireNotNull(stage).camera, batch.transformMatrix, area, scissor)
        batch.flush()
        if (!ScissorStack.pushScissors(scissor)) return
        tileList.forEach { tile ->
            batch.draw(tile.texture, x + tile.x, y + tile.y, 0.5f, 0.5f, 1f, 1f, tile.scale, tile.scale, tile.rotation,
                0, 0, tile.texture.width, tile.texture.height, false, true)
        }
        batch.flush()
        ScissorStack.popScissors()
        batch.color = oldColor
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
