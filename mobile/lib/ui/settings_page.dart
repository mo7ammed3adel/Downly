import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/settings.dart';
import '../core/updater.dart';
import '../core/vault.dart';
import 'shell.dart';
import 'theme.dart';
import 'vault_page.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  String? version;
  String? appVersion;
  bool updating = false;
  bool checking = false;

  @override
  void initState() {
    super.initState();
    Engine.init().then((v) {
      if (mounted) setState(() => version = v);
    }).catchError((_) {});
    Updater.currentVersion().then((v) {
      if (mounted) setState(() => appVersion = v);
    });
  }

  Future<void> _update() async {
    setState(() => updating = true);
    final messenger = ScaffoldMessenger.of(context);
    final okText = context.tr('engineUpdated');
    try {
      final r = await Engine.update();
      if (!mounted) return;
      setState(() => version = r.version);
      messenger.showSnackBar(SnackBar(content: Text('$okText · ${r.version ?? ''}')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => updating = false);
    }
  }

  Future<T?> _pick<T>(String title, Map<T, String> options, T current) => showModalBottomSheet<T>(
        context: context,
        builder: (sheet) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
            RadioGroup<T>(
              groupValue: current,
              onChanged: (v) => Navigator.pop(sheet, v),
              child: Column(children: [for (final e in options.entries) RadioListTile<T>(value: e.key, title: Text(e.value))]),
            ),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Settings>();
    final vault = context.watch<Vault>();
    final langs = {'system': context.tr('system'), 'ar': 'العربية', 'en': 'English'};
    final themes = {ThemeMode.dark: context.tr('dark'), ThemeMode.light: context.tr('light'), ThemeMode.system: context.tr('system')};
    final qualities = {0: context.tr('bestQuality'), 2160: '4K', 1440: '2K', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p'};

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('settings'))),
      body: ListView(children: [
        _header(context, context.tr('general')),
        ListTile(
          leading: const Icon(Icons.language_rounded),
          title: Text(context.tr('language')),
          subtitle: Text(langs[s.language]!),
          onTap: () async {
            final v = await _pick(context.tr('language'), langs, s.language);
            if (v != null) s.language = v;
          },
        ),
        ListTile(
          leading: const Icon(Icons.dark_mode_outlined),
          title: Text(context.tr('theme')),
          subtitle: Text(themes[s.themeMode]!),
          onTap: () async {
            final v = await _pick(context.tr('theme'), themes, s.themeMode);
            if (v != null) s.themeMode = v;
          },
        ),
        SwitchListTile(
          secondary: const Icon(Icons.content_paste_search_rounded),
          title: Text(context.tr('clipboardWatch')),
          value: s.watchClipboard,
          onChanged: (v) => s.watchClipboard = v,
        ),
        _header(context, context.tr('downloadsSection')),
        ListTile(
          leading: const Icon(Icons.high_quality_outlined),
          title: Text(context.tr('defaultQuality')),
          subtitle: Text(qualities[s.videoQuality] ?? '${s.videoQuality}p'),
          onTap: () async {
            final v = await _pick(context.tr('defaultQuality'), qualities, s.videoQuality);
            if (v != null) s.videoQuality = v;
          },
        ),
        ListTile(
          leading: const Icon(Icons.audiotrack_outlined),
          title: Text(context.tr('audioFormat')),
          subtitle: Text(s.audioFormat.toUpperCase()),
          onTap: () async {
            final v = await _pick(context.tr('audioFormat'), {'mp3': 'MP3', 'm4a': 'M4A'}, s.audioFormat);
            if (v != null) s.audioFormat = v;
          },
        ),
        ListTile(
          leading: const Icon(Icons.layers_outlined),
          title: Text(context.tr('parallel')),
          trailing: SegmentedButton<int>(
            segments: const [ButtonSegment(value: 1, label: Text('1')), ButtonSegment(value: 2, label: Text('2')), ButtonSegment(value: 3, label: Text('3'))],
            selected: {s.parallel},
            showSelectedIcon: false,
            onSelectionChanged: (v) => s.parallel = v.first,
          ),
        ),
        SwitchListTile(
          secondary: const Icon(Icons.subtitles_outlined),
          title: Text(context.tr('subtitles')),
          value: s.subtitles,
          onChanged: (v) => s.subtitles = v,
        ),
        ListTile(
          leading: const Icon(Icons.memory_rounded),
          title: Text(context.tr('engine')),
          subtitle: Text('yt-dlp ${version ?? '…'}\n${context.tr('engineHint')}'),
          isThreeLine: true,
          trailing: updating
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
              : FilledButton.tonal(onPressed: _update, child: Text(context.tr('updateEngine'))),
        ),
        _header(context, context.tr('vault')),
        if (vault.hasPin)
          ListTile(
            leading: const Icon(Icons.password_rounded),
            title: Text(context.tr('changePin')),
            // Unlock first; tapping again while unlocked asks for a new PIN
            onTap: () {
              if (vault.unlocked) vault.resetPin();
              VaultPage.open(context);
            },
          ),
        SwitchListTile(
          secondary: const Icon(Icons.fingerprint_rounded),
          title: Text(context.tr('fingerprint')),
          value: vault.biometricEnabled,
          onChanged: (v) => vault.biometricEnabled = v,
        ),
        _header(context, context.tr('about')),
        ListTile(
          leading: const Icon(Icons.system_update_rounded),
          title: Text(context.tr('appVersion')),
          subtitle: Text(appVersion ?? '…'),
          trailing: checking
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
              : FilledButton.tonal(
                  onPressed: () async {
                    setState(() => checking = true);
                    final messenger = ScaffoldMessenger.of(context);
                    final latest = context.tr('upToDate');
                    final update = await Updater.check(force: true);
                    if (!context.mounted) return;
                    setState(() => checking = false);
                    if (update != null) {
                      showUpdateDialog(context, update);
                    } else {
                      messenger.showSnackBar(SnackBar(content: Text(latest)));
                    }
                  },
                  child: Text(context.tr('checkUpdates')),
                ),
        ),
        ListTile(
          leading: const Icon(Icons.public_rounded),
          title: Text(context.tr('website')),
          subtitle: const Text('downly-app.vercel.app'),
          onTap: () => launchUrl(Uri.parse('https://downly-app.vercel.app'), mode: LaunchMode.externalApplication),
        ),
        ListTile(
          leading: const Icon(Icons.favorite_rounded, color: Brand.red),
          title: Text(context.tr('support')),
          onTap: () => launchUrl(Uri.parse('https://downly-app.vercel.app/#support'), mode: LaunchMode.externalApplication),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          child: Text(context.tr('legal'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ),
      ]),
    );
  }

  Widget _header(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 6),
        child: Text(text, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Brand.blue, fontWeight: FontWeight.w700)),
      );
}
