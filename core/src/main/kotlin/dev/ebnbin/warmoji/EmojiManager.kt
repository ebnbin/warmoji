package dev.ebnbin.warmoji

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.Texture
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import com.mazatech.gdx.SVGAssetsConfigGDX
import com.mazatech.gdx.SVGAssetsGDX
import dev.ebnbin.warmoji.openmoji.OpenMoji
import java.util.zip.ZipInputStream
import kotlin.math.roundToInt

class EmojiManager {
    val textureList: List<Texture> = createEmojiTextureList()

    fun dispose() {
        textureList.forEach(Texture::dispose)
    }

    companion object {
        private fun createEmojiTextureList(): List<Texture> {
            val emojiTextureMap = mutableMapOf<String, Texture>()
            val svgAssetsConfigGDX = SVGAssetsConfigGDX(Gdx.graphics.backBufferWidth, Gdx.graphics.backBufferHeight,
                Gdx.graphics.ppiX)
            val svgAssetsGDX = SVGAssetsGDX(svgAssetsConfigGDX)
            val zipFileHandle = Gdx.files.internal("openmoji-svg-color.zip")
            ZipInputStream(zipFileHandle.read(DEFAULT_BUFFER_SIZE)).use { zipInputStream ->
                while (true) {
                    val zipEntry = zipInputStream.nextEntry ?: break
                    val hexcode = zipEntry.name.removeSuffix(".svg")
                    val svgText = zipInputStream.bufferedReader().readText()
                    zipInputStream.closeEntry()
                    val svgDocument = svgAssetsGDX.createDocument(svgText)
                    val texture = svgAssetsGDX.createTexture(svgDocument, svgDocument.viewport.width.roundToInt(),
                        svgDocument.viewport.height.roundToInt())
                    svgDocument.dispose()
                    emojiTextureMap[hexcode] = texture
                }
            }
            svgAssetsGDX.dispose()
            val gson = GsonBuilder()
                .excludeFieldsWithoutExposeAnnotation()
                .create()
            val jsonFileHandle = Gdx.files.internal("openmoji.json")
            val openMojiList = gson.fromJson<List<OpenMoji>>(jsonFileHandle.reader(DEFAULT_BUFFER_SIZE),
                object : TypeToken<List<OpenMoji>>() {}.type)
            val orderMap = openMojiList
                .map { it.hexcode to it.order.toIntOrNull() }
                .associate { it.first to it.second }
            val sortedEmojiTextureMap = emojiTextureMap.toSortedMap { o1, o2 ->
                val order1 = orderMap[o1] ?: Int.MAX_VALUE
                val order2 = orderMap[o2] ?: Int.MAX_VALUE
                if (order1 != order2) {
                    order1.compareTo(order2)
                } else {
                    o1.compareTo(o2)
                }
            }
            return sortedEmojiTextureMap.values.toList()
        }
    }
}
