object Dependencies {
    private object Versions {
        // https://github.com/libgdx/libgdx
        const val GDX = "1.12.1"

        // https://github.com/MobiVM/robovm
        const val ROBOVM = "2.3.22"
    }

    // https://github.com/JetBrains/kotlin
    const val KOTLIN_GRADLE_PLUGIN = "org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.0"

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
}
