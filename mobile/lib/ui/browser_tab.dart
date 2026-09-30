import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/cookies.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/settings.dart';
import 'download_sheet.dart';
import 'home_tab.dart' show QuickSite, quickSites;
import 'theme.dart';

const _desktopAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

final _mediaUrl = RegExp(r'\.(mp4|webm|m4a|mp3|m3u8|mov|ogg|aac|flac)(\?|#|$)', caseSensitive: false);

/// Pages that are almost certainly a single video/song (the download button pulses there)
final _videoPage = RegExp(
  r'youtube\.com/(watch|shorts/)|youtu\.be/|tiktok\.com/.+/video/|instagram\.com/(reel|reels|p|tv)/|'
  r'facebook\.com/(.+/videos/|watch|reel)|fb\.watch/|(x|twitter)\.com/.+/status/|soundcloud\.com/[^/]+/[^/?]+|'
  r'vimeo\.com/\d+|dailymotion\.com/video/|pinterest\.[a-z.]+/pin/|reddit\.com/r/.+/comments/|twitch\.tv/videos/',
);

// A light ad blocker: the worst offenders on video sites
final _blockers = [
  for (final host in [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
    'popads.net', 'popcash.net', 'propellerads.com', 'adsterra.com', 'exoclick.com', 'juicyads.com',
    'onclickads.net', 'adcash.com', 'hilltopads.net', 'trafficjunky.net', 'mgid.com', 'taboola.com', 'outbrain.com',
  ])
    ContentBlocker(
      trigger: ContentBlockerTrigger(urlFilter: '.*${RegExp.escape(host)}/.*'),
      action: ContentBlockerAction(type: ContentBlockerActionType.BLOCK),
    ),
];

class BrowserTab extends StatefulWidget {
  const BrowserTab({super.key});

  @override
  State<BrowserTab> createState() => BrowserTabState();
}

class BrowserTabState extends State<BrowserTab> {
  InAppWebViewController? _web;
  final _address = TextEditingController();
  final _focus = FocusNode();
  String? _url;
  String? _pendingUrl;
  double _progress = 1;
  bool _started = false;
  final _found = <String, FoundMedia>{};

  @override
  void dispose() {
    _address.dispose();
    _focus.dispose();
    super.dispose();
  }

  bool get _onStartPage => !_started;

  /// A link that failed because the site wanted a login; offered again once the user logs in
  String? _resume;

  void resumeAfterLogin(String url) => setState(() => _resume = url);

  void load(String input) {
    final value = input.trim();
    if (value.isEmpty) return;
    final url = extractUrl(value) ??
        (RegExp(r'^[\w-]+(\.[\w-]+)+(/\S*)?$').hasMatch(value)
            ? 'https://$value'
            : 'https://www.google.com/search?q=${Uri.encodeQueryComponent(value)}');
    _focus.unfocus();
    setState(() {
      _address.text = url;
      _found.clear();
      if (!_started) {
        _started = true;
        _pendingUrl = url; // loaded once the web view exists
      }
    });
    _web?.loadUrl(urlRequest: URLRequest(url: WebUri(url)));
  }

  /// Back inside the browser; false when there's nowhere to go back to
  Future<bool> goBack() async {
    if (_onStartPage) return false;
    if (await _web?.canGoBack() ?? false) {
      await _web!.goBack();
      return true;
    }
    setState(() => _started = false);
    return true;
  }

  void _home() => setState(() {
        _started = false;
        _address.clear();
      });

  Future<Map<String, String>> _headers(String url) async {
    final agent = context.read<Settings>().desktopMode ? _desktopAgent : null;
    return {
      'Referer': ?_url,
      'User-Agent': ?agent,
      'Cookie': ?await cookieHeaderFor(url),
    };
  }

  Future<void> _download() async {
    final url = _url;
    if (url == null) return;
    // <video>/<audio> elements that aren't blob: streams
    try {
      final result = await _web?.evaluateJavascript(source: '''
        Array.from(document.querySelectorAll('video,audio,video source,audio source'))
          .map(e => e.currentSrc || e.src).filter(s => s && s.startsWith('http'))''');
      if (result is List) {
        for (final src in result.whereType<String>()) {
          _found.putIfAbsent(src, () => FoundMedia(src, _label(src)));
        }
      }
    } catch (_) {
      // Page not ready
    }
    final headers = await _headers(url);
    if (!mounted) return;
    showDownloadSheet(context, url, found: _found.values.toList(), headers: headers);
  }

