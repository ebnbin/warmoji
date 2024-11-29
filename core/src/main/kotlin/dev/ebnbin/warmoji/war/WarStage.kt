package dev.ebnbin.warmoji.war

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import com.badlogic.gdx.scenes.scene2d.ui.Image
import com.badlogic.gdx.utils.Align
import com.badlogic.gdx.utils.viewport.ScreenViewport
import dev.ebnbin.kgdx.scene.LifecycleStage
import dev.ebnbin.warmoji.warMoji
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

    private val playerImage: Image = Image(warMoji.emojiManager.textureList.random()).also {
        it.setSize(1f, 1f)
        it.setPosition(COLUMNS / 2f, ROWS / 2f, Align.center)
        it.setOrigin(Align.center)
        it.scaleY = -1f
        addActor(it)
    }

    override fun resize(width: Float, height: Float) {
        super.resize(width, height)
        warCameraHelper.resize(width, height)
    }

    override fun act(delta: Float) {
        super.act(delta)
        val directionX = when {
            Gdx.input.isKeyPressed(Input.Keys.A) && !Gdx.input.isKeyPressed(Input.Keys.D) -> -1
            Gdx.input.isKeyPressed(Input.Keys.D) && !Gdx.input.isKeyPressed(Input.Keys.A) -> 1
            else -> 0
        }
        val directionY = when {
            Gdx.input.isKeyPressed(Input.Keys.S) && !Gdx.input.isKeyPressed(Input.Keys.W) -> -1
            Gdx.input.isKeyPressed(Input.Keys.W) && !Gdx.input.isKeyPressed(Input.Keys.S) -> 1
            else -> 0
        }
        val playerMinX = 0.5f
        val playerMaxX = COLUMNS - 0.5f
        val playerMinY = 0.5f
        val playerMaxY = ROWS - 0.5f
        val playerX = (playerImage.getX(Align.center) + directionX * PLAYER_SPEED * delta)
            .coerceIn(playerMinX, playerMaxX)
        val playerY = (playerImage.getY(Align.center) + directionY * PLAYER_SPEED * delta)
            .coerceIn(playerMinY, playerMaxY)
        playerImage.setPosition(playerX, playerY, Align.center)

        warCameraHelper.act(playerX, playerY)
    }

    companion object {
        private const val TILES_PER_SCREEN = 12f
        private const val ROWS = 25
        private const val COLUMNS = 25
        private const val PLAYER_SPEED = 3f
    }
}
