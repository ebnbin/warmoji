package dev.ebnbin.warmoji.engine

import com.badlogic.ashley.core.Component
import com.badlogic.gdx.graphics.Texture

object PlayerComponent : Component

class PositionComponent : Component {
    var x: Float = 0f
    var y: Float = 0f
}

class RenderSizeComponent : Component {
    var width: Float = 0f
    var height: Float = 0f
}

class HitSizeComponent : Component {
    var width: Float = 0f
    var height: Float = 0f
}

class SpeedComponent : Component {
    var value: Float = 0f
}

class VelocityComponent : Component {
    var x: Float = 0f
    var y: Float = 0f
}

class TextureComponent : Component {
    lateinit var value: Texture
}
