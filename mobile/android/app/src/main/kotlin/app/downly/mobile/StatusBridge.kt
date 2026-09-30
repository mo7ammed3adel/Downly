package app.downly.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

/**
 * WhatsApp statuses. On Android 11+ they live in Android/media/…/.Statuses, which apps can only
 * read after the user grants that folder once in the system picker (the grant is kept). Older
 * Android versions read the folder directly. Statuses are copied into the app cache so Flutter can
 * show them as plain files, with a JPEG frame for each video.
 */
class StatusBridge(private val activity: Activity, messenger: BinaryMessenger) {
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private var pending: MethodChannel.Result? = null
    private var pendingApp: String? = null

    private val apps = mapOf(
        "whatsapp" to ("Android/media/com.whatsapp/WhatsApp/Media/.Statuses" to "WhatsApp/Media/.Statuses"),
        "business" to ("Android/media/com.whatsapp.w4b/WhatsApp Business/Media/.Statuses" to "WhatsApp Business/Media/.Statuses"),
    )

    private val usePicker get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

    init {
        MethodChannel(messenger, "downly/status").setMethodCallHandler { call, result ->
            val app = call.argument<String>("app") ?: "whatsapp"
            when (call.method) {
                "hasAccess" -> result.success(!usePicker || treeFor(app) != null)
                "requestAccess" -> requestAccess(app, result)
                "list" -> worker.execute {
                    try {
                        val items = list(app)
                        main.post { result.success(items) }
                    } catch (e: Exception) {
                        main.post { result.error("status", e.message, null) }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun docId(app: String) = "primary:" + apps.getValue(app).first

    private fun treeFor(app: String): Uri? = activity.contentResolver.persistedUriPermissions
        .firstOrNull { it.isReadPermission && runCatching { DocumentsContract.getTreeDocumentId(it.uri) }.getOrNull() == docId(app) }
        ?.uri

    private fun requestAccess(app: String, result: MethodChannel.Result) {
        if (!usePicker) return result.success(true)
        pending = result
        pendingApp = app
        val initial = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", docId(app))
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .putExtra(DocumentsContract.EXTRA_INITIAL_URI, initial)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        activity.startActivityForResult(intent, REQUEST_CODE)
    }

    /** Called from MainActivity.onActivityResult */
    fun onResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        val result = pending ?: return true
        val app = pendingApp ?: "whatsapp"
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            result.success(false)
            return true
        }
        // The user may have picked another folder
        if (DocumentsContract.getTreeDocumentId(uri) != docId(app)) {
            result.error("wrongFolder", "Pick the .Statuses folder", null)
            return true
        }
        activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        result.success(true)
        return true
    }

    private fun list(app: String): List<Map<String, Any?>> {
        val cache = File(activity.cacheDir, "statuses/$app").apply { mkdirs() }
        val thumbs = File(activity.cacheDir, "statuses/thumbs").apply { mkdirs() }
        val found = mutableListOf<Map<String, Any?>>()
        val keep = mutableSetOf<String>()

        fun add(name: String, size: Long, modified: Long, copy: (File) -> Unit) {
            val lower = name.lowercase()
            val video = lower.endsWith(".mp4") || lower.endsWith(".3gp") || lower.endsWith(".mkv")
            val image = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")
            if (!video && !image) return
            val local = File(cache, name)
            if (!local.exists() || local.length() != size) copy(local)
            keep += name
            var thumb: String? = null
            if (video) {
                val t = File(thumbs, "$name.jpg")
                if (!t.exists()) runCatching { frame(local, t) }
                if (t.exists()) thumb = t.absolutePath
            }
            found += mapOf("path" to local.absolutePath, "name" to name, "video" to video, "modified" to modified, "thumb" to thumb)
        }

        if (usePicker) {
            val tree = treeFor(app) ?: return emptyList()
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
            val columns = arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            )
            activity.contentResolver.query(children, columns, null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    val doc = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0))
                    add(c.getString(1), c.getLong(2), c.getLong(3)) { target ->
                        activity.contentResolver.openInputStream(doc)?.use { input -> target.outputStream().use { input.copyTo(it) } }
                    }
                }
            }
        } else {
            @Suppress("DEPRECATION")
            val root = Environment.getExternalStorageDirectory()
            val (modern, legacy) = apps.getValue(app)
            val dir = listOf(File(root, modern), File(root, legacy)).firstOrNull { it.isDirectory } ?: return emptyList()
            dir.listFiles()?.forEach { f -> add(f.name, f.length(), f.lastModified()) { f.copyTo(it, overwrite = true) } }
        }

        // Statuses expire after 24 hours; drop the cached copies of the ones that are gone
        cache.listFiles()?.filter { it.name !in keep }?.forEach { it.delete() }
        return found.sortedByDescending { it["modified"] as Long }
    }

    private fun frame(video: File, out: File) {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(video.absolutePath)
            val bitmap = retriever.getFrameAtTime(0) ?: return
            val scale = 360f / maxOf(bitmap.width, bitmap.height)
            val small = if (scale < 1) Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true) else bitmap
            out.outputStream().use { small.compress(Bitmap.CompressFormat.JPEG, 80, it) }
        } finally {
            retriever.release()
        }
    }

    companion object {
        private const val REQUEST_CODE = 4711
    }
}
