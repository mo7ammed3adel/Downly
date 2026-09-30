import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/downloads.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/music.dart';
import '../core/settings.dart';
import '../core/updater.dart';
import '../core/vault.dart';
import 'browser_tab.dart';
import 'download_sheet.dart';
import 'downloads_tab.dart';
import 'home_tab.dart';
import 'library_tab.dart';
import 'music_ui.dart';
import 'player_page.dart';
import 'theme.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});

  /// Also reachable from sheets and pages pushed above the Shell
  static final globalKey = GlobalKey<ShellState>();

  static ShellState of(BuildContext context) => context.findAncestorStateOfType<ShellState>() ?? globalKey.currentState!;

  @override
  State<Shell> createState() => ShellState();
}

class ShellState extends State<Shell> with WidgetsBindingObserver {
  int tab = 0;
  final browserKey = GlobalKey<BrowserTabState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Engine.onShared(_handleShared);
    Engine.initialShare().then((text) {
      if (text != null) _handleShared(text);
    });
    context.read<Downloads>().onFinished = _finished;
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkClipboard());
    // Look for a new app version a little after startup
    Future.delayed(const Duration(seconds: 4), () async {
      final update = await Updater.check();
      if (update != null && mounted) showUpdateDialog(context, update);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The vault locks as soon as the app leaves the screen
    if (state == AppLifecycleState.paused) context.read<Vault>().lock();
    if (state == AppLifecycleState.resumed) _checkClipboard();
  }

  void go(int index) {
    // The song list (and its permission prompt) loads the first time the Music tab opens
    if (index == 3) context.read<MusicLibrary>().ensureLoaded();
    setState(() => tab = index);
  }

  void openInBrowser(String url) {
    go(1);
    browserKey.currentState?.load(url);
  }

  /// Opens a site's login page; once logged in, a banner offers to retry [resume]
  void openLogin(String loginUrl, {required String resume}) {
    openInBrowser(loginUrl);
    browserKey.currentState?.resumeAfterLogin(resume);
  }

  void _handleShared(String text) {
    final url = extractUrl(text);
    if (url == null || !mounted) return;
    showDownloadSheet(context, url);
  }

  Future<void> _checkClipboard() async {
    final settings = context.read<Settings>();
    if (!settings.watchClipboard || !mounted) return;
    // Only read the clipboard when something new was copied
    final stamp = await Engine.clipStamp();
    if (stamp == null || (stamp != -1 && stamp == settings.lastClipStamp)) return;
    if (stamp != -1) settings.lastClipStamp = stamp;
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final url = extractUrl(data?.text);
    if (url == null || url == settings.lastClipboard || !mounted) return;
    settings.lastClipboard = url;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        content: Row(children: [
          const Icon(Icons.link_rounded, color: Colors.white70),
          const SizedBox(width: 12),
          Expanded(child: Text(context.tr('clipboardFound'))),
        ]),
        action: SnackBarAction(label: context.tr('download'), onPressed: () => showDownloadSheet(context, url)),
      ));
  }

  void _finished(DownloadTask task) {
    if (!mounted || task.private || task.path == null) return;
    final songs = context.read<MusicLibrary>();
    if (task.kind == TaskKind.audio && songs.loaded) songs.refresh();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text('✓ ${task.title}', maxLines: 1, overflow: TextOverflow.ellipsis),
        action: task.kind == TaskKind.file
            ? null
            : SnackBarAction(label: context.tr('play'), onPressed: () => PlayerPage.open(context, [task.path!], 0)),
      ));
  }

  @override
  Widget build(BuildContext context) {
    final running = context.select<Downloads, int>((d) => d.active.length);
    return PopScope(
      canPop: tab == 0,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        // Back goes back in the browser first, then to the home tab
        if (tab == 1 && await (browserKey.currentState?.goBack() ?? Future.value(false))) return;
        go(0);
      },
      child: Scaffold(
        body: IndexedStack(index: tab, children: [
          const HomeTab(),
          BrowserTab(key: browserKey),
          const DownloadsTab(),
          const MusicTab(),
          const LibraryTab(),
        ]),
        bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
          const MiniPlayer(),
          NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: go,
          destinations: [
            NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: context.tr('home')),
            NavigationDestination(icon: const Icon(Icons.public_outlined), selectedIcon: const Icon(Icons.public), label: context.tr('browser')),
            NavigationDestination(
              icon: Badge(isLabelVisible: running > 0, label: Text('$running'), child: const Icon(Icons.download_outlined)),
              selectedIcon: Badge(isLabelVisible: running > 0, label: Text('$running'), child: const Icon(Icons.download_rounded)),
              label: context.tr('downloads'),
            ),
            NavigationDestination(icon: const Icon(Icons.music_note_outlined), selectedIcon: const Icon(Icons.music_note_rounded), label: context.tr('musicTab')),
            NavigationDestination(icon: const Icon(Icons.video_library_outlined), selectedIcon: const Icon(Icons.video_library_rounded), label: context.tr('library')),
          ],
          ),
        ]),
      ),
    );
  }
}

/// "New version" dialog: downloads the APK with a progress bar, then opens Android's installer
Future<void> showUpdateDialog(BuildContext context, AppUpdate update) {
  return showDialog(context: context, barrierDismissible: false, builder: (_) => _UpdateDialog(update: update));
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.update});

  final AppUpdate update;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> with WidgetsBindingObserver {
  double? progress;
  String? path;
  String? error;
  bool waitingPermission = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from "Allow from this source": install right away
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && waitingPermission && path != null) {
      waitingPermission = false;
      _install();
    }
  }

  Future<void> _start() async {
    setState(() {
      progress = 0;
      error = null;
    });
    try {
      path = await Updater.download(widget.update, (p) {
        if (mounted) setState(() => progress = p);
      });
      await _install();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> _install() async {
    final ok = await Updater.install(path!);
    if (!ok) waitingPermission = true;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final u = widget.update;
    final downloading = progress != null && error == null;
    return AlertDialog(
      icon: Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Brand.gradient),
        child: const Icon(Icons.system_update_rounded, color: Colors.white, size: 30),
      ),
      title: Text(context.tr('updateTitle', args: {'v': u.version})),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (u.notes.isNotEmpty)
            Text(
              u.notes.replaceAll('**', '').replaceAll(RegExp(r'^- ', multiLine: true), '• '),
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.5, color: theme.colorScheme.onSurfaceVariant),
            ),
          if (downloading) ...[
            const SizedBox(height: 18),
            LinearProgressIndicator(value: progress! > 0 ? progress : null, minHeight: 6, borderRadius: BorderRadius.circular(3)),
            const SizedBox(height: 6),
            Text(
              progress! >= 1 ? context.tr('updateInstalling') : '${(progress! * 100).round()}%${u.size != null ? ' · ${(u.size! / 1048576).round()} MB' : ''}',
              style: theme.textTheme.bodySmall,
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 12),
            Text(error!, style: const TextStyle(color: Brand.red)),
          ],
        ]),
      ),
      actions: [
        if (!downloading)
          TextButton(
            onPressed: () {
              Updater.skip(u.version);
              Navigator.pop(context);
            },
            child: Text(context.tr('later')),
          ),
        if (!downloading || progress! >= 1)
          FilledButton.icon(
            onPressed: progress != null && progress! >= 1 && path != null ? _install : _start,
            icon: const Icon(Icons.download_rounded),
            label: Text(context.tr(progress != null && progress! >= 1 ? 'install' : 'updateNow')),
          ),
      ],
    );
  }
}
