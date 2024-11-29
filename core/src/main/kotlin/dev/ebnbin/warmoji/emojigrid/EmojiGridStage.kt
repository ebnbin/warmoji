package dev.ebnbin.warmoji.emojigrid

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.OrthographicCamera
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.scenes.scene2d.Stage
import com.badlogic.gdx.utils.viewport.ScreenViewport
import com.mazatech.gdx.SVGAssetsConfigGDX
import com.mazatech.gdx.SVGAssetsGDX
import java.util.zip.ZipInputStream
import kotlin.math.roundToInt

class EmojiGridStage : Stage(object : ScreenViewport() {
    override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
        (camera as OrthographicCamera).setToOrtho(true, screenWidth.toFloat(), screenHeight.toFloat())
        super.update(screenWidth, screenHeight, centerCamera)
    }
}) {
    private val emojiTextureList: List<Texture> = createEmojiTextureList()

    private val emojiGridActor: EmojiGridActor = EmojiGridActor(emojiTextureList).also {
        addActor(it)
    }

    fun resize(width: Int, height: Int) {
        viewport.update(width, height)
        emojiGridActor.setSize(this.width, this.height)
    }

    override fun dispose() {
        emojiTextureList.forEach(Texture::dispose)
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
    }
}
