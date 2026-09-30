import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'engine.dart';
import 'library.dart';

class VaultItem {
  VaultItem({required this.path, required this.title, this.thumbnail, DateTime? addedAt}) : addedAt = addedAt ?? DateTime.now();

  final String path;
  final String title;
  final String? thumbnail;
  final DateTime addedAt;

  MediaType get type => mediaTypeOf(path);

  Map<String, dynamic> toJson() => {'path': path, 'title': title, 'thumbnail': thumbnail, 'addedAt': addedAt.toIso8601String()};

  factory VaultItem.fromJson(Map<String, dynamic> j) => VaultItem(
        path: j['path'] as String,
        title: j['title'] as String,
        thumbnail: j['thumbnail'] as String?,
        addedAt: DateTime.tryParse(j['addedAt'] as String? ?? ''),
      );
}

/// Private files in the app's own storage (invisible to the gallery and other apps),
/// behind a PIN and optionally the fingerprint.
class Vault extends ChangeNotifier {
  Vault._(this._prefs, this.dir);

  final SharedPreferences _prefs;
  final String dir;
  final _auth = LocalAuthentication();
  List<VaultItem> items = [];
  bool unlocked = false;

  static Future<Vault> load() async {
    final base = await getApplicationSupportDirectory();
    final vault = Vault._(await SharedPreferences.getInstance(), '${base.path}/vault');
    await Directory(vault.dir).create(recursive: true);
    final index = File('${vault.dir}/.index.json');
    if (await index.exists()) {
      final list = jsonDecode(await index.readAsString()) as List;
      vault.items = list.map((e) => VaultItem.fromJson(e as Map<String, dynamic>)).where((i) => File(i.path).existsSync()).toList();
    }
    return vault;
  }

  Future<void> _save() async {
    await File('$dir/.index.json').writeAsString(jsonEncode(items.map((i) => i.toJson()).toList()));
    notifyListeners();
  }

  bool get hasPin => _prefs.getString('vaultPin') != null;

  bool get biometricEnabled => _prefs.getBool('vaultBiometric') ?? true;
  set biometricEnabled(bool v) {
    _prefs.setBool('vaultBiometric', v);
    notifyListeners();
  }

  String _hash(String pin, String salt) => sha256.convert(utf8.encode('$salt:$pin')).toString();

  Future<void> setPin(String pin) async {
    final salt = base64Url.encode(List.generate(16, (_) => Random.secure().nextInt(256)));
    await _prefs.setString('vaultSalt', salt);
    await _prefs.setString('vaultPin', _hash(pin, salt));
    unlocked = true;
    notifyListeners();
  }

  /// Forgets the PIN (the files stay); the lock screen then asks for a new one
  Future<void> resetPin() async {
    await _prefs.remove('vaultPin');
    unlocked = false;
    notifyListeners();
  }

  bool checkPin(String pin) {
    final ok = _hash(pin, _prefs.getString('vaultSalt') ?? '') == _prefs.getString('vaultPin');
    if (ok) {
      unlocked = true;
      notifyListeners();
    }
    return ok;
  }

  Future<bool> canUseBiometrics() async {
    try {
      return biometricEnabled && await _auth.isDeviceSupported() && (await _auth.getAvailableBiometrics()).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<bool> unlockWithBiometrics(String reason) async {
    try {
      final ok = await _auth.authenticate(localizedReason: reason, biometricOnly: true);
      if (ok) {
        unlocked = true;
        notifyListeners();
      }
      return ok;
    } catch (_) {
      return false;
    }
  }

  void lock() {
    if (!unlocked) return;
    unlocked = false;
    notifyListeners();
  }

  /// Moves a file into the vault (it disappears from the gallery)
  Future<void> add(String path, {required String title, String? thumbnail}) async {
    final name = path.split('/').last;
    var target = '$dir/$name';
    for (var n = 1; await File(target).exists(); n++) {
      target = '$dir/$n-$name';
    }
    if (path != target) await Engine.move(path, target);
    items.insert(0, VaultItem(path: target, title: title, thumbnail: thumbnail));
    await _save();
  }

  /// A file yt-dlp already saved inside the vault folder
  Future<void> adopt(String path, {required String title, String? thumbnail}) async {
    items.insert(0, VaultItem(path: path, title: title, thumbnail: thumbnail));
    await _save();
  }

  Future<void> restore(VaultItem item) async {
    final folder = await Library.folderFor(item.type);
    final name = item.path.split('/').last;
    await Engine.move(item.path, '$folder/$name');
    items.remove(item);
    await _save();
  }

  Future<void> remove(VaultItem item) async {
    await File(item.path).delete().catchError((_) => File(item.path));
    items.remove(item);
    await _save();
  }
}
