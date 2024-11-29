package dev.ebnbin.kgdx.scene

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.g2d.Batch
import com.badlogic.gdx.scenes.scene2d.Stage
import com.badlogic.gdx.utils.viewport.StretchViewport
import com.badlogic.gdx.utils.viewport.Viewport

abstract class LifecycleStage : Stage {
    constructor(viewport: Viewport = defaultViewport()) : super(viewport)

    constructor(viewport: Viewport = defaultViewport(), batch: Batch) : super(viewport, batch)

    private var resized: Boolean = false

    protected open val centerCameraOnResize: Boolean = false
    protected open val centerCameraOnDraw: Boolean = false

    protected open fun resize(width: Float, height: Float) {
    }

    protected open fun resume() {
    }

    protected open fun pause() {
    }

    override fun setViewport(viewport: Viewport) {
        diffSize {
            super.setViewport(viewport)
        }
    }

    private fun diffSize(updateViewport: () -> Unit) {
        val oldWidth = width
        val oldHeight = height
        updateViewport()
        val newWidth = width
        val newHeight = height
        if (resized && oldWidth == newWidth && oldHeight == newHeight) return
        if (!resized) {
            resized = true
        }
        resize(newWidth, newHeight)
    }

    @Deprecated("", ReplaceWith("act(delta)"))
    final override fun act() {
        super.act()
    }

    companion object {
        private fun defaultViewport(): Viewport {
            return StretchViewport(Gdx.graphics.width.toFloat(), Gdx.graphics.height.toFloat())
        }

        internal fun List<LifecycleStage>.resize(width: Int, height: Int) {
            forEach { stage ->
                stage.diffSize {
                    stage.viewport.update(width, height, stage.centerCameraOnResize)
                }
            }
        }

        internal fun List<LifecycleStage>.resume() {
            forEach { stage ->
                stage.resume()
            }
        }

        internal fun List<LifecycleStage>.act(delta: Float) {
            forEach { stage ->
                stage.act(delta)
            }
        }

        internal fun List<LifecycleStage>.draw() {
            forEach { stage ->
                stage.viewport.apply(stage.centerCameraOnDraw)
                stage.draw()
            }
        }

        internal fun List<LifecycleStage>.pause() {
            reversed().forEach { stage ->
                stage.pause()
            }
        }

        internal fun List<LifecycleStage>.dispose() {
            reversed().forEach { stage ->
                stage.dispose()
            }
        }
    }
}
