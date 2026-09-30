package app.downly.mobile

import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaScannerConnection
import android.provider.MediaStore
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import com.yausername.aria2c.Aria2c
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

/**
 * Flutter ↔ yt-dlp. Every call runs on a worker thread; results and download events come back on
 * the main thread. Download events are maps with an "id" and a "type": progress, phase, done, error
 * or canceled.
 */
class EngineBridge(private val context: Context, messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val main = Handler(Looper.getMainLooper())
    private val workers = Executors.newCachedThreadPool()
    private var events: EventChannel.EventSink? = null
    @Volatile private var ready = false

    init {
        MethodChannel(messenger, "downly/engine").setMethodCallHandler(this)
        EventChannel(messenger, "downly/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                events = sink
            }

            override fun onCancel(arguments: Any?) {
                events = null
            }
        })
    }

    private fun emit(event: Map<String, Any?>) = main.post { events?.success(event) }

    private fun background(result: MethodChannel.Result, work: () -> Any?) {
        workers.execute {
            try {
                val value = work()
                main.post { result.success(value) }
            } catch (e: Throwable) {
                main.post { result.error("engine", cleanError(e), null) }
            }
        }
    }

    @Synchronized
    private fun ensureReady() {
        if (ready) return
        YoutubeDL.getInstance().init(context)
        FFmpeg.getInstance().init(context)
        Aria2c.getInstance().init(context)
        ready = true
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "init" -> background(result) {
                ensureReady()
                YoutubeDL.getInstance().versionName(context) ?: YoutubeDL.getInstance().version(context)
            }
            "update" -> background(result) {
                ensureReady()
                val status = YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel.STABLE)
                mapOf(
                    "status" to (status?.name ?: "UNKNOWN"),
                    "version" to (YoutubeDL.getInstance().versionName(context) ?: YoutubeDL.getInstance().version(context))
                )
            }
            "info" -> background(result) {
                ensureReady()
                val request = YoutubeDLRequest(call.argument<String>("url")!!)
                request.addCommands(call.argument<List<String>>("args") ?: emptyList())
                YoutubeDL.getInstance().execute(request).out
            }
            "download" -> {
                val id = call.argument<String>("id")!!
                val url = call.argument<String>("url")!!
                val args = call.argument<List<String>>("args") ?: emptyList()
                workers.execute { download(id, url, args) }
                result.success(null)
            }
            "cancel" -> {
                result.success(YoutubeDL.getInstance().destroyProcessById(call.argument<String>("id")!!))
            }
            "publicDir" -> {
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Downly")
                result.success(dir.absolutePath)
            }
            "freeSpace" -> {
                val stat = StatFs(Environment.getExternalStorageDirectory().absolutePath)
                result.success(stat.availableBytes)
            }
            "scan" -> {
                scan(call.argument<String>("path")!!)
                result.success(null)
            }
            "move" -> background(result) {
                val from = File(call.argument<String>("from")!!)
                val to = File(call.argument<String>("to")!!)
                to.parentFile?.mkdirs()
                if (!from.renameTo(to)) {
                    from.copyTo(to, overwrite = true)
                    from.delete()
                }
                // Tells the gallery the old file is gone and the new one (if public) exists
                scan(from.absolutePath)
                scan(to.absolutePath)
                true
            }
            "delete" -> background(result) {
                val file = File(call.argument<String>("path")!!)
                val deleted = !file.exists() || file.delete()
                scan(file.absolutePath)
                deleted
            }
            "service" -> {
                val title = call.argument<String>("title") ?: "Downly"
                val text = call.argument<String>("text") ?: ""
                val progress = call.argument<Int>("progress") ?: -1
                DownloadService.update(context, title, text, progress)
                result.success(null)
            }
            "serviceStop" -> {
                DownloadService.stop(context)
                result.success(null)
            }
            "songs" -> background(result) { songs() }
            "artwork" -> background(result) { artwork(call.argument<String>("path")!!) }
            "notifyDone" -> {
                DownloadService.finished(context, call.argument<String>("title") ?: "Downly", call.argument<String>("text") ?: "")
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    /** Every song on the phone (30 seconds or longer, so ringtones and voice notes are skipped) */
    private fun songs(): List<Map<String, Any?>> {
        val columns = arrayOf(
            MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.DATA, MediaStore.Audio.Media.DATE_ADDED,
        )
        val songs = mutableListOf<Map<String, Any?>>()
        context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, columns,
            "${MediaStore.Audio.Media.DURATION} >= 30000", null, "${MediaStore.Audio.Media.DATE_ADDED} DESC",
        )?.use { c ->
            while (c.moveToNext()) {
                val path = c.getString(4) ?: continue
                if (!File(path).exists()) continue
                songs += mapOf(
                    "title" to c.getString(0), "artist" to c.getString(1)?.takeUnless { it == "<unknown>" },
                    "album" to c.getString(2), "duration" to c.getLong(3), "path" to path, "added" to c.getLong(5),
                )
            }
        }
        return songs
    }

    /** The cover embedded in a song (yt-dlp embeds it), cached as a JPEG */
    private fun artwork(path: String): String? {
        val dir = File(context.cacheDir, "artwork").apply { mkdirs() }
        val out = File(dir, "${path.hashCode()}.jpg")
        if (out.exists()) return out.absolutePath.takeIf { out.length() > 0 }
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(path)
            val picture = retriever.embeddedPicture
            out.writeBytes(picture ?: ByteArray(0)) // an empty file remembers "no cover"
            if (picture != null) out.absolutePath else null
        } catch (e: Exception) {
            null
        } finally {
            retriever.release()
        }
    }

    private fun scan(path: String) {
        MediaScannerConnection.scanFile(context, arrayOf(path), null, null)
    }

    private fun download(id: String, url: String, args: List<String>) {
        try {
            ensureReady()
            val request = YoutubeDLRequest(url)
            request.addCommands(args)
            // Machine-readable progress and the final path, parsed below
            request.addOption("--newline")
            request.addOption("--progress")
            request.addOption(
                "--progress-template",
                "download:DL|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s"
            )
            // --print makes yt-dlp quiet, so the post-processing stages come from their own template
            request.addOption("--progress-template", "postprocess:PP|%(progress.postprocessor)s|%(progress.status)s")
            request.addOption("--print", "after_move:DONE|%(filepath)s")
            var path: String? = null
            YoutubeDL.getInstance().execute(request, id) { _, _, line ->
                when {
                    line.startsWith("DL|") -> {
                        val p = line.split("|")
                        fun num(i: Int) = p.getOrNull(i)?.toDoubleOrNull()
                        emit(
                            mapOf(
                                "id" to id, "type" to "progress",
                                "downloaded" to num(1), "total" to (num(2) ?: num(3)),
                                "speed" to num(4), "eta" to num(5)
                            )
                        )
                    }
                    line.startsWith("DONE|") -> path = line.removePrefix("DONE|").trim()
                    line.startsWith("PP|") && line.endsWith("|started") -> {
                        val phase = when (line.split("|").getOrNull(1)) {
                            "Merger" -> "merging"
                            "ExtractAudio" -> "converting"
                            else -> "finishing"
                        }
                        emit(mapOf("id" to id, "type" to "phase", "phase" to phase))
                    }
                }
            }
            path?.let { scan(it) }
            emit(mapOf("id" to id, "type" to "done", "path" to path))
        } catch (e: YoutubeDL.CanceledException) {
            emit(mapOf("id" to id, "type" to "canceled"))
        } catch (e: Throwable) {
            emit(mapOf("id" to id, "type" to "error", "message" to cleanError(e)))
        }
    }

    /** yt-dlp prints warnings and a traceback; the useful part is the last "ERROR:" line. */
    private fun cleanError(e: Throwable): String {
        val text = (e as? YoutubeDLException)?.message ?: e.message ?: e.toString()
        return text.lines().lastOrNull { it.startsWith("ERROR:") }?.removePrefix("ERROR:")?.trim()
            ?: text.lines().lastOrNull { it.isNotBlank() }?.trim()
            ?: "Unknown error"
    }
}
