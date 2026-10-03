package com.innotrepid.security

import android.app.Activity
import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.atomic.AtomicBoolean

class PlayIntegrityPlugin(private val context: Context) : MethodChannel.MethodCallHandler {
    companion object {
        const val CHANNEL = "innotrepid_security/play_integrity"
    }

    private val manager = IntegrityManagerFactory.create(context)
    private val busy = AtomicBoolean(false)

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "requestToken" -> {
                val requestHash = call.argument<String>("requestHash")
                if (requestHash.isNullOrBlank()) {
                    result.error("INVALID_ARGUMENT", "requestHash is required", null)
                    return
                }
                if (!busy.compareAndSet(false, true)) {
                    result.error("BUSY", "A Play Integrity request is already running", null)
                    return
                }

                manager.requestIntegrityToken(
                    IntegrityTokenRequest.builder()
                        .setCloudProjectNumber(
                            call.argument<Long>("cloudProjectNumber")
                                ?: return result.error(
                                    "INVALID_ARGUMENT",
                                    "cloudProjectNumber is required",
                                    null
                                )
                        )
                        .setRequestHash(requestHash)
                        .build()
                ).addOnSuccessListener { response ->
                    busy.set(false)
                    result.success(response.token())
                }.addOnFailureListener { error ->
                    busy.set(false)
                    result.error(
                        "INTEGRITY_REQUEST_FAILED",
                        error.message ?: "Play Integrity request failed",
                        null
                    )
                }
            }
            else -> result.notImplemented()
        }
    }
}
