import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'engine.dart';
import 'file_downloader.dart';
import 'library.dart';
import 'models.dart';
import 'settings.dart';
import 'vault.dart';

/// The download queue: runs up to [Settings.parallel] tasks at once, survives restarts
/// (running tasks come back paused) and keeps a notification up while anything runs.
class Downloads extends ChangeNotifier {
  Downloads(this._settings, this._vault, this._library, this._file);

  final Settings _settings;
  final Vault _vault;
  final Library _library;
  final File _file;
  List<DownloadTask> tasks = [];
  StreamSubscription<Map<String, dynamic>>? _events;
  Timer? _saveTimer;
  DateTime _lastNotification = DateTime(0);

  /// Called with a finished task (for the "done" snackbar)
  void Function(DownloadTask task)? onFinished;

  static Future<Downloads> load(Settings settings, Vault vault, Library library) async {
    final dir = await getApplicationSupportDirectory();
    final d = Downloads(settings, vault, library, File('${dir.path}/downloads.json'));
    if (await d._file.exists()) {
      try {
        final list = jsonDecode(await d._file.readAsString()) as List;
        d.tasks = list.map((e) => DownloadTask.fromJson(e as Map<String, dynamic>)).toList();
        for (final t in d.tasks) {
          if (t.status == TaskStatus.running) t.status = TaskStatus.paused;
        }
      } catch (_) {
        // Corrupt file: start fresh
      }
    }
    d._events = Engine.events.listen(d._onEvent);
    return d;
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  List<DownloadTask> get active => tasks.where((t) => t.status != TaskStatus.done).toList();
  List<DownloadTask> get finished => tasks.where((t) => t.status == TaskStatus.done).toList();
  int get runningCount => tasks.where((t) => t.status == TaskStatus.running).length;

  DownloadTask? byId(String id) => tasks.where((t) => t.id == id).firstOrNull;

  void _changed({bool save = false}) {
    notifyListeners();
    if (save) {
      _saveTimer?.cancel();
      _saveTimer = Timer(const Duration(milliseconds: 400), () {
        _file.writeAsString(jsonEncode(tasks.map((t) => t.toJson()).toList()));
      });
    }
  }

  void add(DownloadTask task) {
    tasks.insert(0, task);
    _changed(save: true);
    _pump();
  }

  void pause(DownloadTask t) {
    if (!t.isActive) return;
    final wasRunning = t.status == TaskStatus.running;
    t.status = TaskStatus.paused;
    t.speed = 0;
    if (wasRunning) _stop(t);
    _changed(save: true);
    _pump();
  }

  void resume(DownloadTask t) {
    if (t.status != TaskStatus.paused && t.status != TaskStatus.failed) return;
    t.status = TaskStatus.queued;
    t.error = null;
    _changed(save: true);
    _pump();
  }

  Future<void> remove(DownloadTask t, {bool deleteFile = false}) async {
    if (t.status == TaskStatus.running) _stop(t);
    tasks.remove(t);
    _changed(save: true);
    if (deleteFile && t.path != null) {
      await Engine.delete(t.path!);
      _library.refresh();
    }
    _pump();
  }

  void clearFinished() {
    tasks.removeWhere((t) => t.status == TaskStatus.done);
    _changed(save: true);
  }

  void _stop(DownloadTask t) {
    if (t.kind == TaskKind.file) {
      FileDownloader.cancel(t.id);
    } else {
      Engine.cancel(t.id);
    }
  }

  void _pump() {
    var free = _settings.parallel - runningCount;
    // Oldest first
    for (final t in tasks.reversed) {
      if (free <= 0) break;
      if (t.status != TaskStatus.queued) continue;
      free--;
      _start(t);
    }
    _updateNotification(force: true);
  }

  Future<void> _start(DownloadTask t) async {
    t.status = TaskStatus.running;
    t.phase = null;
    _changed(save: true);
    if (t.kind == TaskKind.file) {
      _startFile(t);
    } else {
      try {
        await Engine.download(t.id, t.url, t.args);
      } catch (e) {
        _fail(t, '$e');
      }
    }
  }

  Future<void> _startFile(DownloadTask t) async {
    try {
      final dir = t.private ? _vault.dir : await Library.folderFor(MediaType.file);
      final path = await FileDownloader.start(
        id: t.id,
        url: t.url,
        dir: dir,
        headers: t.headers,
        existingPath: t.path,
        onPath: (p) {
          t.path = p;
          t.title = p.split('/').last;
          _changed(save: true);
        },
        onProgress: (downloaded, total, speed) {
          t.downloaded = downloaded;
          t.total = total;
          t.speed = speed;
          t.eta = total != null && speed > 0 ? ((total - downloaded) / speed).round() : null;
          _changed();
          _updateNotification();
        },
      );
      await _complete(t, path);
    } catch (e) {
      if (isStopped(e)) return; // paused or removed
      _fail(t, e is HttpException ? e.message : '$e');
    }
  }

  void _onEvent(Map<String, dynamic> e) {
    final t = byId(e['id'] as String);
    if (t == null) return;
    switch (e['type']) {
      case 'progress':
        if (t.status != TaskStatus.running) return;
        t.downloaded = (e['downloaded'] as num?)?.toInt() ?? t.downloaded;
        t.total = (e['total'] as num?)?.toInt() ?? t.total;
        t.speed = (e['speed'] as num?)?.toDouble() ?? 0;
        t.eta = (e['eta'] as num?)?.toInt();
        t.phase = null;
        _changed();
        _updateNotification();
      case 'phase':
        t.phase = e['phase'] as String?;
        t.speed = 0;
        _changed();
      case 'done':
        _complete(t, e['path'] as String?);
      case 'error':
        _fail(t, e['message'] as String? ?? '');
      case 'canceled':
        // Pause or remove already updated the task
        break;
    }
  }

  Future<void> _complete(DownloadTask t, String? path) async {
    t.status = TaskStatus.done;
    t.path = path ?? t.path;
    t.speed = 0;
    t.phase = null;
    if (t.path != null) {
      final f = File(t.path!);
      if (await f.exists()) t.total = t.downloaded = await f.length();
      if (t.private) {
        await _vault.adopt(t.path!, title: t.title, thumbnail: t.thumbnail);
      }
    }
    _changed(save: true);
    Engine.notifyDone(t.private ? 'Downly 🔒' : t.title, t.private ? '' : '✓');
    onFinished?.call(t);
    _library.refresh();
    _pump();
  }

  void _fail(DownloadTask t, String message) {
    t.status = TaskStatus.failed;
    t.error = message;
    t.speed = 0;
    _changed(save: true);
    _pump();
  }

  /// Ongoing notification with the overall progress (throttled)
  void _updateNotification({bool force = false}) {
    final running = tasks.where((t) => t.status == TaskStatus.running).toList();
    if (running.isEmpty) {
      Engine.serviceStop();
      return;
    }
    final now = DateTime.now();
    if (!force && now.difference(_lastNotification) < const Duration(seconds: 1)) return;
    _lastNotification = now;
    final first = running.first;
    final total = running.fold<int>(0, (a, t) => a + (t.total ?? 0));
    final done = running.fold<int>(0, (a, t) => a + t.downloaded);
    final speed = running.fold<double>(0, (a, t) => a + t.speed);
    final title = running.length == 1 ? (first.private ? 'Downly 🔒' : first.title) : 'Downly · ${running.length}';
    final text = [
      if (total > 0) '${(done * 100 / total).round()}%',
      if (speed > 0) '${formatBytes(speed)}/s',
    ].join(' · ');
    Engine.service(title, text, total > 0 ? (done * 100 ~/ total) : -1);
  }
}
