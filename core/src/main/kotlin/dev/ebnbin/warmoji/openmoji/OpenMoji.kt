package dev.ebnbin.warmoji.openmoji

import com.google.gson.annotations.Expose
import com.google.gson.annotations.SerializedName

data class OpenMoji(
    @Expose
    @SerializedName("hexcode")
    val hexcode: String,
    @Expose
    @SerializedName("order")
    val order: String,
)
