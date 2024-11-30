package dev.ebnbin.warmoji.engine

import com.badlogic.ashley.core.Component
import com.badlogic.gdx.graphics.Texture

object PlayerComponent : Component {
    const val SPEED = 3f
}

data class PositionComponent @JvmOverloads constructor(
    var x: Float = 0f,
    var y: Float = 0f,
) : Component

data class VelocityComponent @JvmOverloads constructor(
    var x: Float = 0f,
    var y: Float = 0f,
) : Component

data class TextureComponent @JvmOverloads constructor(
    var lateinitTexture: Texture? = null,
) : Component {
    val texture: Texture
        get() = requireNotNull(lateinitTexture)
}
