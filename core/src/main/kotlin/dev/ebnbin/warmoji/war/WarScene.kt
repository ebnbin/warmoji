package dev.ebnbin.warmoji.war

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.utils.viewport.ScreenViewport
import dev.ebnbin.kgdx.scene.LifecycleScene
import kotlin.math.max

class WarScene(
    tilesPerScreen: Float = TILES_PER_SCREEN,
    rows: Int = ROWS,
    columns: Int = COLUMNS,
) : LifecycleScene {
    private val viewport: ScreenViewport = object : ScreenViewport() {
        override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
            unitsPerPixel = max(tilesPerScreen / screenWidth, tilesPerScreen / screenHeight)
            super.update(screenWidth, screenHeight, centerCamera)
        }
    }

    private val batch: SpriteBatch = SpriteBatch()

    private val warCameraHelper: WarCameraHelper = WarCameraHelper(
        camera = viewport.camera,
        rows = rows,
        columns = columns,
    )

    private val warBackground: WarBackground = WarBackground(
        rows = rows,
        columns = columns,
    )

    private val engine: WarEngine = WarEngine(
        rows = rows,
        columns = columns,
        batch = batch,
    )

    override fun resize(width: Int, height: Int) {
        viewport.update(width, height)
        warCameraHelper.resize(viewport.worldWidth, viewport.worldHeight)
    }

    override fun resume() {
    }

    override fun render(deltaTime: Float) {
        val inputDirectionX = when {
            Gdx.input.isKeyPressed(Input.Keys.A) && !Gdx.input.isKeyPressed(Input.Keys.D) -> -1
            Gdx.input.isKeyPressed(Input.Keys.D) && !Gdx.input.isKeyPressed(Input.Keys.A) -> 1
            else -> 0
        }
        val inputDirectionY = when {
            Gdx.input.isKeyPressed(Input.Keys.S) && !Gdx.input.isKeyPressed(Input.Keys.W) -> -1
            Gdx.input.isKeyPressed(Input.Keys.W) && !Gdx.input.isKeyPressed(Input.Keys.S) -> 1
            else -> 0
        }
        engine.inputDirectionX = inputDirectionX
        engine.inputDirectionY = inputDirectionY

        engine.systemState = SystemState.ACT
        engine.update(deltaTime)
        warCameraHelper.act(engine.getPlayerPosition())

        engine.systemState = SystemState.DRAW
        viewport.camera.update()
        batch.projectionMatrix = viewport.camera.combined
        batch.begin()
        warBackground.draw(batch, 1f, viewport.camera)
        engine.update(0f)
        batch.end()
    }

    override fun pause() {
    }

    override fun dispose() {
        batch.dispose()
    }

    companion object {
        private const val TILES_PER_SCREEN = 12f
        private const val ROWS = 25
        private const val COLUMNS = 25
    }
}
