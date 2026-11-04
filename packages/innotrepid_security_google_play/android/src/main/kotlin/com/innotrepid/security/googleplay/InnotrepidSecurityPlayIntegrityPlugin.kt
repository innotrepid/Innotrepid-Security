package com.innotrepid.security.googleplay

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.atomic.AtomicBoolean

class InnotrepidSecurityPlayIntegrityPlugin : FlutterPlugin {
    private lateinit var channel: MethodChannel
    private lateinit var integrityHandler: PlayIntegrityHandler

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        integrityHandler = PlayIntegrityHandler(binding.applicationContext)
        channel = MethodChannel(binding.binaryMessenger, PlayIntegrityHandler.CHANNEL)
        channel.setMethodCallHandler(integrityHandler)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }
}

private class PlayIntegrityHandler(private val context: Context) :
    MethodChannel.MethodCallHandler {
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

                val cloudProjectNumber =
                    call.argument<Number>("cloudProjectNumber")?.toLong()
                if (cloudProjectNumber == null || cloudProjectNumber <= 0L) {
                    result.error("INVALID_ARGUMENT", "cloudProjectNumber is required", null)
                    return
                }

                if (!busy.compareAndSet(false, true)) {
                    result.error("BUSY", "A Play Integrity request is already running", null)
                    return
                }

                try {
                    manager.requestIntegrityToken(
                        IntegrityTokenRequest.builder()
                            .setCloudProjectNumber(cloudProjectNumber)
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
                } catch (error: Throwable) {
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
