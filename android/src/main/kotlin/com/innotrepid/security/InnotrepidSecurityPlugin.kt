package com.innotrepid.security

import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodChannel

class InnotrepidSecurityPlugin : FlutterPlugin {
    private lateinit var channel: MethodChannel
    private lateinit var integrityHandler: PlayIntegrityPlugin

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        integrityHandler = PlayIntegrityPlugin(binding.applicationContext)
        channel = MethodChannel(binding.binaryMessenger, PlayIntegrityPlugin.CHANNEL)
        channel.setMethodCallHandler(integrityHandler)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }
}
