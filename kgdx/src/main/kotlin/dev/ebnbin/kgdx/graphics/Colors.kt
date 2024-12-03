package dev.ebnbin.kgdx.graphics

import com.badlogic.gdx.graphics.Color

fun Color.copy(
    r: Float? = null,
    g: Float? = null,
    b: Float? = null,
    a: Float? = null,
): Color {
    return Color(
        r ?: this.r,
        g ?: this.g,
        b ?: this.b,
        a ?: this.a,
    )
}
