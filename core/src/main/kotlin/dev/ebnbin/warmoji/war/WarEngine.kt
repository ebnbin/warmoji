package dev.ebnbin.warmoji.war

import com.badlogic.ashley.core.Component
import com.badlogic.ashley.core.Engine
import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.Batch
import dev.ebnbin.warmoji.warMoji
import ktx.ashley.allOf
import ktx.ashley.mapperFor

class WarEngine(
    val rows: Int,
    val columns: Int,
    var systemState: SystemState = SystemState.NONE,
    var batch: Batch? = null,
    var parentAlpha: Float = 1f,
    var inputDirectionX: Int = 0,
    var inputDirectionY: Int = 0,
) : Engine() {
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
}

enum class SystemState {
    NONE,
    ACT,
    DRAW,
    ;
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
        val batch = requireNotNull(engine.batch)
        batch.draw(texture.texture, position.x - 0.5f, position.y - 0.5f, 0.5f, 0.5f, 1f, 1f, 1f, 1f, 0f, 0, 0,
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

    override fun checkProcessing(): Boolean {
        return warEngine.systemState == SystemState.ACT
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

    override fun checkProcessing(): Boolean {
        return warEngine.systemState == SystemState.DRAW
    }

    override fun processEntity(entity: Entity, deltaTime: Float) {
        val drawProcessor = mapperFor<DrawProcessorComponent>().get(entity)
        drawProcessor.draw(warEngine, entity)
    }
}
