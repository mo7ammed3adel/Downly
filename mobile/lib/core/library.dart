import 'dart:io';

import 'package:flutter/foundation.dart';

import 'engine.dart';

enum MediaType { video, audio, file }

const _videoExt = {'mp4', 'mkv', 'webm', 'mov', 'avi', '3gp', 'm4v', 'flv', 'ts'};
const _audioExt = {'mp3', 'm4a', 'aac', 'opus', 'ogg', 'flac', 'wav', 'wma'};

MediaType mediaTypeOf(String path) {
  final ext = path.split('.').last.toLowerCase();
  if (_videoExt.contains(ext)) return MediaType.video;
  if (_audioExt.contains(ext)) return MediaType.audio;
  return MediaType.file;
}

class LibraryItem {
  LibraryItem(this.file, this.size, this.modified);

  final File file;
  final int size;
  final DateTime modified;

  String get path => file.path;
  String get name => path.split('/').last;
  String get title => name.contains('.') ? name.substring(0, name.lastIndexOf('.')) : name;
  MediaType get type => mediaTypeOf(path);
}

/// Everything saved in Download/Downly, newest first.
class Library extends ChangeNotifier {
  List<LibraryItem> items = [];
  bool loading = false;

  static String? _root;

  static Future<String> root() async => _root ??= await Engine.publicDir();

  static Future<String> folderFor(MediaType type) async {
    final dir = '${await root()}/${switch (type) {
      MediaType.video => 'Videos',
      MediaType.audio => 'Music',
      MediaType.file => 'Files',
    }}';
    await Directory(dir).create(recursive: true);
    return dir;
  }

  List<LibraryItem> of(MediaType type) => items.where((i) => i.type == type).toList();

  Future<void> refresh() async {
    loading = true;
    notifyListeners();
    final found = <LibraryItem>[];
    try {
      final dir = Directory(await root());
      if (await dir.exists()) {
        await for (final e in dir.list(recursive: true, followLinks: false)) {
          if (e is! File) continue;
          final name = e.path.split('/').last;
          // Unfinished downloads and yt-dlp leftovers
          if (name.startsWith('.') || RegExp(r'\.(part\d*|ytdl|temp|tmp)$|\.f\d+\.\w+$').hasMatch(name)) continue;
          final stat = await e.stat();
          found.add(LibraryItem(e, stat.size, stat.modified));
        }
      }
    } catch (_) {
      // No storage access yet
    }
    found.sort((a, b) => b.modified.compareTo(a.modified));
    items = found;
    loading = false;
    notifyListeners();
  }
}
