package dev.ebnbin.warmoji.emojigrid

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.graphics.OrthographicCamera
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.utils.ScreenUtils
import com.badlogic.gdx.utils.viewport.ScreenViewport
import com.mazatech.gdx.SVGAssetsConfigGDX
import com.mazatech.gdx.SVGAssetsGDX
import dev.ebnbin.kgdx.scene.LifecycleStage
import java.util.zip.ZipInputStream
import kotlin.math.roundToInt

class EmojiGridStage : LifecycleStage(object : ScreenViewport() {
    override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
        (camera as OrthographicCamera).setToOrtho(true, screenWidth.toFloat(), screenHeight.toFloat())
        super.update(screenWidth, screenHeight, centerCamera)
    }
}) {
    private val emojiTextureList: List<Texture> = createEmojiTextureList()

    private val emojiGridActor: EmojiGridActor = EmojiGridActor(emojiTextureList).also {
        addActor(it)
    }

    override fun resize(width: Float, height: Float) {
        super.resize(width, height)
        emojiGridActor.setSize(width, height)
    }

    override fun draw() {
        ScreenUtils.clear(Color.WHITE)
        super.draw()
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
