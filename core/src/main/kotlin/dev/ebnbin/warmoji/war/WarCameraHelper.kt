package dev.ebnbin.warmoji.war

import com.badlogic.gdx.graphics.Camera

class WarCameraHelper(
    private val camera: Camera,
    private val rows: Int,
    private val columns: Int,
) {
    private val defaultX: Float = columns / 2f
    private val defaultY: Float = (rows - MARGIN_BOTTOM + MARGIN_TOP) / 2f

    private var minX: Float = defaultX
    private var maxX: Float = defaultX
    private var minY: Float = defaultY
    private var maxY: Float = defaultY

    init {
        camera.position.x = defaultX
        camera.position.y = defaultY
        camera.update()
    }

    fun resize(width: Float, height: Float) {
        minX = width / 2f - MARGIN_HORIZONTAL
        maxX = columns - width / 2f + MARGIN_HORIZONTAL
        minY = height / 2f - MARGIN_BOTTOM
        maxY = rows - height / 2f + MARGIN_TOP
    }

    fun act(playerPosition: Pair<Float, Float>) {
        camera.position.x = if (minX > maxX) {
            defaultX
        } else {
            playerPosition.first.coerceIn(minX, maxX)
        }
        camera.position.y = if (minY > maxY) {
            defaultY
        } else {
            playerPosition.second.coerceIn(minY, maxY)
        }
        camera.update()
    }

    companion object {
        private const val MARGIN_HORIZONTAL = 1.5f
        private const val MARGIN_BOTTOM = 1f
        private const val MARGIN_TOP = 2f
    }
}
