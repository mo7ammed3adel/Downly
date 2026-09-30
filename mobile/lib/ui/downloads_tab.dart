import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/downloads.dart';
import '../core/errors.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/vault.dart';
import 'home_tab.dart' show MediaThumb;
import 'player_page.dart';
import 'theme.dart';

class DownloadsTab extends StatelessWidget {
  const DownloadsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final downloads = context.watch<Downloads>();
    final active = downloads.active;
    final finished = downloads.finished;
    return DefaultTabController(
      length: 2,
      child: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 8, 0),
            child: Row(children: [
              Text(context.tr('downloads'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              if (finished.isNotEmpty)
                IconButton(
                  tooltip: context.tr('clearFinished'),
                  icon: const Icon(Icons.cleaning_services_outlined),
                  onPressed: downloads.clearFinished,
                ),
            ]),
          ),
          TabBar(
            dividerColor: Colors.transparent,
            tabs: [
              Tab(text: '${context.tr('active')}${active.isEmpty ? '' : ' (${active.length})'}'),
              Tab(text: '${context.tr('finished')}${finished.isEmpty ? '' : ' (${finished.length})'}'),
            ],
          ),
          Expanded(
            child: TabBarView(children: [
              _list(context, active),
              _list(context, finished),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _list(BuildContext context, List<DownloadTask> tasks) {
    if (tasks.isEmpty) return const _Empty();
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: tasks.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) => TaskCard(task: tasks[i]),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(shape: BoxShape.circle, color: Brand.blue.withValues(alpha: 0.12)),
            child: const Icon(Icons.download_rounded, size: 40, color: Brand.blue),
          ),
          const SizedBox(height: 16),
          Text(context.tr('noDownloads'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(context.tr('noDownloadsHint'), textAlign: TextAlign.center, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ]),
      ),
    );
  }
}

class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.task});

  final DownloadTask task;

  String _status(BuildContext context) {
    final t = task;
    switch (t.status) {
      case TaskStatus.queued:
        return context.tr('queued');
      case TaskStatus.paused:
        return [context.tr('paused'), if (t.total != null) '${formatBytes(t.downloaded)} / ${formatBytes(t.total)}'].join(' · ');
      case TaskStatus.failed:
        final kind = classify(t.error ?? '');
        final site = siteName(t.url);
        return kind == ErrorKind.other ? (t.error ?? context.tr('failed')) : context.tr('err_${kind.name}_t', args: {'site': site});
      case TaskStatus.done:
        return [if (t.quality != null) t.quality!, formatBytes(t.total), if (t.site != null) t.site!].where((s) => s.isNotEmpty).join(' · ');
      case TaskStatus.running:
        if (t.phase != null) return context.tr(t.phase!);
        if (t.total == null && t.downloaded == 0) return context.tr('starting');
        return [
          if (t.total != null) '${formatBytes(t.downloaded)} / ${formatBytes(t.total)}' else formatBytes(t.downloaded),
          if (t.speed > 0) '${formatBytes(t.speed)}/s',
          if (t.eta != null && t.eta! > 0) '${formatDuration(Duration(seconds: t.eta!))} ${context.tr('left')}',
        ].join(' · ');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final downloads = context.read<Downloads>();
    final t = task;
    final done = t.status == TaskStatus.done;
    final failed = t.status == TaskStatus.failed;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: done && t.path != null && !t.private && t.kind != TaskKind.file ? () => PlayerPage.open(context, [t.path!], 0) : null,
        onLongPress: () => _menu(context),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 104,
                height: 62,
                child: Stack(fit: StackFit.expand, children: [
                  MediaThumb(url: t.thumbnail, kind: t.kind),
                  if (t.private) Container(color: Colors.black45, child: const Icon(Icons.lock_rounded, color: Colors.white)),
                  if (done && !t.private && t.kind != TaskKind.file)
                    const Center(child: CircleAvatar(radius: 14, backgroundColor: Colors.black54, child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 20))),
                ]),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, height: 1.25)),
                const SizedBox(height: 6),
                if (!done) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: t.status == TaskStatus.running && t.phase == null ? t.progress : (t.status == TaskStatus.running ? null : t.progress ?? 0),
                      minHeight: 5,
                      color: failed ? Brand.red : (t.status == TaskStatus.paused ? theme.colorScheme.outline : Brand.blue),
                      backgroundColor: theme.colorScheme.surfaceContainerHighest,
                    ),
                  ),
                  const SizedBox(height: 5),
                ],
                Text(
                  _status(context),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(color: failed ? Brand.red : theme.colorScheme.onSurfaceVariant),
                ),
              ]),
            ),
            if (t.status == TaskStatus.running || t.status == TaskStatus.queued)
              IconButton(tooltip: context.tr('pause'), icon: const Icon(Icons.pause_rounded), onPressed: () => downloads.pause(t))
            else if (t.status == TaskStatus.paused || failed)
              IconButton(tooltip: context.tr('resume'), icon: Icon(failed ? Icons.refresh_rounded : Icons.play_arrow_rounded), onPressed: () => downloads.resume(t))
            else
              IconButton(icon: const Icon(Icons.more_vert_rounded), onPressed: () => _menu(context)),
          ]),
        ),
      ),
    );
  }

  void _menu(BuildContext context) {
    final t = task;
    final downloads = context.read<Downloads>();
    final canShare = t.status == TaskStatus.done && t.path != null && !t.private;
    showModalBottomSheet(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (canShare && t.kind != TaskKind.file)
            ListTile(
              leading: const Icon(Icons.play_arrow_rounded),
              title: Text(context.tr('play')),
              onTap: () {
                Navigator.pop(sheet);
                PlayerPage.open(context, [t.path!], 0);
              },
            ),
          if (canShare)
            ListTile(
              leading: const Icon(Icons.share_rounded),
              title: Text(context.tr('share')),
              onTap: () {
                Navigator.pop(sheet);
                SharePlus.instance.share(ShareParams(files: [XFile(t.path!)]));
              },
            ),
          if (canShare)
            ListTile(
              leading: const Icon(Icons.lock_rounded, color: Brand.violet),
              title: Text(context.tr('moveToVault')),
              onTap: () async {
                Navigator.pop(sheet);
                final messenger = ScaffoldMessenger.of(context);
                final text = context.tr('movedToVault');
                await context.read<Vault>().add(t.path!, title: t.title, thumbnail: t.thumbnail);
                downloads.remove(t);
                messenger.showSnackBar(SnackBar(content: Text(text)));
              },
            ),
          ListTile(
            leading: const Icon(Icons.link_rounded),
            title: Text(context.tr('copyLink')),
            onTap: () {
              Navigator.pop(sheet);
              Clipboard.setData(ClipboardData(text: t.url));
            },
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline_rounded, color: Brand.red),
            title: Text(context.tr('delete')),
            onTap: () {
              Navigator.pop(sheet);
              _confirmDelete(context);
            },
          ),
        ]),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final t = task;
    var deleteFile = t.status != TaskStatus.done;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, setState) => AlertDialog(
          title: Text(context.tr('delete')),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.title, maxLines: 3, overflow: TextOverflow.ellipsis),
            if (t.path != null && !t.private)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: deleteFile,
                onChanged: (v) => setState(() => deleteFile = v!),
                title: Text(context.tr('deleteFile')),
              ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(context.tr('cancel'))),
            FilledButton(onPressed: () => Navigator.pop(dialog, true), child: Text(context.tr('delete'))),
          ],
        ),
      ),
    );
    if (ok == true && context.mounted) context.read<Downloads>().remove(t, deleteFile: deleteFile && !t.private);
  }
}
