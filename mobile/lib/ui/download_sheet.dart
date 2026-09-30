import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../core/cookies.dart';
import '../core/downloads.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/library.dart';
import '../core/models.dart';
import '../core/settings.dart';
import '../core/vault.dart';
import '../core/ytdlp_args.dart';
import 'home_tab.dart' show MediaThumb;
import 'theme.dart';

/// A media file the browser saw a page load (mp4, m3u8, mp3…)
class FoundMedia {
  const FoundMedia(this.url, this.label);

  final String url;
  final String label;
}

Future<void> showDownloadSheet(
  BuildContext context,
  String url, {
  List<FoundMedia> found = const [],
  Map<String, String> headers = const {},
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => DownloadSheet(url: url, found: found, headers: headers),
  );
}

/// Adds a plain file download (no yt-dlp). Call it before closing a sheet: it needs a live context.
void addFileDownload(BuildContext context, String url, {Map<String, String> headers = const {}, bool private = false}) {
  final messenger = ScaffoldMessenger.of(context);
  final text = context.tr('added');
  context.read<Downloads>().add(DownloadTask(
        id: const Uuid().v4(),
        url: url,
        title: Uri.tryParse(url)?.pathSegments.where((s) => s.isNotEmpty).lastOrNull ?? url,
        kind: TaskKind.file,
        args: const [],
        headers: headers,
        private: private,
      ));
  _added(messenger, text);
}

void _added(ScaffoldMessengerState messenger, String text) {
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Row(children: [
      const Icon(Icons.download_done_rounded, color: Brand.green),
      const SizedBox(width: 12),
      Text(text),
    ]), duration: const Duration(seconds: 2)));
}

class DownloadSheet extends StatefulWidget {
  const DownloadSheet({super.key, required this.url, this.found = const [], this.headers = const {}});

  final String url;
  final List<FoundMedia> found;
  final Map<String, String> headers;

  @override
  State<DownloadSheet> createState() => _DownloadSheetState();
}

