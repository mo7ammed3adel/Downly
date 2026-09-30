import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/models.dart';
import '../core/music.dart';
import 'theme.dart';

// ---------------------------------------------------------------- music tab

class MusicTab extends StatefulWidget {
  const MusicTab({super.key});

  @override
  State<MusicTab> createState() => _MusicTabState();
}

class _MusicTabState extends State<MusicTab> {
  String query = '';
  bool onlyDownly = false;

  @override
  Widget build(BuildContext context) {
    final library = context.watch<MusicLibrary>();
    final theme = Theme.of(context);
    final q = query.toLowerCase();
    final songs = library.songs
        .where((s) => !onlyDownly || s.fromDownly)
        .where((s) => q.isEmpty || s.title.toLowerCase().contains(q) || (s.artist?.toLowerCase().contains(q) ?? false))
        .toList();

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: library.refresh,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
                child: Text(context.tr('songs'), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  onChanged: (v) => setState(() => query = v),
                  decoration: InputDecoration(hintText: context.tr('searchSongs'), prefixIcon: const Icon(Icons.search_rounded)),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(
                  children: [
                    ChoiceChip(label: Text(context.tr('allSongs')), selected: !onlyDownly, onSelected: (_) => setState(() => onlyDownly = false)),
                    const SizedBox(width: 8),
                    ChoiceChip(label: Text(context.tr('fromDownly')), selected: onlyDownly, onSelected: (_) => setState(() => onlyDownly = true)),
                    const Spacer(),
                    IconButton.filledTonal(
                      tooltip: context.tr('shuffleAll'),
                      onPressed: songs.isEmpty ? null : () => music.playSongs(songs, 0, shuffle: true),
                      icon: const Icon(Icons.shuffle_rounded),
                    ),
                    const SizedBox(width: 6),
                    IconButton.filled(
                      tooltip: context.tr('playAll'),
                      onPressed: songs.isEmpty ? null : () => music.playSongs(songs, 0),
                      icon: const Icon(Icons.play_arrow_rounded),
                    ),
                  ],
                ),
              ),
            ),
            if (library.denied)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  child: Card(
                    child: ListTile(
                      leading: const Icon(Icons.library_music_outlined, color: Brand.violet),
                      title: Text(context.tr('allowMusic')),
                      trailing: TextButton(
                        onPressed: () async {
                          await openAppSettings();
                          if (context.mounted) context.read<MusicLibrary>().refresh();
                        },
                        child: Text(context.tr('allow')),
                      ),
                    ),
                  ),
                ),
              ),
            if (library.loading && library.songs.isEmpty)
              const SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
            else if (songs.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: _empty(context))
            else
              StreamBuilder<MediaItem?>(
                stream: music.mediaItem,
                initialData: music.mediaItem.value,
                builder: (context, snap) {
                  final playing = snap.data?.id;
                  return SliverList.builder(
                    itemCount: songs.length,
                    itemBuilder: (_, i) =>
                        SongTile(song: songs[i], current: playing == Uri.file(songs[i].path).toString(), onTap: () => music.playSongs(songs, i)),
                  );
                },
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 90)),
          ],
        ),
      ),
    );
  }

  Widget _empty(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(shape: BoxShape.circle, color: Brand.violet.withValues(alpha: 0.14)),
            child: const Icon(Icons.music_note_rounded, size: 40, color: Brand.violet),
          ),
          const SizedBox(height: 16),
          Text(context.tr('noSongs'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            context.tr('noSongsHint'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class SongTile extends StatelessWidget {
  const SongTile({super.key, required this.song, required this.onTap, this.current = false});

  final Song song;
  final VoidCallback onTap;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      onTap: onTap,
      leading: SongArt(path: song.path, size: 48, radius: 10),
      title: Text(
        song.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontWeight: FontWeight.w600, color: current ? Brand.blue : null),
      ),
      subtitle: Text(
        [song.artist ?? context.tr('unknownArtist'), if (song.duration != null) formatDuration(song.duration)].join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
      ),
      trailing: current ? const Icon(Icons.graphic_eq_rounded, color: Brand.blue) : null,
    );
  }
}

