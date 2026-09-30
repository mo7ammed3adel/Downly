import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/downloads.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/settings.dart';
import '../core/vault.dart';
import 'browser_tab.dart';
import 'download_sheet.dart';
import 'downloads_tab.dart';
import 'home_tab.dart';
import 'library_tab.dart';
import 'player_page.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});

  static ShellState of(BuildContext context) => context.findAncestorStateOfType<ShellState>()!;

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

  void go(int index) => setState(() => tab = index);

  void openInBrowser(String url) {
    go(1);
    browserKey.currentState?.load(url);
  }

  void _handleShared(String text) {
    final url = extractUrl(text);
    if (url == null || !mounted) return;
    showDownloadSheet(context, url);
  }

  Future<void> _checkClipboard() async {
    final settings = context.read<Settings>();
    if (!settings.watchClipboard || !mounted) return;
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
          const LibraryTab(),
        ]),
        bottomNavigationBar: NavigationBar(
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
            NavigationDestination(icon: const Icon(Icons.video_library_outlined), selectedIcon: const Icon(Icons.video_library_rounded), label: context.tr('library')),
          ],
        ),
      ),
    );
  }
}
