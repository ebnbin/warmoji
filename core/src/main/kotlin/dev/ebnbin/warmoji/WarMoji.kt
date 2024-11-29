package dev.ebnbin.warmoji

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.graphics.OrthographicCamera
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.utils.ScreenUtils
import com.mazatech.gdx.SVGAssetsConfigGDX
import com.mazatech.gdx.SVGAssetsGDX
import dev.ebnbin.kgdx.Game
import dev.ebnbin.kgdx.game
import java.util.zip.ZipInputStream
import kotlin.math.ceil
import kotlin.math.roundToInt
import kotlin.math.sqrt

val warMoji: WarMoji
    get() = game as WarMoji

class WarMoji : Game() {
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

    private lateinit var orthographicCamera: OrthographicCamera
    private lateinit var spriteBatch: SpriteBatch
    private lateinit var emojiTextureList: List<Texture>
    private lateinit var drawingData: DrawingData

    override fun create() {
        super.create()
        orthographicCamera = OrthographicCamera()
        spriteBatch = SpriteBatch()
        emojiTextureList = createEmojiTextureList()
    }

    override fun resize(width: Int, height: Int) {
        super.resize(width, height)
        orthographicCamera.setToOrtho(false, width.toFloat(), height.toFloat())
        drawingData = createDrawingData(emojiTextureList, width.toFloat(), height.toFloat())
    }

    override fun render() {
        super.render()
        ScreenUtils.clear(Color.WHITE)
        spriteBatch.projectionMatrix = orthographicCamera.combined
        spriteBatch.begin()
        drawingData.tileList.forEach { tile ->
            spriteBatch.draw(tile.texture, tile.x, tile.y, drawingData.size, drawingData.size, 0, 0,
                tile.texture.width, tile.texture.height, false, true)
        }
        spriteBatch.end()
    }

    override fun dispose() {
        emojiTextureList.forEach(Texture::dispose)
        spriteBatch.dispose()
        super.dispose()
    }

    companion object {
        private fun createEmojiTextureList(): List<Texture> {
            val emojiTextureList = mutableListOf<Texture>()
            val svgAssetsConfigGDX = SVGAssetsConfigGDX(Gdx.graphics.backBufferWidth, Gdx.graphics.backBufferHeight,
                Gdx.graphics.ppiX)
            val svgAssetsGDX = SVGAssetsGDX(svgAssetsConfigGDX)
            val zipFileHandle = Gdx.files.internal("openmoji-svg-color.zip")
            ZipInputStream(zipFileHandle.read(DEFAULT_BUFFER_SIZE)).use { zipInputStream ->
                while (true) {
                    zipInputStream.nextEntry ?: break
                    val svgText = zipInputStream.bufferedReader().readText()
                    zipInputStream.closeEntry()
                    val svgDocument = svgAssetsGDX.createDocument(svgText)
                    val texture = svgAssetsGDX.createTexture(svgDocument, svgDocument.viewport.width.roundToInt(),
                        svgDocument.viewport.height.roundToInt())
                    svgDocument.dispose()
                    emojiTextureList.add(texture)
                }
            }
            svgAssetsGDX.dispose()
            return emojiTextureList
        }

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
