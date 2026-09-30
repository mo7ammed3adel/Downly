import 'dart:io';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:path_provider/path_provider.dart';

/// Hands the in-app browser's login (Instagram, Facebook…) to yt-dlp as a cookies.txt file.
/// YouTube is skipped: its web cookies often make yt-dlp fail instead of helping.
Future<String?> cookiesFileFor(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty) return null;
  if (RegExp(r'(^|\.)(youtube\.com|youtu\.be)$').hasMatch(uri.host)) return null;
  final cookies = await CookieManager.instance().getCookies(url: WebUri(url));
  if (cookies.isEmpty) return null;

  // Android only reports name=value, so the cookies are scoped to the site's main domain
  final domain = '.${uri.host.replaceFirst(RegExp(r'^(www|m|mobile|web)\.'), '')}';
  final expires = DateTime.now().add(const Duration(days: 365)).millisecondsSinceEpoch ~/ 1000;
  final lines = [
    '# Netscape HTTP Cookie File',
    for (final c in cookies) '$domain\tTRUE\t/\tTRUE\t$expires\t${c.name}\t${c.value}',
  ];
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/cookies-${uri.host}.txt');
  await file.writeAsString('${lines.join('\n')}\n');
  return file.path;
}

/// Cookie header for plain file downloads started in the browser
Future<String?> cookieHeaderFor(String url) async {
  final cookies = await CookieManager.instance().getCookies(url: WebUri(url));
  if (cookies.isEmpty) return null;
  return cookies.map((c) => '${c.name}=${c.value}').join('; ');
}
