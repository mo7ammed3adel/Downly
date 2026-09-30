import 'dart:io';

import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/i18n.dart';
import '../core/statuses.dart';
import '../core/vault.dart';
import 'theme.dart';

const _whatsappGreen = Color(0xFF25D366);

class StatusPage extends StatefulWidget {
  const StatusPage({super.key});

  static void open(BuildContext context) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StatusPage()));

  @override
  State<StatusPage> createState() => _StatusPageState();
}

class _StatusPageState extends State<StatusPage> with WidgetsBindingObserver {
  final selected = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    context.read<Statuses>().refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from WhatsApp: new statuses may be there
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) context.read<Statuses>().refresh();
  }

  Future<void> _saveSelected(Statuses statuses) async {
    final messenger = ScaffoldMessenger.of(context);
    final text = context.tr('savedTo');
    for (final item in statuses.items.where((i) => selected.contains(i.path))) {
      await statuses.save(item);
    }
    setState(selected.clear);
    messenger.showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final statuses = context.watch<Statuses>();
    final selecting = selected.isNotEmpty;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: selecting
              ? Text('${selected.length}')
              : Row(children: [
                  const FaIcon(FontAwesomeIcons.whatsapp, color: _whatsappGreen),
                  const SizedBox(width: 10),
                  Text(context.tr('statusSaver')),
                ]),
          leading: selecting ? IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => setState(selected.clear)) : null,
          actions: [
            if (selecting)
              TextButton.icon(
                onPressed: () => _saveSelected(statuses),
                icon: const Icon(Icons.download_rounded),
                label: Text(context.tr('saveN', args: {'n': selected.length})),
              )
            else
              IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: statuses.refresh),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(108),
            child: Column(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                child: SegmentedButton<String>(
                  segments: [
                    ButtonSegment(value: 'whatsapp', label: Text(context.tr('whatsapp'))),
                    ButtonSegment(value: 'business', label: Text(context.tr('business'))),
                  ],
                  selected: {statuses.app},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) {
                    setState(selected.clear);
                    statuses.switchApp(v.first);
                  },
                ),
              ),
              TabBar(
                dividerColor: Colors.transparent,
                tabs: [
                  Tab(text: '${context.tr('photos')} (${statuses.images.length})'),
                  Tab(text: '${context.tr('videos')} (${statuses.videos.length})'),
                ],
              ),
            ]),
          ),
        ),
        body: statuses.hasAccess == false
            ? _access(context, statuses)
            : statuses.loading && statuses.items.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(children: [
                    _grid(context, statuses, statuses.images),
                    _grid(context, statuses, statuses.videos),
                  ]),
      ),
    );
  }

  Widget _access(BuildContext context, Statuses statuses) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(shape: BoxShape.circle, color: _whatsappGreen.withValues(alpha: 0.15)),
            child: const FaIcon(FontAwesomeIcons.whatsapp, size: 44, color: _whatsappGreen),
          ),
          const SizedBox(height: 18),
          Text(context.tr('statusAccessTitle'), textAlign: TextAlign.center, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(context.tr('statusAccessBody'), textAlign: TextAlign.center, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.5)),
          if (statuses.error == 'wrongFolder') ...[
            const SizedBox(height: 12),
            Text(context.tr('wrongFolder'), textAlign: TextAlign.center, style: const TextStyle(color: Brand.red)),
          ],
          const SizedBox(height: 22),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: _whatsappGreen, foregroundColor: Colors.black, minimumSize: const Size(200, 52)),
            onPressed: statuses.requestAccess,
            icon: const Icon(Icons.folder_open_rounded),
            label: Text(context.tr('allow')),
          ),
        ]),
      ),
    );
  }

  Widget _grid(BuildContext context, Statuses statuses, List<StatusItem> items) {
    if (items.isEmpty) {
      final theme = Theme.of(context);
      return RefreshIndicator(
        onRefresh: statuses.refresh,
        child: ListView(padding: const EdgeInsets.all(32), children: [
          const SizedBox(height: 60),
          Icon(Icons.hourglass_empty_rounded, size: 52, color: theme.colorScheme.outline),
          const SizedBox(height: 12),
          Text(context.tr('noStatuses'), textAlign: TextAlign.center, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(context.tr('noStatusesHint'), textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
        ]),
      );
    }
    return RefreshIndicator(
      onRefresh: statuses.refresh,
      child: GridView.builder(
        padding: const EdgeInsets.all(10),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 6, crossAxisSpacing: 6, childAspectRatio: 0.66),
        itemCount: items.length,
        itemBuilder: (_, i) {
          final item = items[i];
          final isSelected = selected.contains(item.path);
          return GestureDetector(
            onTap: selected.isNotEmpty
                ? () => setState(() => isSelected ? selected.remove(item.path) : selected.add(item.path))
                : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StatusViewer(items: items, index: i))),
            onLongPress: () => setState(() => selected.add(item.path)),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Stack(fit: StackFit.expand, children: [
                if (item.video && item.thumb == null)
                  Container(color: Colors.black26)
                else
                  Image.file(File(item.video ? item.thumb! : item.path), fit: BoxFit.cover, cacheWidth: 360),
                if (item.video) const Center(child: CircleAvatar(radius: 16, backgroundColor: Colors.black54, child: Icon(Icons.play_arrow_rounded, color: Colors.white))),
                if (statuses.saved.contains(item.name))
                  const Positioned(top: 6, right: 6, child: CircleAvatar(radius: 11, backgroundColor: _whatsappGreen, child: Icon(Icons.check_rounded, size: 15, color: Colors.black))),
                if (isSelected)
                  Container(
                    decoration: BoxDecoration(color: Brand.blue.withValues(alpha: 0.35), border: Border.all(color: Brand.blue, width: 3), borderRadius: BorderRadius.circular(12)),
                    child: const Center(child: Icon(Icons.check_circle_rounded, color: Colors.white, size: 34)),
                  ),
              ]),
            ),
          );
        },
      ),
    );
  }
}