/// The song's embedded cover, or a gradient with a note
class SongArt extends StatelessWidget {
  const SongArt({super.key, required this.path, required this.size, this.radius = 12});

  final String path;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(colors: [Brand.violet.withValues(alpha: 0.7), Brand.blue.withValues(alpha: 0.7)]),
      ),
      child: Icon(Icons.music_note_rounded, color: Colors.white, size: size * 0.45),
    );
    return FutureBuilder<String?>(
      future: Artwork.of(path),
      builder: (_, snap) => snap.data == null
          ? fallback
          : ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: Image.file(File(snap.data!), width: size, height: size, fit: BoxFit.cover, cacheWidth: (size * 3).round()),
            ),
    );
  }
}

String _artPath(MediaItem item) => item.artUri?.toFilePath() ?? Uri.parse(item.id).toFilePath();

// ---------------------------------------------------------------- mini player

class MiniPlayer extends StatelessWidget {
  const MiniPlayer({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return StreamBuilder<MediaItem?>(
      stream: music.mediaItem,
      initialData: music.mediaItem.value,
      builder: (context, snap) {
        final item = snap.data;
        if (item == null) return const SizedBox.shrink();
        return Material(
          color: theme.colorScheme.surfaceContainerHigh,
          child: InkWell(
            onTap: () => NowPlayingPage.open(context),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Progress(height: 2),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
                  child: Row(
                    children: [
                      SongArt(key: ValueKey(item.id), path: Uri.parse(item.id).toFilePath(), size: 42, radius: 8),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              item.artist ?? context.tr('unknownArtist'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                      const _PlayPause(size: 30),
                      IconButton(icon: const Icon(Icons.skip_next_rounded), onPressed: music.skipToNext),
                      IconButton(icon: const Icon(Icons.close_rounded, size: 20), onPressed: music.stop),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _PlayPause extends StatelessWidget {
  const _PlayPause({required this.size, this.big = false});

  final double size;
  final bool big;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<PlaybackState>(
      stream: music.playbackState,
      initialData: music.playbackState.value,
      builder: (_, snap) {
        final playing = snap.data?.playing ?? false;
        final icon = Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: size, color: big ? Colors.white : null);
        final onTap = playing ? music.pause : music.play;
        if (!big) return IconButton(icon: icon, onPressed: onTap);
        // The glow sits outside the button's own Material, which would clip it to a square
        return DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: Brand.blue.withValues(alpha: 0.4), blurRadius: 24)],
          ),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap,
              child: Ink(
                width: 76,
                height: 76,
                decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Brand.gradient),
                child: Center(child: icon),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Duration>(
      stream: music.player.stream.position,
      builder: (_, snap) {
        final total = music.player.state.duration.inMilliseconds;
        final value = total > 0 ? (snap.data ?? Duration.zero).inMilliseconds / total : 0.0;
        return LinearProgressIndicator(value: value.clamp(0, 1), minHeight: height, color: Brand.blue, backgroundColor: Colors.transparent);
      },
    );
  }
}

// ---------------------------------------------------------------- now playing

class NowPlayingPage extends StatefulWidget {
  const NowPlayingPage({super.key});

  static void open(BuildContext context) => Navigator.of(context).push(
    PageRouteBuilder(
      pageBuilder: (_, _, _) => const NowPlayingPage(),
      transitionsBuilder: (_, anim, _, child) => SlideTransition(
        position: Tween(begin: const Offset(0, 1), end: Offset.zero).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)),
        child: child,
      ),
    ),
  );

  @override
  State<NowPlayingPage> createState() => _NowPlayingPageState();
}

class _NowPlayingPageState extends State<NowPlayingPage> {
  double? dragging;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Refreshes the sleep timer countdown
    _tick = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted && music.sleepAt.value != null) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<MediaItem?>(
      stream: music.mediaItem,
      initialData: music.mediaItem.value,
      builder: (context, snap) {
        final item = snap.data;
        if (item == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (context.mounted) Navigator.maybePop(context);
          });
          return const Scaffold(backgroundColor: Colors.black);
        }
        final art = item.artUri != null ? File(_artPath(item)) : null;
        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              if (art != null)
                ImageFiltered(
                  imageFilter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
                  child: Image.file(art, fit: BoxFit.cover, color: Colors.black54, colorBlendMode: BlendMode.darken),
                )
              else
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Brand.violet.withValues(alpha: 0.55), Colors.black],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              SafeArea(
                child: DefaultTextStyle(
                  style: const TextStyle(color: Colors.white),
                  child: IconTheme(
                    data: const IconThemeData(color: Colors.white),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              IconButton(icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 32), onPressed: () => Navigator.pop(context)),
                              Expanded(
                                child: Text(
                                  context.tr('nowPlaying'),
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                              ),
                              IconButton(icon: const Icon(Icons.queue_music_rounded), onPressed: () => _queue(context)),
                            ],
                          ),
                          const Spacer(),
                          AspectRatio(
                            aspectRatio: 1,
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(28),
                                boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 40, offset: Offset(0, 16))],
                              ),
                              child: LayoutBuilder(
                                builder: (_, c) => SongArt(key: ValueKey(item.id), path: Uri.parse(item.id).toFilePath(), size: c.maxWidth, radius: 28),
                              ),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            item.title,
                            maxLines: 2,
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 6),
                          Text(item.artist ?? context.tr('unknownArtist'), maxLines: 1, style: const TextStyle(color: Colors.white70)),
                          const SizedBox(height: 18),
                          _seekBar(),
                          const SizedBox(height: 8),
                          _controls(),
                          const SizedBox(height: 18),
                          _extras(context),
                          const SizedBox(height: 12),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _seekBar() => StreamBuilder<Duration>(
    stream: music.player.stream.position,
    builder: (_, snap) {
      final total = music.player.state.duration;
      final pos = snap.data ?? Duration.zero;
      final max = total.inMilliseconds.toDouble().clamp(1, double.infinity).toDouble();
      final value = dragging ?? pos.inMilliseconds.toDouble().clamp(0, max).toDouble();
      return Column(
        children: [
          SliderTheme(
            data: SliderThemeData(
              trackHeight: 4,
              activeTrackColor: Colors.white,
              inactiveTrackColor: Colors.white24,
              thumbColor: Colors.white,
              overlayShape: SliderComponentShape.noOverlay,
            ),
            child: Slider(
              value: value,
              max: max,
              onChanged: (v) => setState(() => dragging = v),
              onChangeEnd: (v) {
                music.seek(Duration(milliseconds: v.round()));
                setState(() => dragging = null);
              },
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                formatDuration(Duration(milliseconds: value.round())),
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
              const Spacer(),
              Text(formatDuration(total), style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
        ],
      );
    },
  );

  Widget _controls() => StreamBuilder<PlaybackState>(
    stream: music.playbackState,
    initialData: music.playbackState.value,
    builder: (_, snap) {
      final s = snap.data;
      final shuffle = s?.shuffleMode == AudioServiceShuffleMode.all;
      final repeat = s?.repeatMode ?? AudioServiceRepeatMode.none;
      return Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              icon: Icon(Icons.shuffle_rounded, color: shuffle ? Brand.cyan : Colors.white70),
              onPressed: () => music.setShuffleMode(shuffle ? AudioServiceShuffleMode.none : AudioServiceShuffleMode.all),
            ),
            IconButton(iconSize: 40, icon: const Icon(Icons.skip_previous_rounded), onPressed: music.skipToPrevious),
            const _PlayPause(size: 42, big: true),
            IconButton(iconSize: 40, icon: const Icon(Icons.skip_next_rounded), onPressed: music.skipToNext),
            IconButton(
              icon: Icon(
                repeat == AudioServiceRepeatMode.one ? Icons.repeat_one_rounded : Icons.repeat_rounded,
                color: repeat == AudioServiceRepeatMode.none ? Colors.white70 : Brand.cyan,
              ),
              onPressed: () => music.setRepeatMode(switch (repeat) {
                AudioServiceRepeatMode.none => AudioServiceRepeatMode.all,
                AudioServiceRepeatMode.all || AudioServiceRepeatMode.group => AudioServiceRepeatMode.one,
                AudioServiceRepeatMode.one => AudioServiceRepeatMode.none,
              }),
            ),
          ],
        ),
      );
    },
  );

