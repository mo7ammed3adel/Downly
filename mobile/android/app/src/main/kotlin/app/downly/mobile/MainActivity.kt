package app.downly.mobile

import android.content.Intent
import android.os.Build
import android.view.WindowManager
import com.ryanheise.audioservice.AudioServiceFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// A FlutterFragmentActivity (local_auth's fingerprint prompt) that also hosts the background music engine
class MainActivity : AudioServiceFragmentActivity() {
    private var appChannel: MethodChannel? = null
    private var pendingShare: String? = null
    private var statuses: StatusBridge? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        EngineBridge(applicationContext, messenger)
        statuses = StatusBridge(this, messenger)
        pendingShare = sharedText(intent)
        appChannel = MethodChannel(messenger, "downly/app").apply {
            // The engine outlives the activity (background music), so after Back + Share the Dart
            // side is already running and never asks for the initial share again: push it
            pendingShare?.let { text ->
                invokeMethod("shared", text, object : MethodChannel.Result {
                    override fun success(result: Any?) {
                        pendingShare = null
                    }

                    override fun error(code: String, message: String?, details: Any?) {}
                    override fun notImplemented() {} // cold start: Dart reads it with initialShare
                })
            }
            setMethodCallHandler { call, result ->
                when (call.method) {
                    // The link the app was opened with (Share → Downly), once
                    "initialShare" -> {
                        result.success(pendingShare)
                        pendingShare = null
                    }
                    // Hides the vault from screenshots and the recent-apps preview
                    "secure" -> {
                        if (call.argument<Boolean>("on") == true) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(null)
                    }
                    // When the clipboard last changed, without reading it (reading shows Android's
                    // "pasted from your clipboard" toast); -1 when unknown, null when empty
                    "clipStamp" -> {
                        val description = getSystemService(android.content.ClipboardManager::class.java)?.primaryClipDescription
                        result.success(
                            when {
                                description == null -> null
                                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> description.timestamp
                                else -> -1L
                            }
                        )
                    }
                    "appInfo" -> {
                        val info = packageManager.getPackageInfo(packageName, 0)
                        result.success(mapOf("version" to info.versionName, "abi" to Build.SUPPORTED_ABIS.firstOrNull()))
                    }
                    // Hands a downloaded update to Android's installer; false = the user must first
                    // allow Downly to install apps (the settings screen is opened)
                    "installApk" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
                            startActivity(
                                Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:$packageName"))
                            )
                            result.success(false)
                        } else {
                            val file = java.io.File(call.argument<String>("path")!!)
                            val uri = androidx.core.content.FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
                            startActivity(
                                Intent(Intent.ACTION_VIEW)
                                    .setDataAndType(uri, "application/vnd.android.package-archive")
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                            )
                            result.success(true)
                        }
                    }
                    "pip" -> {
                        val ok = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && try {
                            enterPictureInPictureMode(android.app.PictureInPictureParams.Builder().build())
                        } catch (e: Exception) {
                            false
                        }
                        result.success(ok)
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    @Deprecated("Needed for the folder picker of the WhatsApp statuses")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (statuses?.onResult(requestCode, resultCode, data) != true) super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        sharedText(intent)?.let { appChannel?.invokeMethod("shared", it) }
    }

    private fun sharedText(intent: Intent?): String? = when (intent?.action) {
        Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
        Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
        Intent.ACTION_VIEW -> intent.dataString
        else -> null
    }
}
