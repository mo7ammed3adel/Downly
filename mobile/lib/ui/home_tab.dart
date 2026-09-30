import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import '../core/downloads.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import 'download_sheet.dart';
import 'player_page.dart';
import 'status_page.dart';
import 'settings_page.dart';
import 'shell.dart';
import 'theme.dart';

class QuickSite {
  const QuickSite(this.name, this.url, this.icon, this.color);

  final String name;
  final String url;
  final FaIconData icon;
  final Color color;
}

const quickSites = [
  QuickSite('YouTube', 'https://m.youtube.com', FontAwesomeIcons.youtube, Color(0xFFFF0033)),
  QuickSite('TikTok', 'https://www.tiktok.com', FontAwesomeIcons.tiktok, Color(0xFF25F4EE)),
  QuickSite('Instagram', 'https://www.instagram.com', FontAwesomeIcons.instagram, Color(0xFFE1306C)),
  QuickSite('Facebook', 'https://m.facebook.com', FontAwesomeIcons.facebook, Color(0xFF1877F2)),
  QuickSite('X', 'https://x.com', FontAwesomeIcons.xTwitter, Color(0xFF9AA4B2)),
  QuickSite('SoundCloud', 'https://m.soundcloud.com', FontAwesomeIcons.soundcloud, Color(0xFFFF5500)),
  QuickSite('Vimeo', 'https://vimeo.com', FontAwesomeIcons.vimeoV, Color(0xFF1AB7EA)),
  QuickSite('Dailymotion', 'https://www.dailymotion.com', FontAwesomeIcons.play, Color(0xFF0A7BFF)),
  QuickSite('Pinterest', 'https://www.pinterest.com', FontAwesomeIcons.pinterest, Color(0xFFE60023)),
  QuickSite('Reddit', 'https://www.reddit.com', FontAwesomeIcons.reddit, Color(0xFFFF4500)),
  QuickSite('Twitch', 'https://m.twitch.tv', FontAwesomeIcons.twitch, Color(0xFF9146FF)),
  QuickSite('Snapchat', 'https://www.snapchat.com/spotlight', FontAwesomeIcons.snapchat, Color(0xFFFFFC00)),
];

/// A link opens the download sheet; anything else is a YouTube search in the browser
void submitQuery(BuildContext context, String text) {
  final value = text.trim();
  if (value.isEmpty) return;
  final url = extractUrl(value) ?? (RegExp(r'^[\w-]+(\.[\w-]+)+(/\S*)?$').hasMatch(value) ? 'https://$value' : null);
  if (url != null) {
    showDownloadSheet(context, url);
  } else {
    Shell.of(context).openInBrowser('https://m.youtube.com/results?search_query=${Uri.encodeQueryComponent(value)}');
  }
}