  Widget _extras(BuildContext context) => ValueListenableBuilder<DateTime?>(
    valueListenable: music.sleepAt,
    builder: (_, sleepAt, _) {
      final minutes = sleepAt == null ? null : (sleepAt.difference(DateTime.now()).inSeconds / 60).ceil();
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: sleepAt != null ? Brand.cyan : Colors.white70),
            onPressed: () => _sleepMenu(context),
            icon: const Icon(Icons.bedtime_outlined),
            label: Text(minutes != null ? context.tr('sleepIn', args: {'m': minutes}) : context.tr('sleepTimer')),
          ),
          StreamBuilder<double>(
            stream: music.player.stream.rate,
            builder: (_, snap) => TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Colors.white70),
              onPressed: () => _speedMenu(context, snap.data ?? 1),
              icon: const Icon(Icons.speed_rounded),
              label: Text('${snap.data ?? 1}x'),
            ),
          ),
        ],
      );
    },
  );

  void _sleepMenu(BuildContext context) {
    final options = <Duration?, String>{
      null: context.tr('sleepOff'),
      const Duration(minutes: 15): context.tr('minutes', args: {'m': 15}),
      const Duration(minutes: 30): context.tr('minutes', args: {'m': 30}),
      const Duration(minutes: 45): context.tr('minutes', args: {'m': 45}),
      const Duration(hours: 1): context.tr('hour'),
    };
    showModalBottomSheet(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.bedtime_outlined),
              title: Text(context.tr('sleepTimer'), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            for (final e in options.entries)
              ListTile(
                title: Text(e.value),
                onTap: () {
                  music.setSleepTimer(e.key);
                  Navigator.pop(sheet);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _speedMenu(BuildContext context, double current) {
    showModalBottomSheet(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final r in [0.75, 1.0, 1.25, 1.5, 2.0])
              ListTile(
                title: Text('${r}x'),
                trailing: r == current ? const Icon(Icons.check_rounded, color: Brand.blue) : null,
                onTap: () {
                  music.setSpeed(r);
                  Navigator.pop(sheet);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _queue(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheet) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (_, scroll) => StreamBuilder<List<MediaItem>>(
          stream: music.queue,
          initialData: music.queue.value,
          builder: (_, q) => StreamBuilder<PlaybackState>(
            stream: music.playbackState,
            initialData: music.playbackState.value,
            builder: (_, s) {
              final items = q.data ?? [];
              final index = s.data?.queueIndex ?? 0;
              return ListView.builder(
                controller: scroll,
                itemCount: items.length + 1,
                itemBuilder: (_, i) {
                  if (i == 0) {
                    return ListTile(
                      title: Text(context.tr('queue'), style: const TextStyle(fontWeight: FontWeight.w800)),
                    );
                  }
                  final item = items[i - 1];
                  final current = i - 1 == index;
                  return ListTile(
                    leading: SongArt(path: Uri.parse(item.id).toFilePath(), size: 40, radius: 8),
                    title: Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: current ? Brand.blue : null, fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(item.artist ?? '', maxLines: 1),
                    trailing: current ? const Icon(Icons.graphic_eq_rounded, color: Brand.blue) : null,
                    onTap: () => music.skipToQueueItem(i - 1),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}
