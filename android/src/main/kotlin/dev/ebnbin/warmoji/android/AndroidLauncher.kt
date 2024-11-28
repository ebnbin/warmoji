package dev.ebnbin.warmoji.android

import android.os.Bundle
import com.badlogic.gdx.backends.android.AndroidApplication
import com.badlogic.gdx.backends.android.AndroidApplicationConfiguration
import dev.ebnbin.warmoji.WarMoji

class AndroidLauncher : AndroidApplication() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val listener = WarMoji()
        val config = AndroidApplicationConfiguration()
        initialize(listener, config)
    }
}