/// Full-screen swipeable viewer with save / share / repost / vault
class StatusViewer extends StatefulWidget {
  const StatusViewer({super.key, required this.items, required this.index});

  final List<StatusItem> items;
  final int index;

  @override
  State<StatusViewer> createState() => _StatusViewerState();
}

class _StatusViewerState extends State<StatusViewer> {
  late final pages = PageController(initialPage: widget.index);
  late int index = widget.index;

  StatusItem get item => widget.items[index];

  @override
  void dispose() {
    pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final statuses = context.watch<Statuses>();
    final saved = statuses.saved.contains(item.name);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, title: Text('${index + 1} / ${widget.items.length}')),
      body: PageView.builder(
        controller: pages,
        itemCount: widget.items.length,
        onPageChanged: (i) => setState(() => index = i),
        itemBuilder: (_, i) {
          final it = widget.items[i];
          return it.video ? _StatusVideo(key: ValueKey(it.path), path: it.path) : InteractiveViewer(child: Center(child: Image.file(File(it.path))));
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            _action(Icon(saved ? Icons.check_circle_rounded : Icons.download_rounded, color: saved ? _whatsappGreen : Colors.white), context.tr(saved ? 'saved' : 'save'), () async {
              final messenger = ScaffoldMessenger.of(context);
              final text = context.tr('savedTo');
              await statuses.save(item);
              messenger.showSnackBar(SnackBar(content: Text(text), duration: const Duration(seconds: 2)));
            }),
            _action(const Icon(Icons.share_rounded, color: Colors.white), context.tr('share'), () => SharePlus.instance.share(ShareParams(files: [XFile(item.path)]))),
            _action(const FaIcon(FontAwesomeIcons.whatsapp, color: _whatsappGreen), context.tr('repost'), () => SharePlus.instance.share(ShareParams(files: [XFile(item.path)]))),
            _action(const Icon(Icons.lock_rounded, color: Brand.violet), context.tr('vault'), () async {
              final messenger = ScaffoldMessenger.of(context);
              final text = context.tr('movedToVault');
              // A copy goes into the vault; the status itself stays in WhatsApp
              final copy = '${File(item.path).parent.path}/vault-${item.name}';
              await File(item.path).copy(copy);
              if (!context.mounted) return;
              await context.read<Vault>().add(copy, title: item.name);
              messenger.showSnackBar(SnackBar(content: Text(text), duration: const Duration(seconds: 2)));
            }),
          ]),
        ),
      ),
    );
  }

  Widget _action(Widget icon, String label, VoidCallback onTap) => InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            icon,
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
          ]),
        ),
      );
}

class _StatusVideo extends StatefulWidget {
  const _StatusVideo({super.key, required this.path});

  final String path;

  @override
  State<_StatusVideo> createState() => _StatusVideoState();
}

class _StatusVideoState extends State<_StatusVideo> {
  late final player = Player();
  late final controller = VideoController(player);

  @override
  void initState() {
    super.initState();
    player.open(Media(Uri.file(widget.path).toString()));
    player.setPlaylistMode(PlaylistMode.single);
  }

  @override
  void dispose() {
    player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Video(controller: controller, controls: MaterialVideoControls);
}
