import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:media_kit/media_kit.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'core/downloads.dart';
import 'core/engine.dart';
import 'core/library.dart';
import 'core/music.dart';
import 'core/settings.dart';
import 'core/statuses.dart';
import 'core/vault.dart';
import 'ui/shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  final settings = await Settings.load();
  final vault = await Vault.load();
  final library = Library();
  final downloads = await Downloads.load(settings, vault, library);
  music = await AudioService.init(
    builder: MusicHandler.new,
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'app.downly.mobile.music',
      androidNotificationChannelName: 'Music',
      androidNotificationIcon: 'drawable/ic_stat_music',
      androidNotificationOngoing: true,
    ),
  );
  // Unpack yt-dlp in the background right away, so the first link opens fast
  Engine.init().then((_) => Engine.autoUpdate()).catchError((_) {});

  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: settings),
      ChangeNotifierProvider.value(value: vault),
      ChangeNotifierProvider.value(value: library),
      ChangeNotifierProvider.value(value: downloads),
      ChangeNotifierProvider(create: (_) => MusicLibrary()),
      ChangeNotifierProvider(create: (_) => Statuses()),
    ],
    child: const DownlyApp(),
  ));

  // Notifications (Android 13+) and storage (Android 9 and older)
  await [Permission.notification, Permission.storage].request();
  library.refresh();
}

class DownlyApp extends StatelessWidget {
  const DownlyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<Settings>();
    final lang = settings.languageCode(context);
    return MaterialApp(
      title: 'Downly',
      debugShowCheckedModeBanner: false,
      themeMode: settings.themeMode,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      locale: Locale(lang),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      // Rebuild everything when the language changes (strings read without listening)
      home: KeyedSubtree(key: ValueKey(lang), child: Shell(key: Shell.globalKey)),
    );
  }
}
