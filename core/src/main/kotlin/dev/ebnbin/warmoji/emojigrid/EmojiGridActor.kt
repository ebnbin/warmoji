package dev.ebnbin.warmoji.emojigrid

import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.Batch
import com.badlogic.gdx.scenes.scene2d.Actor
import kotlin.math.ceil
import kotlin.math.sqrt

class EmojiGridActor(
    private val emojiTextureList: List<Texture>,
) : Actor() {
    private class DrawingData(
        val size: Float,
        val tileList: List<Tile>,
    ) {
        class Tile(
            val texture: Texture,
            val x: Float,
            val y: Float,
        )
    }

    private lateinit var drawingData: DrawingData

    override fun sizeChanged() {
        super.sizeChanged()
        drawingData = createDrawingData(emojiTextureList, width, height)
    }

    override fun draw(batch: Batch, parentAlpha: Float) {
        super.draw(batch, parentAlpha)
        drawingData.tileList.forEach { tile ->
            batch.draw(tile.texture, x + tile.x, y + tile.y, drawingData.size, drawingData.size)
        }
    }

    companion object {
        private fun createDrawingData(emojiTextureList: List<Texture>, width: Float, height: Float): DrawingData {
            if (width <= 0f || height <= 0f) {
                return DrawingData(0f, emptyList())
            }
            var columns = ceil(sqrt(emojiTextureList.size / height * width)).toInt()
            var rows = ceil(emojiTextureList.size.toFloat() / columns).toInt()
            while (width / columns * rows > height) {
                ++columns
                rows = ceil(emojiTextureList.size.toFloat() / columns).toInt()
            }
            val size = width / columns
            val tileList = emojiTextureList.mapIndexed { index, emojiTexture ->
                val x = index % columns * size
                val y = index / columns * size
                DrawingData.Tile(emojiTexture, x, y)
            }
            return DrawingData(size, tileList)
        }
    }
}
