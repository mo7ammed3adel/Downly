import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/library.dart';
import '../core/models.dart';
import '../core/vault.dart';
import 'home_tab.dart' show MediaThumb;
import 'player_page.dart';
import 'theme.dart';

class VaultPage extends StatefulWidget {
  const VaultPage({super.key});

  static void open(BuildContext context) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VaultPage()));

  @override
  State<VaultPage> createState() => _VaultPageState();
}

class _VaultPageState extends State<VaultPage> {
  @override
  void initState() {
    super.initState();
    // No screenshots or recent-apps preview while the vault is open
    Engine.secure(true);
  }

  @override
  void dispose() {
    Engine.secure(false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final vault = context.watch<Vault>();
    if (!vault.unlocked) return const _LockScreen();
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [const Icon(Icons.lock_open_rounded, color: Brand.violet), const SizedBox(width: 10), Text(context.tr('vault'))]),
        actions: [
          IconButton(
            tooltip: context.tr('lock'),
            icon: const Icon(Icons.lock_rounded),
            onPressed: () {
              vault.lock();
              Navigator.pop(context);
            },
          ),
        ],
      ),
      body: vault.items.isEmpty ? _empty(context) : _grid(context, vault),
    );
  }

  Widget _empty(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.shield_moon_outlined, size: 64, color: Brand.violet),
          const SizedBox(height: 16),
          Text(context.tr('vaultEmpty'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(context.tr('vaultEmptyHint'), textAlign: TextAlign.center, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ]),
      ),
    );
  }

  Widget _grid(BuildContext context, Vault vault) {
    final playable = vault.items.where((i) => i.type != MediaType.file).toList();
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 12, childAspectRatio: 1.05),
      itemCount: vault.items.length,
      itemBuilder: (_, i) {
        final item = vault.items[i];
        return InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: item.type == MediaType.file
              ? () => _menu(context, vault, item)
              : () => PlayerPage.open(context, playable.map((p) => p.path).toList(), playable.indexOf(item), secure: true),
          onLongPress: () => _menu(context, vault, item),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: AspectRatio(
                aspectRatio: 16 / 10,
                child: MediaThumb(
                  url: item.thumbnail,
                  kind: switch (item.type) {
                    MediaType.video => TaskKind.video,
                    MediaType.audio => TaskKind.audio,
                    MediaType.file => TaskKind.file,
                  },
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
          ]),
        );
      },
    );
  }

  void _menu(BuildContext context, Vault vault, VaultItem item) {
    showModalBottomSheet(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis)),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(context.tr('restore')),
            onTap: () async {
              Navigator.pop(sheet);
              final messenger = ScaffoldMessenger.of(context);
              final text = context.tr('restored');
              final library = context.read<Library>();
              await vault.restore(item);
              library.refresh();
              messenger.showSnackBar(SnackBar(content: Text(text)));
            },
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline_rounded, color: Brand.red),
            title: Text(context.tr('delete')),
            onTap: () {
              Navigator.pop(sheet);
              vault.remove(item);
            },
          ),
        ]),
      ),
    );
  }
}

/// PIN pad; creates the PIN the first time, then unlocks (or the fingerprint does)
class _LockScreen extends StatefulWidget {
  const _LockScreen();

  @override
  State<_LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<_LockScreen> {
  String pin = '';
  String? first;
  String? message;
  bool biometrics = false;

  @override
  void initState() {
    super.initState();
    final vault = context.read<Vault>();
    if (vault.hasPin) {
      vault.canUseBiometrics().then((ok) {
        if (!mounted) return;
        setState(() => biometrics = ok);
        if (ok) _fingerprint();
      });
    }
  }

  Future<void> _fingerprint() => context.read<Vault>().unlockWithBiometrics(context.tr('unlockVault'));

  void _press(String digit) {
    if (pin.length >= 4) return;
    HapticFeedback.selectionClick();
    setState(() {
      pin += digit;
      message = null;
    });
    if (pin.length == 4) Future.delayed(const Duration(milliseconds: 120), _submit);
  }

  void _submit() {
    final vault = context.read<Vault>();
    if (!vault.hasPin) {
      if (first == null) {
        setState(() {
          first = pin;
          pin = '';
        });
      } else if (first == pin) {
        vault.setPin(pin);
      } else {
        HapticFeedback.heavyImpact();
        setState(() {
          first = null;
          pin = '';
          message = context.tr('pinMismatch');
        });
      }
      return;
    }
    if (!vault.checkPin(pin)) {
      HapticFeedback.heavyImpact();
      setState(() {
        pin = '';
        message = context.tr('wrongPin');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final vault = context.read<Vault>();
    final theme = Theme.of(context);
    final title = !vault.hasPin ? (first == null ? context.tr('createPin') : context.tr('confirmPin')) : context.tr('enterPin');
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Column(children: [
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: Brand.gradient),
            child: const Icon(Icons.lock_rounded, color: Colors.white, size: 34),
          ),
          const SizedBox(height: 18),
          Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 18),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < 4; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                margin: const EdgeInsets.symmetric(horizontal: 9),
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < pin.length ? Brand.blue : Colors.transparent,
                  border: Border.all(color: i < pin.length ? Brand.blue : theme.colorScheme.outline, width: 2),
                ),
              ),
          ]),
          SizedBox(height: 28, child: Center(child: Text(message ?? '', style: const TextStyle(color: Brand.red)))),
          const Spacer(),
          Directionality(
            textDirection: TextDirection.ltr,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                mainAxisSpacing: 14,
                crossAxisSpacing: 24,
                childAspectRatio: 1.35,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (final d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']) _key(context, Text(d, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600)), () => _press(d)),
                  biometrics ? _key(context, const Icon(Icons.fingerprint_rounded, size: 32, color: Brand.blue), _fingerprint) : const SizedBox(),
                  _key(context, const Text('0', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600)), () => _press('0')),
                  _key(context, const Icon(Icons.backspace_outlined), () {
                    if (pin.isNotEmpty) setState(() => pin = pin.substring(0, pin.length - 1));
                  }),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),
        ]),
      ),
    );
  }

  Widget _key(BuildContext context, Widget child, VoidCallback onTap) => Material(
        color: Theme.of(context).colorScheme.surfaceContainer,
        shape: const StadiumBorder(),
        child: InkWell(customBorder: const StadiumBorder(), onTap: onTap, child: Center(child: child)),
      );
}
