import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/downloads.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/library.dart';
import '../core/models.dart';
import '../core/music.dart';
import '../core/vault.dart';
import 'home_tab.dart' show MediaThumb;
import 'player_page.dart';
import 'theme.dart';
import 'vault_page.dart';

class LibraryTab extends StatelessWidget {
  const LibraryTab({super.key});

  @override
  Widget build(BuildContext context) {
    final library = context.watch<Library>();
    // Thumbnails come from the download that made the file
    final thumbs = {
      for (final t in context.watch<Downloads>().tasks)
        if (t.path != null && t.thumbnail != null) t.path!: t.thumbnail!,
    };
    return DefaultTabController(
      length: 3,
      child: SafeArea(
        bottom: false,
        child: NestedScrollView(
          headerSliverBuilder: (context, _) => [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
                child: Text(context.tr('library'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              ),
            ),
            const SliverToBoxAdapter(child: _VaultCard()),
            SliverToBoxAdapter(
              child: TabBar(
                dividerColor: Colors.transparent,
                tabs: [
                  Tab(text: context.tr('videos')),
                  Tab(text: context.tr('music')),
                  Tab(text: context.tr('files')),
                ],
              ),
            ),
          ],
          body: TabBarView(children: [
            _MediaList(items: library.of(MediaType.video), thumbs: thumbs, grid: true),
            _MediaList(items: library.of(MediaType.audio), thumbs: thumbs),
            _MediaList(items: library.of(MediaType.file), thumbs: thumbs),
          ]),
        ),
      ),
    );
  }
}

class _VaultCard extends StatelessWidget {
  const _VaultCard();

  @override
  Widget build(BuildContext context) {
    final vault = context.watch<Vault>();
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Material(
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        color: Colors.transparent,
        child: InkWell(
          onTap: () => VaultPage.open(context),
          child: Ink(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [Brand.violet.withValues(alpha: 0.28), Brand.blue.withValues(alpha: 0.14)]),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Brand.violet.withValues(alpha: 0.35)),
            ),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Brand.violet.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.lock_rounded, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(context.tr('vault'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                  Text(context.tr('vaultCard'), style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                ]),
              ),
              if (vault.unlocked) Text('${vault.items.length}', style: theme.textTheme.titleMedium),
              const Icon(Icons.chevron_right_rounded),
            ]),
          ),
        ),
      ),
    );
  }
}

class _MediaList extends StatelessWidget {
  const _MediaList({required this.items, required this.thumbs, this.grid = false});

  final List<LibraryItem> items;
  final Map<String, String> thumbs;
  final bool grid;

  @override
  Widget build(BuildContext context) {
    final library = context.read<Library>();
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: library.refresh,
        child: ListView(children: [
          const SizedBox(height: 80),
          Icon(Icons.video_library_outlined, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(context.tr('emptyLibrary'), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(context.tr('savedIn'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
        ]),
      );
    }
    final paths = items.map((i) => i.path).toList();
    void play(int i) => PlayerPage.open(context, paths, i);

    return RefreshIndicator(
      onRefresh: library.refresh,
      child: grid
          ? GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 12, childAspectRatio: 1.05),
              itemCount: items.length,
              itemBuilder: (_, i) => _VideoTile(item: items[i], thumb: thumbs[items[i].path], onTap: () => play(i)),
            )
          : ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: items.length,
              itemBuilder: (_, i) {
                final item = items[i];
                final isFile = item.type == MediaType.file;
                return ListTile(
                  leading: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: SizedBox(
                      width: 48,
                      height: 48,
                      child: MediaThumb(url: thumbs[item.path], kind: isFile ? TaskKind.file : TaskKind.audio),
                    ),
                  ),
                  title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(formatBytes(item.size)),
                  // Songs go to the music player (keeps playing in the background)
                  onTap: isFile ? () => itemMenu(context, item, thumbs[item.path]) : () => music.playSongs(items.map((s) => Song.fromFile(s.path)).toList(), i),
                  trailing: IconButton(icon: const Icon(Icons.more_vert_rounded), onPressed: () => itemMenu(context, item, thumbs[item.path])),
                );
              },
            ),
    );
  }
}

class _VideoTile extends StatelessWidget {
  const _VideoTile({required this.item, required this.thumb, required this.onTap});

  final LibraryItem item;
  final String? thumb;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      onLongPress: () => itemMenu(context, item, thumb),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: AspectRatio(
            aspectRatio: 16 / 10,
            child: Stack(fit: StackFit.expand, children: [
              MediaThumb(url: thumb, kind: TaskKind.video),
              const Center(child: CircleAvatar(radius: 16, backgroundColor: Colors.black54, child: Icon(Icons.play_arrow_rounded, color: Colors.white))),
              Positioned(
                right: 6,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(6)),
                  child: Text(formatBytes(item.size), style: const TextStyle(color: Colors.white, fontSize: 10)),
                ),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 6),
        Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

void itemMenu(BuildContext context, LibraryItem item, String? thumb) {
  showModalBottomSheet(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(title: Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis), subtitle: Text(formatBytes(item.size))),
        ListTile(
          leading: const Icon(Icons.share_rounded),
          title: Text(context.tr('share')),
          onTap: () {
            Navigator.pop(sheet);
            SharePlus.instance.share(ShareParams(files: [XFile(item.path)]));
          },
        ),
        ListTile(
          leading: const Icon(Icons.lock_rounded, color: Brand.violet),
          title: Text(context.tr('moveToVault')),
          onTap: () async {
            Navigator.pop(sheet);
            final messenger = ScaffoldMessenger.of(context);
            final text = context.tr('movedToVault');
            final library = context.read<Library>();
            await context.read<Vault>().add(item.path, title: item.title, thumbnail: thumb);
            library.refresh();
            messenger.showSnackBar(SnackBar(content: Text(text)));
          },
        ),
        ListTile(
          leading: const Icon(Icons.delete_outline_rounded, color: Brand.red),
          title: Text(context.tr('delete')),
          onTap: () async {
            Navigator.pop(sheet);
            final library = context.read<Library>();
            await Engine.delete(item.path);
            library.refresh();
          },
        ),
      ]),
    ),
  );
}
