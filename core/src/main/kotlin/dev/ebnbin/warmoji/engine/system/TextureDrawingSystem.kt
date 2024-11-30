package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.TextureComponent
import dev.ebnbin.warmoji.engine.mapperRequire
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class TextureDrawingSystem : IteratingSystem(allOf(
    PositionComponent::class,
    TextureComponent::class,
).get()) {
    override fun update(deltaTime: Float) {
        warEngine.batch.projectionMatrix = warEngine.viewport.camera.combined
        warEngine.batch.begin()
        super.update(deltaTime)
        warEngine.batch.end()
    }

    override fun processEntity(entity: Entity, deltaTime: Float) {
        val position = entity.mapperRequire<PositionComponent>()
        val texture = entity.mapperRequire<TextureComponent>()
        warEngine.batch.draw(texture.texture, position.x - 0.5f, position.y - 0.5f, 0.5f, 0.5f, 1f, 1f, 1f, 1f, 0f, 0,
            0, texture.texture.width, texture.texture.height, false, true)
    }
}
