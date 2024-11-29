plugins {
    kotlin("jvm")
}

java.toolchain.languageVersion.set(JavaLanguageVersion.of(BuildConfig.JAVA_VERSION))

dependencies {
    api(Dependencies.KOTLINX_COROUTINES_CORE)
    api(Dependencies.GDX)
    api(Dependencies.GDX_FREETYPE)
    api(Dependencies.KTX_ACTORS)
//    api(Dependencies.KTX_AI)
    api(Dependencies.KTX_APP)
//    api(Dependencies.KTX_ARTEMIS)
//    api(Dependencies.KTX_ASHLEY)
    api(Dependencies.KTX_ASSETS)
    api(Dependencies.KTX_ASSETS_ASYNC)
    api(Dependencies.KTX_ASYNC)
//    api(Dependencies.KTX_BOX2D)
    api(Dependencies.KTX_COLLECTIONS)
    api(Dependencies.KTX_FREETYPE)
    api(Dependencies.KTX_FREETYPE_ASYNC)
    api(Dependencies.KTX_GRAPHICS)
    api(Dependencies.KTX_I18N)
    api(Dependencies.KTX_INJECT)
    api(Dependencies.KTX_JSON)
    api(Dependencies.KTX_LOG)
    api(Dependencies.KTX_MATH)
    api(Dependencies.KTX_PREFERENCES)
    api(Dependencies.KTX_REFLECT)
    api(Dependencies.KTX_SCENE2D)
//    api(Dependencies.KTX_SCRIPT)
    api(Dependencies.KTX_STYLE)
    api(Dependencies.KTX_TILED)
//    api(Dependencies.KTX_VIS)
//    api(Dependencies.KTX_VIS_STYLE)
    api(Dependencies.GSON)
}
