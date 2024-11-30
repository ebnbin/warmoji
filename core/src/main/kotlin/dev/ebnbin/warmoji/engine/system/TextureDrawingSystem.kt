package dev.ebnbin.warmoji.engine.system

import com.badlogic.ashley.core.Entity
import com.badlogic.ashley.systems.IteratingSystem
import dev.ebnbin.warmoji.engine.PositionComponent
import dev.ebnbin.warmoji.engine.RenderSizeComponent
import dev.ebnbin.warmoji.engine.TextureComponent
import dev.ebnbin.warmoji.engine.mapperRequire
import dev.ebnbin.warmoji.engine.warEngine
import ktx.ashley.allOf

class TextureDrawingSystem : IteratingSystem(allOf(
    PositionComponent::class,
    RenderSizeComponent::class,
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
        val renderSize = entity.mapperRequire<RenderSizeComponent>()
        val texture = entity.mapperRequire<TextureComponent>()
        warEngine.batch.draw(texture.value, position.x - renderSize.width / 2f, position.y - renderSize.height / 2f,
            renderSize.width / 2f, renderSize.height / 2f, renderSize.width, renderSize.height, 1f, 1f, 0f, 0, 0,
            texture.value.width, texture.value.height, false, true)
    }
}