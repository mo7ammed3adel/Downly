import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'file_downloader.dart';

const _releasesApi = 'https://api.github.com/repos/mo7ammed3adel/downly-releases/releases?per_page=20';
const _app = MethodChannel('downly/app');

class AppUpdate {
  AppUpdate({required this.version, required this.notes, required this.url, this.size});

  final String version;
  final String notes;
  final String url;
  final int? size;
}

/// New app versions are published as `android-vX.Y.Z` releases on GitHub.
class Updater {
  static String? current;

  static Future<String> currentVersion() async {
    final info = Map<String, dynamic>.from(await _app.invokeMethod('appInfo'));
    return current = info['version'] as String;
  }

  /// A newer release for this phone's CPU, or null. [force] skips the twice-a-day limit.
  static Future<AppUpdate?> check({bool force = false}) async {
    final prefs = await SharedPreferences.getInstance();
    final last = DateTime.fromMillisecondsSinceEpoch(prefs.getInt('updateCheckedAt') ?? 0);
    if (!force && DateTime.now().difference(last) < const Duration(hours: 12)) return null;

    final info = Map<String, dynamic>.from(await _app.invokeMethod('appInfo'));
    current = info['version'] as String;
    final abi = info['abi'] as String? ?? 'arm64-v8a';

    final client = HttpClient();
    try {
      final request = await client.getUrl(Uri.parse(_releasesApi));
      request.headers.set('Accept', 'application/vnd.github+json');
      final response = await request.close();
      if (response.statusCode != 200) return null;
      final releases = jsonDecode(await response.transform(utf8.decoder).join()) as List;
      await prefs.setInt('updateCheckedAt', DateTime.now().millisecondsSinceEpoch);

      final release = releases.cast<Map<String, dynamic>>().firstWhere(
            (r) => r['draft'] != true && r['prerelease'] != true && (r['tag_name'] as String).startsWith('android-v'),
            orElse: () => {},
          );
      if (release.isEmpty) return null;
      final version = (release['tag_name'] as String).replaceFirst('android-v', '');
      if (!isNewer(version, current!)) return null;
      if (!force && prefs.getString('updateSkipped') == version) return null;

      final wanted = abi.startsWith('armeabi') ? 'Downly-android-arm32.apk' : 'Downly-android-arm64.apk';
      final asset = (release['assets'] as List).cast<Map<String, dynamic>>().firstWhere((a) => a['name'] == wanted, orElse: () => {});
      if (asset.isEmpty) return null;
      return AppUpdate(
        version: version,
        notes: (release['body'] as String? ?? '').trim(),
        url: asset['browser_download_url'] as String,
        size: (asset['size'] as num?)?.toInt(),
      );
    } catch (_) {
      return null; // offline or rate-limited: try again next time
    } finally {
      client.close();
    }
  }

  /// "Later" on a version stops asking about it (a newer one asks again)
  static Future<void> skip(String version) async => (await SharedPreferences.getInstance()).setString('updateSkipped', version);

  static bool isNewer(String a, String b) {
    List<int> parts(String v) => v.split('.').map((p) => int.tryParse(p.replaceAll(RegExp(r'\D'), '')) ?? 0).toList();
    final x = parts(a), y = parts(b);
    for (var i = 0; i < 3; i++) {
      final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
      if (d != 0) return d > 0;
    }
    return false;
  }

  /// Downloads the APK into the cache (the installer reads it from there)
  static Future<String> download(AppUpdate update, void Function(double progress) onProgress) async {
    final dir = '${(await getTemporaryDirectory()).path}/updates';
    final old = Directory(dir);
    if (await old.exists()) await old.delete(recursive: true);
    return FileDownloader.start(
      id: 'app-update',
      url: update.url,
      dir: dir,
      headers: const {},
      onProgress: (done, total, _) => onProgress(total != null && total > 0 ? done / total : 0),
    );
  }

  /// false when Android first needs "Allow from this source" (its settings screen was opened)
  static Future<bool> install(String path) async => (await _app.invokeMethod<bool>('installApk', {'path': path})) ?? false;
}
