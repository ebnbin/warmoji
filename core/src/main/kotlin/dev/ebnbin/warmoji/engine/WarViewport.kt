package dev.ebnbin.warmoji.engine

import com.badlogic.gdx.utils.viewport.ScreenViewport
import kotlin.math.max

class WarViewport(private val tilesPerScreen: Float) : ScreenViewport() {
    override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
        unitsPerPixel = max(tilesPerScreen / screenWidth, tilesPerScreen / screenHeight)
        super.update(screenWidth, screenHeight, centerCamera)
    }
}
