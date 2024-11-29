object Dependencies {
    private object Versions {
        // https://github.com/Kotlin/kotlinx.coroutines
        const val KOTLINX_COROUTINES = "1.9.0"

        // https://github.com/libgdx/libgdx
        const val GDX = "1.12.1"

        // https://github.com/MobiVM/robovm
        const val ROBOVM = "2.3.22"

        // https://github.com/libktx/ktx
        const val KTX = "1.12.1-rc2"

        // https://github.com/Mazatech/amanithsvg-sdk
        const val AMANITHSVG = "2.0.1"
    }

    // https://github.com/JetBrains/kotlin
    const val KOTLIN_GRADLE_PLUGIN = "org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.0"

    // https://github.com/Kotlin/kotlinx.coroutines
    const val KOTLINX_COROUTINES_CORE = "org.jetbrains.kotlinx:kotlinx-coroutines-core:${Versions.KOTLINX_COROUTINES}"
    const val KOTLINX_COROUTINES_ANDROID = "org.jetbrains.kotlinx:kotlinx-coroutines-android:${Versions.KOTLINX_COROUTINES}"

    // https://github.com/libgdx/libgdx
    const val GDX = "com.badlogicgames.gdx:gdx:${Versions.GDX}"
    const val GDX_BACKEND_LWJGL3 = "com.badlogicgames.gdx:gdx-backend-lwjgl3:${Versions.GDX}"
    const val GDX_BACKEND_ANDROID = "com.badlogicgames.gdx:gdx-backend-android:${Versions.GDX}"
    const val GDX_BACKEND_ROBOVM = "com.badlogicgames.gdx:gdx-backend-robovm:${Versions.GDX}"
    const val GDX_BACKEND_HEADLESS = "com.badlogicgames.gdx:gdx-backend-headless:${Versions.GDX}"
    const val GDX_PLATFORM_NATIVES_DESKTOP = "com.badlogicgames.gdx:gdx-platform:${Versions.GDX}:natives-desktop"
    const val GDX_PLATFORM_NATIVES_ARM64_V8A = "com.badlogicgames.gdx:gdx-platform:${Versions.GDX}:natives-arm64-v8a"
    const val GDX_PLATFORM_NATIVES_ARMEABI_V7A = "com.badlogicgames.gdx:gdx-platform:${Versions.GDX}:natives-armeabi-v7a"
    const val GDX_PLATFORM_NATIVES_X86 = "com.badlogicgames.gdx:gdx-platform:${Versions.GDX}:natives-x86"
    const val GDX_PLATFORM_NATIVES_X86_64 = "com.badlogicgames.gdx:gdx-platform:${Versions.GDX}:natives-x86_64"
    const val GDX_PLATFORM_NATIVES_IOS = "com.badlogicgames.gdx:gdx-platform:${Versions.GDX}:natives-ios"
    const val GDX_FREETYPE = "com.badlogicgames.gdx:gdx-freetype:${Versions.GDX}"
    const val GDX_FREETYPE_PLATFORM_NATIVES_DESKTOP = "com.badlogicgames.gdx:gdx-freetype-platform:${Versions.GDX}:natives-desktop"
    const val GDX_FREETYPE_PLATFORM_NATIVES_ARM64_V8A = "com.badlogicgames.gdx:gdx-freetype-platform:${Versions.GDX}:natives-arm64-v8a"
    const val GDX_FREETYPE_PLATFORM_NATIVES_ARMEABI_V7A = "com.badlogicgames.gdx:gdx-freetype-platform:${Versions.GDX}:natives-armeabi-v7a"
    const val GDX_FREETYPE_PLATFORM_NATIVES_X86 = "com.badlogicgames.gdx:gdx-freetype-platform:${Versions.GDX}:natives-x86"
    const val GDX_FREETYPE_PLATFORM_NATIVES_X86_64 = "com.badlogicgames.gdx:gdx-freetype-platform:${Versions.GDX}:natives-x86_64"
    const val GDX_FREETYPE_PLATFORM_NATIVES_IOS = "com.badlogicgames.gdx:gdx-freetype-platform:${Versions.GDX}:natives-ios"
    const val GDX_TOOLS = "com.badlogicgames.gdx:gdx-tools:${Versions.GDX}"

    // https://github.com/fourlastor-alexandria/construo
    const val CONSTRUO = "io.github.fourlastor:construo:1.5.1"

    // https://maven.google.com/web/index.html
    const val GRADLE = "com.android.tools.build:gradle:8.7.2"

    // https://github.com/MobiVM/robovm
    const val ROBOVM_GRADLE_PLUGIN = "com.mobidevelop.robovm:robovm-gradle-plugin:${Versions.ROBOVM}"
    const val ROBOVM_RT = "com.mobidevelop.robovm:robovm-rt:${Versions.ROBOVM}"
    const val ROBOVM_COCOATOUCH = "com.mobidevelop.robovm:robovm-cocoatouch:${Versions.ROBOVM}"

    // https://github.com/libktx/ktx
    const val KTX_ACTORS = "io.github.libktx:ktx-actors:${Versions.KTX}"
    const val KTX_AI = "io.github.libktx:ktx-ai:${Versions.KTX}"
    const val KTX_APP = "io.github.libktx:ktx-app:${Versions.KTX}"
    const val KTX_ARTEMIS = "io.github.libktx:ktx-artemis:${Versions.KTX}"
    const val KTX_ASHLEY = "io.github.libktx:ktx-ashley:${Versions.KTX}"
    const val KTX_ASSETS = "io.github.libktx:ktx-assets:${Versions.KTX}"
    const val KTX_ASSETS_ASYNC = "io.github.libktx:ktx-assets-async:${Versions.KTX}"
    const val KTX_ASYNC = "io.github.libktx:ktx-async:${Versions.KTX}"
    const val KTX_BOX2D = "io.github.libktx:ktx-box2d:${Versions.KTX}"
    const val KTX_COLLECTIONS = "io.github.libktx:ktx-collections:${Versions.KTX}"
    const val KTX_FREETYPE = "io.github.libktx:ktx-freetype:${Versions.KTX}"
    const val KTX_FREETYPE_ASYNC = "io.github.libktx:ktx-freetype-async:${Versions.KTX}"
    const val KTX_GRAPHICS = "io.github.libktx:ktx-graphics:${Versions.KTX}"
    const val KTX_I18N = "io.github.libktx:ktx-i18n:${Versions.KTX}"
    const val KTX_INJECT = "io.github.libktx:ktx-inject:${Versions.KTX}"
    const val KTX_JSON = "io.github.libktx:ktx-json:${Versions.KTX}"
    const val KTX_LOG = "io.github.libktx:ktx-log:${Versions.KTX}"
    const val KTX_MATH = "io.github.libktx:ktx-math:${Versions.KTX}"
    const val KTX_PREFERENCES = "io.github.libktx:ktx-preferences:${Versions.KTX}"
    const val KTX_REFLECT = "io.github.libktx:ktx-reflect:${Versions.KTX}"
    const val KTX_SCENE2D = "io.github.libktx:ktx-scene2d:${Versions.KTX}"
    const val KTX_SCRIPT = "io.github.libktx:ktx-script:${Versions.KTX}"
    const val KTX_STYLE = "io.github.libktx:ktx-style:${Versions.KTX}"
    const val KTX_TILED = "io.github.libktx:ktx-tiled:${Versions.KTX}"
    const val KTX_VIS = "io.github.libktx:ktx-vis:${Versions.KTX}"
    const val KTX_VIS_STYLE = "io.github.libktx:ktx-vis-style:${Versions.KTX}"

    // https://github.com/google/gson
    const val GSON = "com.google.code.gson:gson:2.11.0"

    // https://github.com/Mazatech/amanithsvg-sdk
    const val AMANITHSVG_GDX_NATIVES_DESKTOP = "com.mazatech.amanithsvg:amanithsvg-gdx:${Versions.AMANITHSVG}:natives-desktop"
    const val AMANITHSVG_GDX_NATIVES_ARM64_V8A = "com.mazatech.amanithsvg:amanithsvg-gdx:${Versions.AMANITHSVG}:natives-arm64-v8a"
    const val AMANITHSVG_GDX_NATIVES_ARMEABI_V7A = "com.mazatech.amanithsvg:amanithsvg-gdx:${Versions.AMANITHSVG}:natives-armeabi-v7a"
    const val AMANITHSVG_GDX_NATIVES_X86 = "com.mazatech.amanithsvg:amanithsvg-gdx:${Versions.AMANITHSVG}:natives-x86"
    const val AMANITHSVG_GDX_NATIVES_X86_64 = "com.mazatech.amanithsvg:amanithsvg-gdx:${Versions.AMANITHSVG}:natives-x86_64"
    const val AMANITHSVG_GDX_NATIVES_IOS = "com.mazatech.amanithsvg:amanithsvg-gdx:${Versions.AMANITHSVG}:natives-ios"
}
