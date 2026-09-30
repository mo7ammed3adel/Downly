/// What yt-dlp knows about a link.
class MediaInfo {
  MediaInfo({
    required this.url,
    required this.title,
    this.thumbnail,
    this.uploader,
    this.duration,
    this.site,
    this.heights = const [],
    this.videoSizes = const {},
    this.audioSize,
    this.entries = const [],
    this.hasVideo = true,
  });

  final String url;
  final String title;
  final String? thumbnail;
  final String? uploader;
  final Duration? duration;
  final String? site;

  /// Available video heights, highest first
  final List<int> heights;

  /// Estimated file size per height (video + best audio), when known
  final Map<int, int> videoSizes;
  final int? audioSize;
  final List<PlaylistEntry> entries;
  final bool hasVideo;

  bool get isPlaylist => entries.isNotEmpty;

  factory MediaInfo.fromJson(Map<String, dynamic> j, String originalUrl) {
    final formats = (j['formats'] as List? ?? []).cast<Map<String, dynamic>>();
    int? size(Map<String, dynamic> f) => (f['filesize'] ?? f['filesize_approx']) is num
        ? ((f['filesize'] ?? f['filesize_approx']) as num).toInt()
        : null;

    // Best audio-only stream (used for audio downloads and added to video-only streams)
    int? bestAudio;
    double bestAbr = -1;
    for (final f in formats) {
      if (f['vcodec'] == 'none' && f['acodec'] != 'none') {
        final abr = (f['abr'] as num?)?.toDouble() ?? 0;
        if (abr > bestAbr) {
          bestAbr = abr;
          bestAudio = size(f);
        }
      }
    }

    final sizes = <int, int>{};
    final heights = <int>{};
    for (final f in formats) {
      final h = (f['height'] as num?)?.toInt();
      if (h == null || h < 100 || f['vcodec'] == 'none') continue;
      heights.add(h);
      final s = size(f);
      if (s == null) continue;
      final withAudio = f['acodec'] == 'none' ? s + (bestAudio ?? 0) : s;
      // Largest stream per height, so the size shown is never an underestimate
      if (sizes[h] == null || withAudio > sizes[h]!) sizes[h] = withAudio;
    }
    final single = (j['height'] as num?)?.toInt();
    if (heights.isEmpty && single != null) heights.add(single);

    final entries = <PlaylistEntry>[];
    if (j['_type'] == 'playlist') {
      for (final e in (j['entries'] as List? ?? []).whereType<Map<String, dynamic>>()) {
        final url = (e['url'] ?? e['webpage_url']) as String?;
        if (url == null) continue;
        entries.add(PlaylistEntry(
          url: url,
          title: (e['title'] as String?) ?? url,
          duration: (e['duration'] as num?) != null ? Duration(seconds: (e['duration'] as num).round()) : null,
          thumbnail: _thumb(e),
        ));
      }
    }

    final vcodec = j['vcodec'] as String?;
    final audioOnly = formats.isNotEmpty ? formats.every((f) => f['vcodec'] == 'none') : vcodec == 'none';

    return MediaInfo(
      url: (j['webpage_url'] as String?) ?? originalUrl,
      title: (j['title'] as String?) ?? originalUrl,
      thumbnail: _thumb(j) ?? (entries.isNotEmpty ? entries.first.thumbnail : null),
      uploader: (j['uploader'] ?? j['channel']) as String?,
      duration: (j['duration'] as num?) != null ? Duration(seconds: (j['duration'] as num).round()) : null,
      site: (j['extractor_key'] ?? j['extractor']) as String?,
      heights: heights.toList()..sort((a, b) => b - a),
      videoSizes: sizes,
      audioSize: bestAudio ?? (audioOnly ? size(j) : null),
      entries: entries,
      hasVideo: !audioOnly,
    );
  }

  static String? _thumb(Map<String, dynamic> j) {
    if (j['thumbnail'] is String) return j['thumbnail'] as String;
    final list = (j['thumbnails'] as List?)?.whereType<Map>().toList();
    if (list == null || list.isEmpty) return null;
    return list.last['url'] as String?;
  }
}

class PlaylistEntry {
  PlaylistEntry({required this.url, required this.title, this.duration, this.thumbnail});

  final String url;
  final String title;
  final Duration? duration;
  final String? thumbnail;
}

enum TaskKind { video, audio, file }

enum TaskStatus { queued, running, paused, done, failed }

class DownloadTask {
  DownloadTask({
    required this.id,
    required this.url,
    required this.title,
    required this.kind,
    required this.args,
    this.thumbnail,
    this.quality,
    this.site,
    this.private = false,
    this.headers = const {},
    this.status = TaskStatus.queued,
    this.path,
    this.error,
    this.downloaded = 0,
    this.total,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String url;
  String title;
  final TaskKind kind;

  /// yt-dlp options; empty for plain files (downloaded by FileDownloader)
  final List<String> args;
  final String? thumbnail;
  final String? quality;
  final String? site;

  /// Moved into the vault when finished
  final bool private;

  /// Referer / cookies / user agent for plain files from the browser
  final Map<String, String> headers;
  TaskStatus status;
  String? path;
  String? error;
  int downloaded;
  int? total;
  final DateTime createdAt;

  // live only
  double speed = 0;
  int? eta;
  String? phase;

  double? get progress => total != null && total! > 0 ? (downloaded / total!).clamp(0, 1) : null;

  bool get isActive => status == TaskStatus.queued || status == TaskStatus.running;

  Map<String, dynamic> toJson() => {
        'id': id,
        'url': url,
        'title': title,
        'kind': kind.name,
        'args': args,
        'thumbnail': thumbnail,
        'quality': quality,
        'site': site,
        'private': private,
        'headers': headers,
        'status': status.name,
        'path': path,
        'error': error,
        'downloaded': downloaded,
        'total': total,
        'createdAt': createdAt.toIso8601String(),
      };

  factory DownloadTask.fromJson(Map<String, dynamic> j) => DownloadTask(
        id: j['id'] as String,
        url: j['url'] as String,
        title: j['title'] as String,
        kind: TaskKind.values.byName(j['kind'] as String),
        args: (j['args'] as List).cast<String>(),
        thumbnail: j['thumbnail'] as String?,
        quality: j['quality'] as String?,
        site: j['site'] as String?,
        private: j['private'] as bool? ?? false,
        headers: Map<String, String>.from(j['headers'] as Map? ?? {}),
        status: TaskStatus.values.byName(j['status'] as String),
        path: j['path'] as String?,
        error: j['error'] as String?,
        downloaded: (j['downloaded'] as num?)?.toInt() ?? 0,
        total: (j['total'] as num?)?.toInt(),
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? ''),
      );
}

// ---------------------------------------------------------------- formatting helpers

String formatBytes(num? bytes) {
  if (bytes == null || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  var value = bytes.toDouble();
  var i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return '${value.toStringAsFixed(value >= 100 || i == 0 ? 0 : 1)} ${units[i]}';
}

String formatDuration(Duration? d) {
  if (d == null) return '';
  final h = d.inHours;
  final m = d.inMinutes.remainder(60).toString().padLeft(h > 0 ? 2 : 1, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$m:$s' : '$m:$s';
}

String qualityLabel(int height) => switch (height) {
      >= 4320 => '8K',
      >= 2160 => '4K',
      >= 1440 => '2K',
      _ => '${height}p',
    };

/// Shared text is often "Look at this! https://…"; pull the link out
String? extractUrl(String? text) {
  if (text == null) return null;
  final match = RegExp(r'https?://[^\s<>"]+').firstMatch(text);
  return match?.group(0);
}
