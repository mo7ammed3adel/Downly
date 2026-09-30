/// Turns yt-dlp's English errors into something a person can act on.
library;

enum ErrorKind { login, outdated, unsupported, network, unavailable, other }

ErrorKind classify(String raw) {
  final e = raw.toLowerCase();
  if (e.contains('login required') ||
      e.contains('log in') ||
      e.contains('sign in to view') ||
      e.contains('cookies-from-browser') ||
      e.contains('private') ||
      e.contains('rate-limit')) {
    return ErrorKind.login;
  }
  // YouTube changes often; an old engine gets 403s or fails to read the page
  if (e.contains('403') ||
      e.contains('forbidden') ||
      e.contains('unable to extract') ||
      e.contains('nsig') ||
      e.contains('signature') ||
      e.contains('please report this issue') ||
      e.contains('sign in to confirm')) {
    return ErrorKind.outdated;
  }
  if (e.contains('unsupported url') || e.contains('no video formats') || e.contains('no suitable')) return ErrorKind.unsupported;
  if (e.contains('unable to download webpage') ||
      e.contains('timed out') ||
      e.contains('failed to resolve') ||
      e.contains('network is unreachable') ||
      e.contains('connection') ||
      e.contains('socketexception')) {
    return ErrorKind.network;
  }
  if (e.contains('not available') || e.contains('removed') || e.contains('does not exist') || e.contains('404')) return ErrorKind.unavailable;
  return ErrorKind.other;
}

/// The login page for sites that hide videos behind an account
String loginUrlFor(String url) {
  final host = Uri.tryParse(url)?.host ?? '';
  if (host.contains('instagram')) return 'https://www.instagram.com/accounts/login/';
  if (host.contains('facebook') || host.contains('fb.watch')) return 'https://m.facebook.com/login/';
  if (host.contains('tiktok')) return 'https://www.tiktok.com/login';
  if (host.contains('x.com') || host.contains('twitter')) return 'https://x.com/i/flow/login';
  if (host.contains('snapchat')) return 'https://accounts.snapchat.com/';
  return host.isEmpty ? url : 'https://$host';
}

String siteName(String url) {
  final host = (Uri.tryParse(url)?.host ?? '').replaceFirst(RegExp(r'^(www|m|mobile|web)\.'), '');
  if (host.isEmpty) return '';
  final name = host.split('.').first;
  if (name == 'x' || name == 'twitter') return 'X';
  if (name == 'fb') return 'Facebook';
  return name[0].toUpperCase() + name.substring(1);
}
