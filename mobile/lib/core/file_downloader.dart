import 'dart:async';
import 'dart:io';

/// Plain file downloads (zip, apk, pdf…) that yt-dlp doesn't handle. When the server allows
/// ranges, the file is split into up to 8 parts downloaded in parallel. Each part is its own
/// ".partN" file, so pausing and resuming just continues every part where it stopped.
class FileDownloader {
  FileDownloader._(this.url, this.headers);

  final String url;
  final Map<String, String> headers;
  final _client = HttpClient()..userAgent = null;
  bool _stopped = false;

  static final _jobs = <String, FileDownloader>{};

  static const _minPart = 1024 * 1024;
  static const _maxParts = 8;

  static void cancel(String id) {
    final job = _jobs.remove(id);
    job?._stopped = true;
    job?._client.close(force: true);
  }

  /// Downloads into [dir] (or continues [existingPath]) and returns the final path.
  static Future<String> start({
    required String id,
    required String url,
    required String dir,
    required Map<String, String> headers,
    String? existingPath,
    required void Function(int downloaded, int? total, double speed) onProgress,
    void Function(String path)? onPath,
  }) async {
    final job = FileDownloader._(url, headers);
    _jobs[id] = job;
    try {
      return await job._run(dir, existingPath, onProgress, onPath);
    } catch (e) {
      // Closing the connections on pause surfaces as network errors
      if (job._stopped) throw const _Stopped();
      rethrow;
    } finally {
      _jobs.remove(id);
      job._client.close(force: true);
    }
  }

  Future<HttpClientResponse> _get(int? from, int? to) async {
    final request = await _client.getUrl(Uri.parse(url));
    headers.forEach(request.headers.set);
    if (from != null) request.headers.set(HttpHeaders.rangeHeader, 'bytes=$from-${to ?? ''}');
    return request.close();
  }

  Future<String> _run(
    String dir,
    String? existingPath,
    void Function(int, int?, double) onProgress,
    void Function(String)? onPath,
  ) async {
    // Probe: size, range support and file name
    final probe = await _get(0, 0);
    final ranged = probe.statusCode == 206;
    int? total;
    final contentRange = probe.headers.value(HttpHeaders.contentRangeHeader);
    if (contentRange != null) total = int.tryParse(contentRange.split('/').last);
    total ??= probe.contentLength > 0 ? probe.contentLength : null;
    final name = _fileName(probe.headers.value('content-disposition'));
    await probe.drain<void>().catchError((_) {});
    if (probe.statusCode >= 400) throw HttpException('HTTP ${probe.statusCode}');

    await Directory(dir).create(recursive: true);
    final path = existingPath ?? await _uniquePath(dir, name);
    onPath?.call(path);

    final parts = <({int start, int? end})>[];
    if (ranged && total != null && total >= 2 * _minPart) {
      final count = (total ~/ _minPart).clamp(2, _maxParts);
      final size = (total / count).ceil();
      for (var i = 0; i < count; i++) {
        parts.add((start: i * size, end: i == count - 1 ? total - 1 : (i + 1) * size - 1));
      }
    } else {
      parts.add((start: 0, end: total != null ? total - 1 : null));
    }

    final got = List<int>.filled(parts.length, 0);
    for (var i = 0; i < parts.length; i++) {
      final f = File('$path.part$i');
      if (await f.exists()) got[i] = await f.length();
    }
    // Without range support a restart has to begin from zero
    if (!ranged) {
      for (var i = 0; i < parts.length; i++) {
        got[i] = 0;
      }
    }

    var lastBytes = got.fold(0, (a, b) => a + b);
    var lastTime = DateTime.now();
    var speed = 0.0;
    final ticker = Timer.periodic(const Duration(milliseconds: 700), (_) {
      final now = DateTime.now();
      final bytes = got.fold(0, (a, b) => a + b);
      final seconds = now.difference(lastTime).inMilliseconds / 1000;
      speed = seconds > 0 ? (bytes - lastBytes) / seconds : 0;
      lastBytes = bytes;
      lastTime = now;
      onProgress(bytes, total, speed);
    });

    try {
      await Future.wait([
        for (var i = 0; i < parts.length; i++)
          _part(i, parts[i].start, parts[i].end, got, File('$path.part$i'), ranged),
      ]);
    } finally {
      ticker.cancel();
    }
    if (_stopped) throw const _Stopped();

    // Join the parts into the final file
    final out = File(path).openWrite();
    for (var i = 0; i < parts.length; i++) {
      await out.addStream(File('$path.part$i').openRead());
    }
    await out.close();
    for (var i = 0; i < parts.length; i++) {
      await File('$path.part$i').delete();
    }
    final size = await File(path).length();
    onProgress(size, size, 0);
    return path;
  }

  Future<void> _part(int i, int start, int? end, List<int> got, File file, bool ranged) async {
    if (end != null && got[i] >= end - start + 1) return;
    final response = await _get(ranged ? start + got[i] : null, ranged ? end : null);
    if (response.statusCode >= 400) throw HttpException('HTTP ${response.statusCode}');
    final sink = file.openWrite(mode: ranged ? FileMode.append : FileMode.write);
    try {
      await for (final chunk in response) {
        if (_stopped) break;
        sink.add(chunk);
        got[i] += chunk.length;
      }
    } finally {
      await sink.close();
    }
  }

  String _fileName(String? disposition) {
    final match = disposition == null
        ? null
        : RegExp(r"""filename\*?=(?:UTF-8'')?["']?([^"';]+)""", caseSensitive: false).firstMatch(disposition);
    var name = match != null ? Uri.decodeComponent(match.group(1)!) : Uri.parse(url).pathSegments.lastWhere((s) => s.isNotEmpty, orElse: () => 'download');
    name = name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    return name.isEmpty ? 'download' : name;
  }

  static Future<String> _uniquePath(String dir, String name) async {
    final dot = name.lastIndexOf('.');
    final base = dot > 0 ? name.substring(0, dot) : name;
    final ext = dot > 0 ? name.substring(dot) : '';
    var path = '$dir/$name';
    for (var n = 1; await File(path).exists() || await File('$path.part0').exists(); n++) {
      path = '$dir/$base ($n)$ext';
    }
    return path;
  }
}

class _Stopped implements Exception {
  const _Stopped();
}

bool isStopped(Object e) => e is _Stopped;
