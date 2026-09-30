import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import 'engine.dart';
import 'library.dart';

class StatusItem {
  StatusItem({required this.path, required this.name, required this.video, required this.modified, this.thumb});

  /// Copy in the app cache (the originals disappear after 24 hours)
  final String path;
  final String name;
  final bool video;
  final DateTime modified;
  final String? thumb;

  factory StatusItem.fromMap(Map<dynamic, dynamic> m) => StatusItem(
        path: m['path'] as String,
        name: m['name'] as String,
        video: m['video'] as bool,
        modified: DateTime.fromMillisecondsSinceEpoch((m['modified'] as num).toInt()),
        thumb: m['thumb'] as String?,
      );
}

/// WhatsApp / WhatsApp Business statuses the user has viewed (StatusBridge.kt).
class Statuses extends ChangeNotifier {
  static const _channel = MethodChannel('downly/status');

  /// 'whatsapp' or 'business'
  String app = 'whatsapp';
  bool? hasAccess;
  bool loading = false;
  String? error;
  List<StatusItem> items = [];
  final saved = <String>{};

  List<StatusItem> get images => items.where((i) => !i.video).toList();
  List<StatusItem> get videos => items.where((i) => i.video).toList();

  static Future<String> folder() async {
    final dir = '${await Library.root()}/Statuses';
    await Directory(dir).create(recursive: true);
    return dir;
  }

  Future<void> switchApp(String value) async {
    app = value;
    items = [];
    await refresh();
  }

  Future<void> refresh() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      // Android 10 and older read the folder directly
      await Permission.storage.request();
      hasAccess = await _channel.invokeMethod<bool>('hasAccess', {'app': app});
      if (hasAccess == true) {
        final list = await _channel.invokeMethod<List>('list', {'app': app}) ?? [];
        items = list.map((m) => StatusItem.fromMap(m as Map)).toList();
      }
      final dir = await folder();
      saved
        ..clear()
        ..addAll(items.where((i) => File('$dir/${i.name}').existsSync()).map((i) => i.name));
    } on PlatformException catch (e) {
      error = e.message;
    }
    loading = false;
    notifyListeners();
  }

  /// Opens the system folder picker on the .Statuses folder; true when granted
  Future<bool> requestAccess() async {
    try {
      final ok = await _channel.invokeMethod<bool>('requestAccess', {'app': app}) ?? false;
      if (ok) await refresh();
      return ok;
    } on PlatformException catch (e) {
      error = e.code == 'wrongFolder' ? 'wrongFolder' : e.message;
      notifyListeners();
      return false;
    }
  }

  Future<void> save(StatusItem item) async {
    final target = '${await folder()}/${item.name}';
    await File(item.path).copy(target);
    await Engine.scan(target);
    saved.add(item.name);
    notifyListeners();
  }
}
