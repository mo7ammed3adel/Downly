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
