package dev.ebnbin.warmoji.war

import com.badlogic.gdx.utils.viewport.ScreenViewport
import dev.ebnbin.kgdx.scene.LifecycleStage
import kotlin.math.max

class WarStage : LifecycleStage(object : ScreenViewport() {
    override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
        unitsPerPixel = max(TILES_PER_SCREEN / screenWidth, TILES_PER_SCREEN / screenHeight)
        super.update(screenWidth, screenHeight, centerCamera)
    }
}) {
    private val warCameraHelper: WarCameraHelper = WarCameraHelper(
        camera = camera,
        rows = ROWS,
        columns = COLUMNS,
    )

    init {
        WarBackgroundActor(ROWS, COLUMNS).also {
            addActor(it)
        }
    }

    private val warActor: WarActor = WarActor(ROWS, COLUMNS).also {
        addActor(it)
    }

    override fun resize(width: Float, height: Float) {
        super.resize(width, height)
        warCameraHelper.resize(width, height)
    }

    override fun act(delta: Float) {
        super.act(delta)
        val playerPosition = warActor.getPlayerPosition()
        warCameraHelper.act(playerPosition)
    }

    companion object {
        private const val TILES_PER_SCREEN = 12f
        private const val ROWS = 25
        private const val COLUMNS = 25
    }
}
