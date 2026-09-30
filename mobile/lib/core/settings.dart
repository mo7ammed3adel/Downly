import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// User preferences, saved on the device.
class Settings extends ChangeNotifier {
  Settings(this._prefs);

  final SharedPreferences _prefs;

  static Future<Settings> load() async => Settings(await SharedPreferences.getInstance());

  /// 'ar', 'en' or 'system'
  String get language => _prefs.getString('language') ?? 'system';
  set language(String v) => _set('language', v);

  String languageCode(BuildContext context) {
    if (language != 'system') return language;
    return WidgetsBinding.instance.platformDispatcher.locale.languageCode == 'ar' ? 'ar' : 'en';
  }

  ThemeMode get themeMode => ThemeMode.values.byName(_prefs.getString('theme') ?? 'dark');
  set themeMode(ThemeMode v) => _set('theme', v.name);

  /// Preselected height in the download sheet; 0 = best available
  int get videoQuality => _prefs.getInt('quality') ?? 720;
  set videoQuality(int v) => _set('quality', v);

  /// 'mp3' or 'm4a'
  String get audioFormat => _prefs.getString('audioFormat') ?? 'mp3';
  set audioFormat(String v) => _set('audioFormat', v);

  int get parallel => _prefs.getInt('parallel') ?? 2;
  set parallel(int v) => _set('parallel', v);

  bool get watchClipboard => _prefs.getBool('clipboard') ?? true;
  set watchClipboard(bool v) => _set('clipboard', v);

  bool get subtitles => _prefs.getBool('subtitles') ?? false;
  set subtitles(bool v) => _set('subtitles', v);

  bool get desktopMode => _prefs.getBool('desktopMode') ?? false;
  set desktopMode(bool v) => _set('desktopMode', v);

  int get lastClipStamp => _prefs.getInt('lastClipStamp') ?? 0;
  set lastClipStamp(int v) => _prefs.setInt('lastClipStamp', v);

  String? get lastClipboard => _prefs.getString('lastClipboard');
  set lastClipboard(String? v) => v == null ? _prefs.remove('lastClipboard') : _prefs.setString('lastClipboard', v);

  void _set(String key, Object value) {
    switch (value) {
      case String v:
        _prefs.setString(key, v);
      case int v:
        _prefs.setInt(key, v);
      case bool v:
        _prefs.setBool(key, v);
    }
    notifyListeners();
  }
}
