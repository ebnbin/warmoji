package dev.ebnbin.kgdx.scene

interface Scene {
    fun resize(width: Int, height: Int)

    fun resume()

    fun render(deltaTime: Float)

    fun pause()

    fun dispose()

    companion object {
        internal fun List<Scene>.resize(width: Int, height: Int) {
            forEach { scene ->
                scene.resize(width, height)
            }
        }

        internal fun List<Scene>.resume() {
            forEach { scene ->
                scene.resume()
            }
        }

        internal fun List<Scene>.render(deltaTime: Float) {
            forEach { scene ->
                scene.render(deltaTime)
            }
        }

        internal fun List<Scene>.pause() {
            reversed().forEach { scene ->
                scene.pause()
            }
        }

        internal fun List<Scene>.dispose() {
            reversed().forEach { scene ->
                scene.dispose()
            }
        }
    }
}
