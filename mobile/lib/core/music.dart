import 'dart:async';
import 'dart:io';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:permission_handler/permission_handler.dart';

import 'library.dart';

const _engine = MethodChannel('downly/engine');

class Song {
  Song({required this.path, required this.title, this.artist, this.album, this.duration, this.added});

  final String path;
  final String title;
  final String? artist;
  final String? album;
  final Duration? duration;
  final DateTime? added;

  bool get fromDownly => path.contains('/Download/Downly/');

  factory Song.fromMap(Map<dynamic, dynamic> m) => Song(
        path: m['path'] as String,
        title: (m['title'] as String?) ?? (m['path'] as String).split('/').last,
        artist: m['artist'] as String?,
        album: m['album'] as String?,
        duration: m['duration'] != null ? Duration(milliseconds: (m['duration'] as num).toInt()) : null,
        added: m['added'] != null ? DateTime.fromMillisecondsSinceEpoch((m['added'] as num).toInt() * 1000) : null,
      );

  factory Song.fromFile(String path) {
    final name = path.split('/').last;
    return Song(path: path, title: name.contains('.') ? name.substring(0, name.lastIndexOf('.')) : name);
  }
}

/// Embedded covers, looked up once per song
class Artwork {
  static final _cache = <String, Future<String?>>{};

  static Future<String?> of(String path) =>
      _cache[path] ??= _engine.invokeMethod<String>('artwork', {'path': path}).catchError((_) => null);
}

/// All songs on the phone, newest first (Downly's downloads included).
class MusicLibrary extends ChangeNotifier {
  List<Song> songs = [];
  bool loading = false;
  bool denied = false;
  bool _loaded = false;

  bool get loaded => _loaded;

  Future<void> ensureLoaded() async {
    if (_loaded) return;
    _loaded = true;
    await refresh();
  }

  Future<void> refresh() async {
    loading = true;
    notifyListeners();
    // Android 13+ asks for "Music and audio"; older versions for storage
    final status = await (Platform.isAndroid ? [Permission.audio, Permission.storage].request() : Future.value(<Permission, PermissionStatus>{}));
    denied = status.values.isNotEmpty && status.values.every((s) => !s.isGranted);
    try {
      final list = await _engine.invokeMethod<List>('songs') ?? [];
      songs = list.map((m) => Song.fromMap(m as Map)).toList();
    } catch (_) {
      songs = [];
    }
    // Downly's own songs always show (even short ones, or without the permission)
    final known = songs.map((s) => s.path).toSet();
    final dir = Directory(await Library.folderFor(MediaType.audio));
    if (await dir.exists()) {
      final own = await dir
          .list()
          .where((e) => e is File && mediaTypeOf(e.path) == MediaType.audio && !known.contains(e.path))
          .map((e) => Song.fromFile(e.path))
          .toList();
      songs = [...own, ...songs];
    }
    loading = false;
    notifyListeners();
  }
}

/// Plays music with media_kit and publishes it to Android's media session, so it keeps going in
/// the background with controls in the notification, on the lock screen and on headsets.
class MusicHandler extends BaseAudioHandler with SeekHandler {
  MusicHandler() {
    player.stream.playing.listen((_) => _broadcast());
    player.stream.buffering.listen((_) => _broadcast());
    player.stream.completed.listen((_) => _broadcast());
    player.stream.rate.listen((_) => _broadcast());
    player.stream.playlist.listen(_onPlaylist);
    player.stream.duration.listen((d) {
      final item = mediaItem.value;
      if (item != null && d > Duration.zero && item.duration != d) mediaItem.add(item.copyWith(duration: d));
    });
  }

  final player = Player();
  final _songs = <String, Song>{};
  AudioServiceRepeatMode _repeat = AudioServiceRepeatMode.none;
  bool _shuffle = false;

  /// When the sleep timer stops the music (null = off)
  final sleepAt = ValueNotifier<DateTime?>(null);
  Timer? _sleep;

  Song? get current {
    final pl = player.state.playlist;
    if (pl.medias.isEmpty || pl.index < 0 || pl.index >= pl.medias.length) return null;
    return _songs[pl.medias[pl.index].uri];
  }

  static String _uri(Song s) => Uri.file(s.path).toString();

