package dev.ebnbin.kgdx.scene

interface LifecycleScene {
    fun resize(width: Int, height: Int)

    fun resume()

    fun render(deltaTime: Float)

    fun pause()

    fun dispose()

    companion object {
        internal fun List<LifecycleScene>.resize(width: Int, height: Int) {
            forEach { scene ->
                scene.resize(width, height)
            }
        }

        internal fun List<LifecycleScene>.resume() {
            forEach { scene ->
                scene.resume()
            }
        }

        internal fun List<LifecycleScene>.render(deltaTime: Float) {
            forEach { scene ->
                scene.render(deltaTime)
            }
        }

        internal fun List<LifecycleScene>.pause() {
            reversed().forEach { scene ->
                scene.pause()
            }
        }

        internal fun List<LifecycleScene>.dispose() {
            reversed().forEach { scene ->
                scene.dispose()
            }
        }
    }
}
