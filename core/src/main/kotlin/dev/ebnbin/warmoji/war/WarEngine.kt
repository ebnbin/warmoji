package dev.ebnbin.warmoji.war

import com.badlogic.ashley.core.Component
import com.badlogic.ashley.core.Engine
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.utils.viewport.ScreenViewport
import dev.ebnbin.kgdx.scene.Scene
import dev.ebnbin.warmoji.warMoji
import ktx.ashley.allOf
import ktx.ashley.mapperFor
import kotlin.math.max

class WarEngine : Engine(), Scene {
    val tilesPerScreen: Float = TILES_PER_SCREEN
    val rows: Int = ROWS
    val columns: Int = COLUMNS
    var parentAlpha: Float = 1f
    var inputDirectionX: Int = 0
    var inputDirectionY: Int = 0

    val viewport: ScreenViewport = object : ScreenViewport() {
        override fun update(screenWidth: Int, screenHeight: Int, centerCamera: Boolean) {
            unitsPerPixel = max(tilesPerScreen / screenWidth, tilesPerScreen / screenHeight)
            super.update(screenWidth, screenHeight, centerCamera)
        }
    }

    val batch: SpriteBatch = SpriteBatch()

    val warCameraHelper: WarCameraHelper = WarCameraHelper(
        camera = viewport.camera,
        rows = rows,
        columns = columns,
    )

    val warBackground: WarBackground = WarBackground(
        rows = rows,
        columns = columns,
    )

    private val playerEntity: PlayerEntity = PlayerEntity(
        positionComponent = PositionComponent(
            x = columns / 2f,
            y = rows / 2f,
        ),
        textureComponent = TextureComponent(
            texture = warMoji.emojiManager.textureList.random(),
        ),
    )

    fun getPlayerPosition(): Pair<Float, Float> {
        val position = playerEntity.getComponent(PositionComponent::class.java)
        return position.x to position.y
    }

    init {
        addEntity(playerEntity)
        addSystem(ActSystem())
        addSystem(DrawSystem())
    }

    override fun resize(width: Int, height: Int) {
        viewport.update(width, height)
        warCameraHelper.resize(viewport.worldWidth, viewport.worldHeight)
    }

    override fun resume() {
    }

    override fun render(deltaTime: Float) {
        update(deltaTime)
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

private class PositionComponent(
    var x: Float,
    var y: Float,
) : Component

private class TextureComponent(
    var texture: Texture,
) : Component

private class ActProcessorComponent(
    val act: (engine: WarEngine, entity: Entity, deltaTime: Float) -> Unit,
) : Component

private class DrawProcessorComponent(
    val draw: (engine: WarEngine, entity: Entity) -> Unit,
) : Component

private class PlayerEntity(
    positionComponent: PositionComponent,
    textureComponent: TextureComponent,
) : Entity() {
    init {
        add(positionComponent)
        add(textureComponent)
        add(ActProcessorComponent(::act))
        add(DrawProcessorComponent(::draw))
    }

    private fun act(engine: WarEngine, entity: Entity, deltaTime: Float) {
        val position = mapperFor<PositionComponent>().get(entity)
        val minX = 0.5f
        val maxX = engine.columns - 0.5f
        val minY = 0.5f
        val maxY = engine.rows - 0.5f
        position.x = (position.x + engine.inputDirectionX * SPEED * deltaTime).coerceIn(minX, maxX)
        position.y = (position.y + engine.inputDirectionY * SPEED * deltaTime).coerceIn(minY, maxY)
    }

    private fun draw(engine: WarEngine, entity: Entity) {
        val position = mapperFor<PositionComponent>().get(entity)
        val texture = mapperFor<TextureComponent>().get(entity)
        engine.batch.draw(texture.texture, position.x - 0.5f, position.y - 0.5f, 0.5f, 0.5f, 1f, 1f, 1f, 1f, 0f, 0, 0,
            texture.texture.width, texture.texture.height, false, true)
    }

    companion object {
        private const val SPEED = 3f
    }
}

private class ActSystem : IteratingSystem(allOf(
    ActProcessorComponent::class,
).get()) {
    private val warEngine: WarEngine
        get() = engine as WarEngine

    override fun update(deltaTime: Float) {
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
        warEngine.inputDirectionX = inputDirectionX
        warEngine.inputDirectionY = inputDirectionY
        super.update(deltaTime)
        warEngine.warCameraHelper.act(warEngine.getPlayerPosition())
    }

    override fun processEntity(entity: Entity, deltaTime: Float) {
        val actProcessor = mapperFor<ActProcessorComponent>().get(entity)
        actProcessor.act(warEngine, entity, deltaTime)
    }
}

private class DrawSystem : IteratingSystem(allOf(
    DrawProcessorComponent::class,
).get()) {
    private val warEngine: WarEngine
        get() = engine as WarEngine

    override fun update(deltaTime: Float) {
        warEngine.viewport.camera.update()
        warEngine.batch.projectionMatrix = warEngine.viewport.camera.combined
        warEngine.batch.begin()
        warEngine.warBackground.draw(warEngine.batch, warEngine.parentAlpha, warEngine.viewport.camera)
        super.update(deltaTime)
        warEngine.batch.end()
    }

    override fun processEntity(entity: Entity, deltaTime: Float) {
        val drawProcessor = mapperFor<DrawProcessorComponent>().get(entity)
        drawProcessor.draw(warEngine, entity)
    }
}
