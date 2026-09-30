package app.downly.mobile

import android.content.Intent
import android.os.Build
import android.view.WindowManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity: needed by local_auth for the fingerprint prompt
class MainActivity : FlutterFragmentActivity() {
    private var appChannel: MethodChannel? = null
    private var pendingShare: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        EngineBridge(applicationContext, messenger)
        pendingShare = sharedText(intent)
        appChannel = MethodChannel(messenger, "downly/app").apply {
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
