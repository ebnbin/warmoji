package dev.ebnbin.warmoji.war

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import com.badlogic.gdx.graphics.GL20
import com.badlogic.gdx.graphics.glutils.ShapeRenderer
import com.badlogic.gdx.scenes.scene2d.ui.Image
import com.badlogic.gdx.utils.Align
import com.badlogic.gdx.utils.viewport.ScreenViewport
import dev.ebnbin.kgdx.scene.LifecycleStage
import dev.ebnbin.warmoji.warMoji
import ktx.actors.alpha
import kotlin.math.max
import kotlin.random.Random

class WarStage : LifecycleStage(object : ScreenViewport() {
    override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
        unitsPerPixel = max(TILES_PER_SCREEN / screenWidth, TILES_PER_SCREEN / screenHeight)
        super.update(screenWidth, screenHeight, centerCamera)
    }
}) {
    init {
        camera.position.x = COLUMNS / 2f
        camera.position.y = ROWS / 2f
        camera.update()
    }

    private val shapeRenderer: ShapeRenderer = ShapeRenderer().also {
        it.setColor(Random.nextFloat(), Random.nextFloat(), Random.nextFloat(), 1f)
    }

    init {
        val emojiTextureList = warMoji.emojiManager.textureList.shuffled().take(BACKGROUND_EMOJI_COUNT)
        for (y in 1 until ROWS - 1) {
            for (x in 1 until COLUMNS - 1) {
                if (Random.nextFloat() > BACKGROUND_EMOJI_DENSITY) continue
                Image(emojiTextureList.random()).also {
                    it.setSize(1f, 1f)
                    it.setPosition(x.toFloat(), y.toFloat())
                    it.moveBy(
                        Random.nextFloat() * BACKGROUND_EMOJI_OFFSET * 2f - BACKGROUND_EMOJI_OFFSET,
                        Random.nextFloat() * BACKGROUND_EMOJI_OFFSET * 2f - BACKGROUND_EMOJI_OFFSET,
                    )
                    it.setOrigin(Align.center)
                    val scale = Random.nextFloat() * (BACKGROUND_EMOJI_SCALE_MAX - BACKGROUND_EMOJI_SCALE_MIN) +
                        BACKGROUND_EMOJI_SCALE_MIN
                    it.setScale(scale, -scale)
                    it.rotation = Random.nextFloat() * 360f
                    it.alpha = BACKGROUND_EMOJI_ALPHA
                    addActor(it)
                }
            }
        }
    }

    private val playerImage: Image = Image(warMoji.emojiManager.textureList.random()).also {
        it.setSize(1f, 1f)
        it.setPosition(COLUMNS / 2f, ROWS / 2f, Align.center)
        it.setOrigin(Align.center)
        it.scaleY = -1f
        addActor(it)
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

        val cameraMinX = width / 2f - MARGIN_HORIZONTAL
        val cameraMaxX = COLUMNS - width / 2f + MARGIN_HORIZONTAL
        val cameraMinY = height / 2f - MARGIN_BOTTOM
        val cameraMaxY = ROWS - height / 2f + MARGIN_TOP
        val cameraX = if (cameraMinX > cameraMaxX) {
            COLUMNS / 2f
        } else {
            playerX.coerceIn(cameraMinX, cameraMaxX)
        }
        val cameraY = if (cameraMinY > cameraMaxY) {
            (ROWS - MARGIN_BOTTOM + MARGIN_TOP) / 2f
        } else {
            playerY.coerceIn(cameraMinY, cameraMaxY)
        }
        camera.position.x = cameraX
        camera.position.y = cameraY
        camera.update()
    }

    override fun draw() {
        Gdx.gl.glEnable(GL20.GL_BLEND)
        shapeRenderer.projectionMatrix = camera.combined
        shapeRenderer.begin(ShapeRenderer.ShapeType.Filled)
        shapeRenderer.rect(0f, 0f, COLUMNS.toFloat(), ROWS.toFloat())
        shapeRenderer.end()
        Gdx.gl.glDisable(GL20.GL_BLEND)
        super.draw()
    }

    override fun dispose() {
        shapeRenderer.dispose()
        super.dispose()
    }

    companion object {
        private const val TILES_PER_SCREEN = 12f
        private const val ROWS = 25
        private const val COLUMNS = 25
        private const val BACKGROUND_EMOJI_COUNT = 5
        private const val BACKGROUND_EMOJI_DENSITY = 0.2f
        private const val BACKGROUND_EMOJI_OFFSET = 0.5f
        private const val BACKGROUND_EMOJI_SCALE_MIN = 0.25f
        private const val BACKGROUND_EMOJI_SCALE_MAX = 0.75f
        private const val BACKGROUND_EMOJI_ALPHA = 0.2f
        private const val PLAYER_SPEED = 3f
        private const val MARGIN_HORIZONTAL = 1.5f
        private const val MARGIN_BOTTOM = 1f
        private const val MARGIN_TOP = 2f
    }
}
