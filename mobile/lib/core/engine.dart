import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// Talks to yt-dlp on the Android side (EngineBridge.kt).
class Engine {
  static const _channel = MethodChannel('downly/engine');
  static const _app = MethodChannel('downly/app');
  static final Stream<Map<String, dynamic>> events = const EventChannel('downly/events')
      .receiveBroadcastStream()
      .map((e) => Map<String, dynamic>.from(e as Map))
      .asBroadcastStream();

  static Future<String?>? _ready;

  /// Unpacks Python/yt-dlp on first launch (a few seconds), instant afterwards
  static Future<String?> init() => _ready ??= _channel.invokeMethod<String>('init').then((v) => v?.replaceFirst('yt-dlp ', ''));

  static Future<({String status, String? version})> update() async {
    final r = Map<String, dynamic>.from(await _channel.invokeMethod('update'));
    (await SharedPreferences.getInstance()).setInt('engineUpdatedAt', DateTime.now().millisecondsSinceEpoch);
    return (status: r['status'] as String, version: (r['version'] as String?)?.replaceFirst('yt-dlp ', ''));
  }

  static Future<bool>? _updating;

  /// Updates yt-dlp now (one update at a time); false when offline
  static Future<bool> refresh() => _updating ??= () async {
        try {
          await init();
          await update();
          return true;
        } catch (_) {
          return false;
        } finally {
          _updating = null;
        }
      }();

  /// The yt-dlp inside the APK is months old by the time people install it, and YouTube changes
  /// often: update on first launch, then every two days
  static Future<void> autoUpdate() async {
    final last = (await SharedPreferences.getInstance()).getInt('engineUpdatedAt') ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - last < const Duration(days: 2).inMilliseconds) return;
    await refresh();
  }

  static Future<MediaInfo> info(String url, {String? cookies}) async {
    await init();
    final out = await _channel.invokeMethod<String>('info', {
      'url': url,
      'args': [
        '--dump-single-json',
        '--flat-playlist',
        '--no-playlist',
        '--no-warnings',
        if (cookies != null) ...['--cookies', cookies],
      ],
    });
    return MediaInfo.fromJson(jsonDecode(out!) as Map<String, dynamic>, url);
  }

  static Future<void> download(String id, String url, List<String> args) async {
    await init();
    await _channel.invokeMethod('download', {'id': id, 'url': url, 'args': args});
  }

  static Future<void> cancel(String id) => _channel.invokeMethod('cancel', {'id': id});

  static Future<String> publicDir() async => (await _channel.invokeMethod<String>('publicDir'))!;

  static Future<int> freeSpace() async => (await _channel.invokeMethod<int>('freeSpace')) ?? 0;

  static Future<void> scan(String path) => _channel.invokeMethod('scan', {'path': path});

  static Future<void> move(String from, String to) => _channel.invokeMethod('move', {'from': from, 'to': to});

  static Future<void> delete(String path) => _channel.invokeMethod('delete', {'path': path});

  static Future<void> service(String title, String text, int progress) =>
      _channel.invokeMethod('service', {'title': title, 'text': text, 'progress': progress});

  static Future<void> serviceStop() => _channel.invokeMethod('serviceStop');

  static Future<void> notifyDone(String title, String text) =>
      _channel.invokeMethod('notifyDone', {'title': title, 'text': text});

  // ---- app channel
  static Future<String?> initialShare() => _app.invokeMethod<String>('initialShare');

  static void onShared(void Function(String text) handler) {
    _app.setMethodCallHandler((call) async {
      if (call.method == 'shared') handler(call.arguments as String);
    });
  }

  static Future<void> secure(bool on) => _app.invokeMethod('secure', {'on': on});

  static Future<int?> clipStamp() => _app.invokeMethod<int>('clipStamp');

  static Future<bool> pip() async => (await _app.invokeMethod<bool>('pip')) ?? false;
}