class HomeTab extends StatefulWidget {
  const HomeTab({super.key});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text?.trim();
    if (text == null || text.isEmpty || !mounted) return;
    _controller.text = text;
    submitQuery(context, text);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final recent = context.watch<Downloads>().tasks.take(6).toList();
    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 8, 0),
              child: Row(children: [
                ClipRRect(borderRadius: BorderRadius.circular(9), child: Image.asset('assets/icon.png', width: 32, height: 32)),
                const SizedBox(width: 10),
                Text('Downly', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const Spacer(),
                IconButton(
                  tooltip: context.tr('settings'),
                  icon: const Icon(Icons.settings_outlined),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsPage())),
                ),
              ]),
            ),
          ),
          SliverToBoxAdapter(child: _hero(context)),
          SliverToBoxAdapter(child: _tools(context)),
          SliverToBoxAdapter(child: _sectionTitle(context, context.tr('quickSites'))),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverGrid.count(
              crossAxisCount: 4,
              mainAxisSpacing: 14,
              crossAxisSpacing: 8,
              childAspectRatio: 0.82,
              children: [for (final s in quickSites) _SiteTile(site: s)],
            ),
          ),
          if (recent.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: _sectionTitle(context, context.tr('recent'),
                  action: TextButton(onPressed: () => Shell.of(context).go(2), child: Text(context.tr('seeAll')))),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 150,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  scrollDirection: Axis.horizontal,
                  itemCount: recent.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => _RecentCard(task: recent[i]),
                ),
              ),
            ),
          ],
          SliverToBoxAdapter(child: _tip(context)),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }

  Widget _hero(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      padding: const EdgeInsets.fromLTRB(18, 22, 18, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: LinearGradient(
          colors: [Brand.blue.withValues(alpha: 0.22), Brand.violet.withValues(alpha: 0.16)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: Brand.blue.withValues(alpha: 0.25)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(context.tr('heroTitle'), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.25)),
        const SizedBox(height: 16),
        TextField(
          controller: _controller,
          textInputAction: TextInputAction.go,
          keyboardType: TextInputType.url,
          onSubmitted: (v) => submitQuery(context, v),
          decoration: InputDecoration(
            hintText: context.tr('pasteHint'),
            prefixIcon: const Icon(Icons.search_rounded),
            fillColor: theme.colorScheme.surfaceContainerLowest.withValues(alpha: 0.85),
            suffixIcon: Padding(
              padding: const EdgeInsetsDirectional.only(end: 6),
              child: FilledButton.tonalIcon(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                onPressed: _paste,
                icon: const Icon(Icons.content_paste_rounded, size: 18),
                label: Text(context.tr('paste')),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _tools(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Row(children: [
          Expanded(
            child: _ToolCard(
              icon: const FaIcon(FontAwesomeIcons.whatsapp, color: Color(0xFF25D366)),
              color: const Color(0xFF25D366),
              title: context.tr('statusSaver'),
              subtitle: context.tr('statusSaverHint'),
              onTap: () => StatusPage.open(context),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _ToolCard(
              icon: const Icon(Icons.headphones_rounded, color: Brand.violet),
              color: Brand.violet,
              title: context.tr('musicPlayer'),
              subtitle: context.tr('musicPlayerHint'),
              onTap: () => Shell.of(context).go(3),
            ),
          ),
        ]),
      );

  Widget _sectionTitle(BuildContext context, String text, {Widget? action}) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 12, 12),
        child: Row(children: [
          Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
          ?action,
        ]),
      );

  Widget _tip(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Brand.green.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.ios_share_rounded, color: Brand.green),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.tr('tipShareTitle'), style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(context.tr('tipShare'), style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.4)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  const _ToolCard({required this.icon, required this.color, required this.title, required this.subtitle, required this.onTap});

  final Widget icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: color.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: color.withValues(alpha: 0.3))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            icon,
            const SizedBox(height: 10),
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ]),
        ),
      ),
    );
  }
}

class _SiteTile extends StatelessWidget {
  const _SiteTile({required this.site});

  final QuickSite site;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => Shell.of(context).openInBrowser(site.url),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            color: site.color.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: site.color.withValues(alpha: 0.28)),
          ),
          child: Center(child: FaIcon(site.icon, color: site.color, size: 26)),
        ),
        const SizedBox(height: 6),
        Text(site.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelMedium),
      ]),
    );
  }
}

class _RecentCard extends StatelessWidget {
  const _RecentCard({required this.task});

  final DownloadTask task;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final done = task.status == TaskStatus.done && task.path != null && !task.private;
    return SizedBox(
      width: 170,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: done && task.kind != TaskKind.file ? () => PlayerPage.open(context, [task.path!], 0) : () => Shell.of(context).go(2),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(fit: StackFit.expand, children: [
                MediaThumb(url: task.thumbnail, kind: task.kind),
                if (!done)
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: LinearProgressIndicator(value: task.progress, minHeight: 3, backgroundColor: Colors.black38),
                  ),
                if (task.private) const Center(child: Icon(Icons.lock_rounded, color: Colors.white)),
              ]),
            ),
          ),
          const SizedBox(height: 6),
          Text(task.private ? '🔒' : task.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

/// A video thumbnail, or an icon when there's none
class MediaThumb extends StatelessWidget {
  const MediaThumb({super.key, this.url, required this.kind});

  final String? url;
  final TaskKind kind;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fallback = Container(
      color: scheme.surfaceContainerHigh,
      child: Icon(
        switch (kind) {
          TaskKind.video => Icons.movie_rounded,
          TaskKind.audio => Icons.music_note_rounded,
          TaskKind.file => Icons.insert_drive_file_rounded,
        },
        color: scheme.onSurfaceVariant,
      ),
    );
    if (url == null) return fallback;
    return CachedNetworkImage(imageUrl: url!, fit: BoxFit.cover, errorWidget: (_, _, _) => fallback, placeholder: (_, _) => fallback);
  }
}
