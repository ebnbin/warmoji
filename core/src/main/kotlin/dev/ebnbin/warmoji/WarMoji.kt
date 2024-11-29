package dev.ebnbin.warmoji

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.utils.ScreenUtils
import com.mazatech.gdx.SVGAssetsConfigGDX
import com.mazatech.gdx.SVGAssetsGDX
import dev.ebnbin.kgdx.Game
import dev.ebnbin.kgdx.game
import java.util.zip.ZipInputStream
import kotlin.math.roundToInt

val warMoji: WarMoji
    get() = game as WarMoji

class WarMoji : Game() {
    private lateinit var spriteBatch: SpriteBatch
    private lateinit var texture: Texture

    override fun create() {
        super.create()
        spriteBatch = SpriteBatch()
        texture = createEmojiTexture("1F600")
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

    companion object {
        private fun createEmojiTexture(hexcode: String): Texture {
            val zipFileHandle = Gdx.files.internal("openmoji-svg-color.zip")
            ZipInputStream(zipFileHandle.read(DEFAULT_BUFFER_SIZE)).use { zipInputStream ->
                while (true) {
                    val zipEntry = zipInputStream.nextEntry ?: break
                    if (zipEntry.name != "$hexcode.svg") {
                        zipInputStream.closeEntry()
                        continue
                    }
                    val svgText = zipInputStream.bufferedReader().readText()
                    zipInputStream.closeEntry()
                    val svgAssetsConfigGDX = SVGAssetsConfigGDX(Gdx.graphics.backBufferWidth,
                        Gdx.graphics.backBufferHeight, Gdx.graphics.ppiX)
                    val svgAssetsGDX = SVGAssetsGDX(svgAssetsConfigGDX)
                    val svgDocument = svgAssetsGDX.createDocument(svgText)
                    val texture = svgAssetsGDX.createTexture(svgDocument, svgDocument.viewport.width.roundToInt(),
                        svgDocument.viewport.width.roundToInt())
                    svgDocument.dispose()
                    svgAssetsGDX.dispose()
                    return texture
                }
            }
            error(Unit)
        }
    }
}