  String _label(String url) {
    final path = Uri.tryParse(url)?.pathSegments.where((s) => s.isNotEmpty).lastOrNull ?? url;
    return Uri.decodeComponent(path);
  }

  Future<void> _toggleDesktop() async {
    final settings = context.read<Settings>();
    settings.desktopMode = !settings.desktopMode;
    await _web?.setSettings(settings: InAppWebViewSettings(userAgent: settings.desktopMode ? _desktopAgent : ''));
    await _web?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final pulse = _url != null && (_videoPage.hasMatch(_url!) || _found.isNotEmpty);
    return SafeArea(
      bottom: false,
      child: Column(children: [
        _bar(context, settings),
        if (_resume != null)
          MaterialBanner(
            leading: const Icon(Icons.login_rounded, color: Brand.violet),
            content: Text(context.tr('loginThenContinue')),
            actions: [
              TextButton(onPressed: () => setState(() => _resume = null), child: Text(context.tr('cancel'))),
              FilledButton(
                onPressed: () {
                  final url = _resume!;
                  setState(() => _resume = null);
                  showDownloadSheet(context, url);
                },
                child: Text(context.tr('continueDownload')),
              ),
            ],
          ),
        if (_progress < 1 && !_onStartPage) LinearProgressIndicator(value: _progress, minHeight: 2),
        Expanded(
          child: Stack(children: [
            if (_started)
              InAppWebView(
                initialUrlRequest: _pendingUrl != null ? URLRequest(url: WebUri(_pendingUrl!)) : null,
                initialSettings: InAppWebViewSettings(
                  useOnLoadResource: true,
                  useOnDownloadStart: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowsInlineMediaPlayback: true,
                  supportMultipleWindows: false,
                  javaScriptCanOpenWindowsAutomatically: false,
                  contentBlockers: _blockers,
                  userAgent: settings.desktopMode ? _desktopAgent : '',
                ),
                onWebViewCreated: (c) {
                  _web = c;
                  _pendingUrl = null;
                },
                onLoadStart: (_, url) => setState(() {
                  _url = url?.toString();
                  _found.clear();
                  if (!_focus.hasFocus) _address.text = _url ?? '';
                }),
                onUpdateVisitedHistory: (_, url, _) => setState(() {
                  // Single-page sites (YouTube, TikTok) change the URL without a new load
                  if (_url != url?.toString()) _found.clear();
                  _url = url?.toString();
                  if (!_focus.hasFocus) _address.text = _url ?? '';
                }),
                onProgressChanged: (_, p) => setState(() => _progress = p / 100),
                onLoadResource: (_, resource) {
                  final u = resource.url?.toString();
                  if (u != null && _mediaUrl.hasMatch(u) && !_found.containsKey(u)) {
                    setState(() => _found[u] = FoundMedia(u, _label(u)));
                  }
                },
                onDownloadStartRequest: (_, request) async {
                  final url = request.url.toString();
                  final headers = await _headers(url);
                  if (request.userAgent != null) headers['User-Agent'] = request.userAgent!;
                  if (!context.mounted) return;
                  addFileDownload(context, url, headers: headers);
                },
              ),
            if (_onStartPage) _StartPage(onOpen: load),
            if (!_onStartPage)
              PositionedDirectional(
                end: 16,
                // Above the bottom bars most mobile sites have (YouTube, TikTok, Instagram)
                bottom: 88,
                child: _DownloadFab(pulse: pulse, count: _found.length, onTap: _download),
              ),
          ]),
        ),
      ]),
    );
  }

