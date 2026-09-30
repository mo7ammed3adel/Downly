import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:share_plus/share_plus.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/library.dart';
import 'theme.dart';

/// Video and music player for downloaded files: swipe for volume/brightness, double-tap to seek,
/// hold for 2× speed, a playlist of the surrounding files, speed menu and picture-in-picture.
class PlayerPage extends StatefulWidget {
  const PlayerPage({super.key, required this.paths, required this.index, this.secure = false});

  final List<String> paths;
  final int index;

  /// Opened from the vault: keep screenshots blocked
  final bool secure;

  static Future<void> open(BuildContext context, List<String> paths, int index, {bool secure = false}) {
    return Navigator.of(context).push(MaterialPageRoute(builder: (_) => PlayerPage(paths: paths, index: index, secure: secure)));
  }

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> {
  late final player = Player();
  late final controller = VideoController(player);
  int current = 0;
  double rate = 1;

  @override
  void initState() {
    super.initState();
    current = widget.index;
    if (widget.secure) Engine.secure(true);
    player.open(Playlist([for (final p in widget.paths) Media(Uri.file(p).toString())], index: widget.index));
    player.stream.playlist.listen((p) {
      if (mounted) setState(() => current = p.index);
    });
  }

  @override
  void dispose() {
    player.dispose();
    super.dispose();
  }

  String get _path => widget.paths[current];
  String get _title {
    final name = _path.split('/').last;
    return name.contains('.') ? name.substring(0, name.lastIndexOf('.')) : name;
  }

  bool get _isAudio => mediaTypeOf(_path) == MediaType.audio;

  void _speedMenu() {
    showModalBottomSheet(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(context.tr('speed'), style: const TextStyle(fontWeight: FontWeight.w700))),
          RadioGroup<double>(
            groupValue: rate,
            onChanged: (v) {
              setState(() => rate = v!);
              player.setRate(v!);
              Navigator.pop(sheet);
            },
            child: Column(children: [for (final r in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]) RadioListTile<double>(value: r, title: Text('${r}x'))]),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controls = MaterialVideoControlsThemeData(
      seekGesture: true,
      volumeGesture: true,
      brightnessGesture: true,
      seekOnDoubleTap: true,
      speedUpOnLongPress: true,
      seekBarThumbColor: Brand.blue,
      seekBarPositionColor: Brand.blue,
      topButtonBar: [
        MaterialCustomButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.maybePop(context)),
        const SizedBox(width: 8),
        Expanded(child: Text(_title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
        MaterialCustomButton(icon: const Icon(Icons.speed_rounded), onPressed: _speedMenu),
        if (!_isAudio) MaterialCustomButton(icon: const Icon(Icons.picture_in_picture_alt_rounded), onPressed: Engine.pip),
        if (!widget.secure) MaterialCustomButton(icon: const Icon(Icons.share_rounded), onPressed: () => SharePlus.instance.share(ShareParams(files: [XFile(_path)]))),
      ],
      bottomButtonBar: [
        if (widget.paths.length > 1) MaterialCustomButton(icon: const Icon(Icons.skip_previous_rounded), onPressed: player.previous),
        const MaterialPlayOrPauseButton(),
        if (widget.paths.length > 1) MaterialCustomButton(icon: const Icon(Icons.skip_next_rounded), onPressed: player.next),
        const MaterialPositionIndicator(),
        const Spacer(),
        const MaterialFullscreenButton(),
      ],
    );

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: MaterialVideoControlsTheme(
              normal: controls,
              fullscreen: controls,
              child: Stack(fit: StackFit.expand, children: [
                if (_isAudio) _AudioArt(title: _title),
                Video(controller: controller, fill: _isAudio ? Colors.transparent : Colors.black),
              ]),
            ),
          ),
          if (widget.paths.length > 1)
            SizedBox(
              height: 180,
              child: ListView.builder(
                itemCount: widget.paths.length,
                itemBuilder: (_, i) {
                  final name = widget.paths[i].split('/').last;
                  final playing = i == current;
                  return ListTile(
                    dense: true,
                    leading: Icon(
                      playing ? Icons.equalizer_rounded : (mediaTypeOf(widget.paths[i]) == MediaType.audio ? Icons.music_note_rounded : Icons.movie_rounded),
                      color: playing ? Brand.blue : Colors.white54,
                    ),
                    title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: playing ? Brand.blue : Colors.white)),
                    onTap: () => player.jump(i),
                  );
                },
              ),
            ),
        ]),
      ),
    );
  }
}

class _AudioArt extends StatelessWidget {
  const _AudioArt({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Brand.violet.withValues(alpha: 0.45), Colors.black], begin: Alignment.topCenter, end: Alignment.bottomCenter),
      ),
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(gradient: Brand.gradient, borderRadius: BorderRadius.circular(32)),
            child: const Icon(Icons.music_note_rounded, size: 80, color: Colors.white),
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(title, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
          ),
        ]),
      ),
    );
  }
}