class _DownloadSheetState extends State<DownloadSheet> {
  MediaInfo? info;
  String? error;
  String? cookies;
  bool audio = false;
  int? height;
  bool private = false;
  final selected = <int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      info = null;
      error = null;
    });
    try {
      cookies = await cookiesFileFor(widget.url);
      MediaInfo result;
      try {
        result = await Engine.info(widget.url, cookies: cookies);
      } catch (_) {
        // Stale browser cookies can break a public link; retry without them
        if (cookies == null) rethrow;
        cookies = null;
        result = await Engine.info(widget.url);
      }
      if (!mounted) return;
      final settings = context.read<Settings>();
      final wanted = settings.videoQuality;
      setState(() {
        info = result;
        audio = !result.hasVideo;
        // Closest available height at or below the preferred one
        height = result.heights.isEmpty
            ? 0
            : wanted == 0
                ? result.heights.first
                : result.heights.firstWhere((h) => h <= wanted, orElse: () => result.heights.last);
        selected
          ..clear()
          ..addAll(List.generate(result.entries.length, (i) => i));
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst(RegExp(r'^PlatformException\(engine, '), '').replaceFirst(RegExp(r', null, null\)$'), ''));
    }
  }

  Future<List<String>> _args(String dir) async {
    final settings = context.read<Settings>();
    return audio
        ? audioArgs(dir: dir, format: settings.audioFormat, cookies: cookies)
        : videoArgs(dir: dir, height: height ?? 0, subtitles: settings.subtitles, cookies: cookies);
  }

  Future<void> _download() async {
    final i = info!;
    final downloads = context.read<Downloads>();
    final vault = context.read<Vault>();
    final settings = context.read<Settings>();
    final messenger = ScaffoldMessenger.of(context);
    final addedText = context.tr('added');
    final kind = audio ? TaskKind.audio : TaskKind.video;
    final dir = private ? vault.dir : await Library.folderFor(audio ? MediaType.audio : MediaType.video);
    final args = await _args(dir);
    final quality = audio ? settings.audioFormat.toUpperCase() : (height != null && height! > 0 ? qualityLabel(height!) : null);

    if (i.isPlaylist) {
      for (final index in selected.toList()..sort((a, b) => b - a)) {
        final e = i.entries[index];
        downloads.add(DownloadTask(
          id: const Uuid().v4(), url: e.url, title: e.title, kind: kind, args: args,
          thumbnail: e.thumbnail, quality: quality, site: i.site, private: private,
        ));
      }
    } else {
      downloads.add(DownloadTask(
        id: const Uuid().v4(), url: i.url, title: i.title, kind: kind, args: args,
        thumbnail: i.thumbnail, quality: quality, site: i.site, private: private,
      ));
    }
    if (!mounted) return;
    Navigator.pop(context);
    _added(messenger, addedText);
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          if (error != null)
            _error(context)
          else if (info == null)
            _loading(context)
          else ...[
            _header(context, info!),
            const SizedBox(height: 18),
            if (info!.isPlaylist) ..._playlist(context, info!),
            _typeSwitch(context),
            const SizedBox(height: 14),
            if (audio) _audioOptions(context) else _videoOptions(context),
            const SizedBox(height: 10),
            _privateSwitch(context),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: info!.isPlaylist && selected.isEmpty ? null : _download,
              icon: const Icon(Icons.download_rounded),
              label: Text(info!.isPlaylist ? context.tr('downloadN', args: {'n': selected.length}) : context.tr('download')),
            ),
          ],
          if (widget.found.isNotEmpty) ..._found(context),
        ],
      ),
    );
  }

  Widget _loading(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48),
        child: Column(children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 18),
          Text(context.tr('loadingInfo')),
          const SizedBox(height: 6),
          Text(widget.url, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ]),
      );

  Widget _error(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(children: [
        const Icon(Icons.error_outline_rounded, size: 48, color: Brand.red),
        const SizedBox(height: 12),
        Text(context.tr('error'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(error!, textAlign: TextAlign.center, maxLines: 4, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: _load, icon: const Icon(Icons.refresh_rounded), label: Text(context.tr('retry')))),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.tonalIcon(
              onPressed: () {
                addFileDownload(context, widget.url, headers: widget.headers);
                Navigator.pop(context);
              },
              icon: const Icon(Icons.insert_drive_file_outlined),
              label: Text(context.tr('downloadAsFile')),
            ),
          ),
        ]),
      ]),
    );
  }

  Widget _header(BuildContext context, MediaInfo i) {
    final theme = Theme.of(context);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          width: 132,
          height: 74,
          child: Stack(fit: StackFit.expand, children: [
            MediaThumb(url: i.thumbnail, kind: i.hasVideo ? TaskKind.video : TaskKind.audio),
            if (i.duration != null)
              Positioned(
                right: 6,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(6)),
                  child: Text(formatDuration(i.duration), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ),
          ]),
        ),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(i.title, maxLines: 3, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, height: 1.3)),
          const SizedBox(height: 4),
          Text(
            [if (i.uploader != null) i.uploader!, if (i.site != null) i.site!, if (i.isPlaylist) '${i.entries.length} ${context.tr('items')}'].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ]),
      ),
    ]);
  }

  List<Widget> _playlist(BuildContext context, MediaInfo i) {
    final all = selected.length == i.entries.length;
    return [
      Row(children: [
        Text(context.tr('playlist'), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        const Spacer(),
        TextButton(
          onPressed: () => setState(() => all ? selected.clear() : selected.addAll(List.generate(i.entries.length, (n) => n))),
          child: Text(context.tr('selectAll')),
        ),
      ]),
      Container(
        constraints: const BoxConstraints(maxHeight: 260),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainer, borderRadius: BorderRadius.circular(16)),
        child: ListView.builder(
          shrinkWrap: true,
          itemCount: i.entries.length,
          itemBuilder: (_, n) {
            final e = i.entries[n];
            return CheckboxListTile(
              dense: true,
              value: selected.contains(n),
              onChanged: (v) => setState(() => v! ? selected.add(n) : selected.remove(n)),
              title: Text(e.title, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: e.duration != null ? Text(formatDuration(e.duration)) : null,
            );
          },
        ),
      ),
      const SizedBox(height: 16),
    ];
  }

  Widget _typeSwitch(BuildContext context) => SegmentedButton<bool>(
        segments: [
          ButtonSegment(value: false, icon: const Icon(Icons.movie_rounded), label: Text(context.tr('video')), enabled: info!.hasVideo),
          ButtonSegment(value: true, icon: const Icon(Icons.music_note_rounded), label: Text(context.tr('audio'))),
        ],
        selected: {audio},
        showSelectedIcon: false,
        style: SegmentedButton.styleFrom(minimumSize: const Size(0, 46)),
        onSelectionChanged: (s) => setState(() => audio = s.first),
      );

  Widget _videoOptions(BuildContext context) {
    final i = info!;
    final heights = i.heights.isEmpty ? [0] : i.heights;
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (final h in heights)
        _OptionChip(
          selected: height == h,
          title: h == 0 ? context.tr('bestQuality') : qualityLabel(h),
          subtitle: i.isPlaylist ? null : formatBytes(i.videoSizes[h]),
          badge: h >= 1080 ? 'HD' : null,
          onTap: () => setState(() => height = h),
        ),
    ]);
  }

  Widget _audioOptions(BuildContext context) {
    final settings = context.watch<Settings>();
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (final f in ['mp3', 'm4a'])
        _OptionChip(
          selected: settings.audioFormat == f,
          title: f.toUpperCase(),
          subtitle: info!.isPlaylist ? null : formatBytes(info!.audioSize),
          onTap: () => settings.audioFormat = f,
        ),
    ]);
  }

  Widget _privateSwitch(BuildContext context) => SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: private,
        onChanged: (v) => setState(() => private = v),
        secondary: Icon(Icons.lock_rounded, color: private ? Brand.violet : null),
        title: Text(context.tr('privateDownload')),
        subtitle: Text(context.tr('privateHint')),
      );

  List<Widget> _found(BuildContext context) => [
        const SizedBox(height: 22),
        Text(context.tr('foundOnPage'), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        for (final m in widget.found)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.play_circle_outline_rounded),
            title: Text(m.label, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(m.url, maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: IconButton.filledTonal(
              icon: const Icon(Icons.download_rounded),
              onPressed: () {
                // Streams (m3u8) need yt-dlp; plain files download directly
                if (m.url.contains('.m3u8')) {
                  final navigator = Navigator.of(context)..pop();
                  showDownloadSheet(navigator.context, m.url, headers: widget.headers);
                } else {
                  addFileDownload(context, m.url, headers: widget.headers);
                  Navigator.pop(context);
                }
              },
            ),
          ),
      ];
}

class _OptionChip extends StatelessWidget {
  const _OptionChip({required this.selected, required this.title, this.subtitle, this.badge, required this.onTap});

  final bool selected;
  final String title;
  final String? subtitle;
  final String? badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 100,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: selected ? Brand.blue.withValues(alpha: 0.16) : scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? Brand.blue : scheme.outlineVariant, width: selected ? 1.6 : 1),
        ),
        child: Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(title, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: selected ? Brand.blue : null)),
            if (badge != null) ...[
              const SizedBox(width: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(color: Brand.violet, borderRadius: BorderRadius.circular(4)),
                child: Text(badge!, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
              ),
            ],
          ]),
          if (subtitle != null && subtitle!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          ],
        ]),
      ),
    );
  }
}