  Widget _bar(BuildContext context, Settings settings) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 4, 8),
      child: Row(children: [
        IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: _onStartPage ? null : goBack,
        ),
        Expanded(
          child: SizedBox(
            height: 46,
            child: TextField(
              controller: _address,
              focusNode: _focus,
              keyboardType: TextInputType.url,
              textInputAction: TextInputAction.go,
              onSubmitted: load,
              onTap: () => _address.selection = TextSelection(baseOffset: 0, extentOffset: _address.text.length),
              decoration: InputDecoration(
                hintText: context.tr('searchOrUrl'),
                prefixIcon: Icon(_url?.startsWith('https') ?? false ? Icons.lock_outline_rounded : Icons.search_rounded, size: 18),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
              ),
            ),
          ),
        ),
        PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert_rounded),
          onSelected: (v) async {
            switch (v) {
              case 'reload':
                _web?.reload();
              case 'home':
                _home();
              case 'desktop':
                _toggleDesktop();
              case 'copy':
                if (_url != null) {
                  await Clipboard.setData(ClipboardData(text: _url!));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.tr('copied')), duration: const Duration(seconds: 1)));
                  }
                }
              case 'share':
                if (_url != null) SharePlus.instance.share(ShareParams(uri: Uri.parse(_url!)));
            }
          },
          itemBuilder: (_) => [
            PopupMenuItem(value: 'reload', enabled: !_onStartPage, child: ListTile(leading: const Icon(Icons.refresh_rounded), title: Text(context.tr('reload')))),
            PopupMenuItem(value: 'home', child: ListTile(leading: const Icon(Icons.apps_rounded), title: Text(context.tr('browserHome')))),
            CheckedPopupMenuItem(value: 'desktop', checked: settings.desktopMode, child: Text(context.tr('desktopSite'))),
            PopupMenuItem(value: 'copy', enabled: _url != null, child: ListTile(leading: const Icon(Icons.link_rounded), title: Text(context.tr('copyLink')))),
            PopupMenuItem(value: 'share', enabled: _url != null, child: ListTile(leading: const Icon(Icons.share_rounded), title: Text(context.tr('share')))),
          ],
        ),
      ]),
    );
  }
}

class _StartPage extends StatelessWidget {
  const _StartPage({required this.onOpen});

  final void Function(String url) onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.surface,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 14,
          childAspectRatio: 0.82,
          children: [for (final s in quickSites) _tile(context, s)],
        ),
        const SizedBox(height: 20),
        Card(
          child: ListTile(
            leading: const Icon(Icons.key_rounded, color: Brand.violet),
            title: Text(context.tr('loginTip'), style: theme.textTheme.bodySmall?.copyWith(height: 1.4)),
          ),
        ),
      ]),
    );
  }

  Widget _tile(BuildContext context, QuickSite s) => InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => onOpen(s.url),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(color: s.color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(18)),
            child: Center(child: FaIcon(s.icon, color: s.color, size: 26)),
          ),
          const SizedBox(height: 6),
          Text(s.name, style: Theme.of(context).textTheme.labelMedium),
        ]),
      );
}

class _DownloadFab extends StatefulWidget {
  const _DownloadFab({required this.pulse, required this.count, required this.onTap});

  final bool pulse;
  final int count;
  final VoidCallback onTap;

  @override
  State<_DownloadFab> createState() => _DownloadFabState();
}

class _DownloadFabState extends State<_DownloadFab> with SingleTickerProviderStateMixin {
  late final _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void initState() {
    super.initState();
    if (widget.pulse) _anim.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _DownloadFab old) {
    super.didUpdateWidget(old);
    if (widget.pulse && !_anim.isAnimating) _anim.repeat(reverse: true);
    if (!widget.pulse && _anim.isAnimating) _anim.animateTo(0);
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, child) => Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          boxShadow: [BoxShadow(color: Brand.blue.withValues(alpha: 0.25 + 0.35 * _anim.value), blurRadius: 12 + 16 * _anim.value)],
        ),
        child: child,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(30),
          onTap: widget.onTap,
          child: Ink(
            decoration: BoxDecoration(gradient: Brand.gradient, borderRadius: BorderRadius.circular(30)),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.download_rounded, color: Colors.white),
              const SizedBox(width: 8),
              Text(context.tr('downloadThis'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
              if (widget.count > 0) ...[
                const SizedBox(width: 8),
                CircleAvatar(radius: 10, backgroundColor: Colors.white, child: Text('${widget.count}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Brand.blue))),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}
