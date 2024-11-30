package dev.ebnbin.kgdx.scene

import com.badlogic.ashley.core.PooledEngine
import com.badlogic.gdx.utils.viewport.Viewport

abstract class LifecycleEngine : PooledEngine(), Scene {
    abstract val viewport: Viewport

    private var resized: Boolean = false

    protected open val centerCameraOnResize: Boolean = false

    final override fun resize(width: Int, height: Int) {
        val oldWidth = viewport.worldWidth
        val oldHeight = viewport.worldHeight
        viewport.update(width, height, centerCameraOnResize)
        val newWidth = viewport.worldWidth
        val newHeight = viewport.worldHeight
        if (resized && oldWidth == newWidth && oldHeight == newHeight) return
        if (!resized) {
            resized = true
        }
        systems.filterIsInstance<LifecycleSystem>().forEach { system ->
            system.resize(newWidth, newHeight)
        }
    }

    final override fun resume() {
        systems.filterIsInstance<LifecycleSystem>().forEach { system ->
            system.resume()
        }
    }

    final override fun render(deltaTime: Float) {
        update(deltaTime)
    }

    final override fun pause() {
        systems.filterIsInstance<LifecycleSystem>().reversed().forEach { system ->
            system.pause()
        }
    }

    final override fun dispose() {
        systems.filterIsInstance<LifecycleSystem>().reversed().forEach { system ->
            system.dispose()
        }
    }
}

interface LifecycleSystem {
    fun resize(width: Float, height: Float) = Unit

    fun resume() = Unit

    fun pause() = Unit

    fun dispose() = Unit
}