  Future<void> playSongs(List<Song> songs, int index, {bool shuffle = false}) async {
    if (songs.isEmpty) return;
    // media_kit normalizes the URI it's given, so songs are looked up by Media.uri
    final medias = songs.map((s) => Media(_uri(s))).toList();
    _songs
      ..clear()
      ..addEntries([for (var i = 0; i < songs.length; i++) MapEntry(medias[i].uri, songs[i])]);
    queue.add(songs.map(_item).toList());
    await player.open(Playlist(medias, index: index));
    await setShuffleMode(shuffle ? AudioServiceShuffleMode.all : AudioServiceShuffleMode.none);
    await player.setPlaylistMode(_mode(_repeat));
  }

  MediaItem _item(Song s, {String? art}) => MediaItem(
        id: _uri(s),
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        artUri: art != null ? Uri.file(art) : null,
      );

  Future<void> _onPlaylist(Playlist pl) async {
    // Shuffling reorders the playlist, so the queue follows it
    queue.add([for (final m in pl.medias) if (_songs[m.uri] != null) _item(_songs[m.uri]!)]);
    final song = current;
    if (song == null) return;
    mediaItem.add(_item(song));
    _broadcast();
    final art = await Artwork.of(song.path);
    if (art != null && current == song) mediaItem.add(_item(song, art: art).copyWith(duration: mediaItem.value?.duration));
  }

  void _broadcast() {
    final s = player.state;
    playbackState.add(playbackState.value.copyWith(
      controls: [MediaControl.skipToPrevious, s.playing ? MediaControl.pause : MediaControl.play, MediaControl.skipToNext],
      systemActions: const {MediaAction.seek, MediaAction.seekForward, MediaAction.seekBackward},
      androidCompactActionIndices: const [0, 1, 2],
      processingState: s.playlist.medias.isEmpty
          ? AudioProcessingState.idle
          : s.buffering
              ? AudioProcessingState.buffering
              : s.completed
                  ? AudioProcessingState.completed
                  : AudioProcessingState.ready,
      playing: s.playing,
      updatePosition: s.position,
      bufferedPosition: s.buffer,
      speed: s.rate,
      queueIndex: s.playlist.index,
      repeatMode: _repeat,
      shuffleMode: _shuffle ? AudioServiceShuffleMode.all : AudioServiceShuffleMode.none,
    ));
  }

  PlaylistMode _mode(AudioServiceRepeatMode r) => switch (r) {
        AudioServiceRepeatMode.one => PlaylistMode.single,
        AudioServiceRepeatMode.all || AudioServiceRepeatMode.group => PlaylistMode.loop,
        AudioServiceRepeatMode.none => PlaylistMode.none,
      };

  @override
  Future<void> play() => player.play();

  @override
  Future<void> pause() => player.pause();

  @override
  Future<void> seek(Duration position) async {
    await player.seek(position);
    _broadcast();
  }

  @override
  Future<void> skipToNext() => player.next();

  @override
  Future<void> skipToPrevious() async {
    // Like every music app: back to the start first, the previous song on a second press
    if (player.state.position > const Duration(seconds: 3)) return seek(Duration.zero);
    await player.previous();
  }

  @override
  Future<void> skipToQueueItem(int index) => player.jump(index);

  @override
  Future<void> setRepeatMode(AudioServiceRepeatMode repeatMode) async {
    _repeat = repeatMode;
    await player.setPlaylistMode(_mode(repeatMode));
    _broadcast();
  }

  @override
  Future<void> setShuffleMode(AudioServiceShuffleMode shuffleMode) async {
    _shuffle = shuffleMode != AudioServiceShuffleMode.none;
    await player.setShuffle(_shuffle);
    _broadcast();
  }

  @override
  Future<void> setSpeed(double speed) => player.setRate(speed);

  @override
  Future<void> stop() async {
    await player.stop();
    mediaItem.add(null);
    _broadcast();
    await super.stop();
  }

  @override
  Future<void> onTaskRemoved() async {
    // Swiping the app away keeps the music only while it plays
    if (!player.state.playing) await stop();
  }

  void setSleepTimer(Duration? after) {
    _sleep?.cancel();
    if (after == null) {
      sleepAt.value = null;
      return;
    }
    sleepAt.value = DateTime.now().add(after);
    _sleep = Timer(after, () {
      pause();
      sleepAt.value = null;
    });
  }
}

/// Set in main() by AudioService.init
late final MusicHandler music;
