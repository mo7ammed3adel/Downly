/// yt-dlp options for each kind of download.
library;

const _template = '%(title).150B.%(ext)s';

List<String> videoArgs({required String dir, required int height, bool subtitles = false, String? cookies}) => [
      '--no-playlist',
      '-f',
      height > 0 ? 'bv*[height<=$height]+ba/b[height<=$height]/bv*+ba/b' : 'bv*+ba/b',
      // Highest resolution first, then H.264/AAC so every phone player can open the file
      '-S', 'res,vcodec:h264,acodec:m4a',
      '--merge-output-format', 'mp4',
      '--embed-thumbnail',
      '--embed-metadata',
      if (subtitles) ...['--embed-subs', '--sub-langs', 'ar,en.*'],
      '-N', '4',
      '--no-mtime',
      if (cookies != null) ...['--cookies', cookies],
      '-o', '$dir/$_template',
    ];

List<String> audioArgs({required String dir, required String format, String? cookies}) => [
      '--no-playlist',
      '-f', 'ba/b',
      '-x',
      '--audio-format', format,
      '--audio-quality', '0',
      '--embed-thumbnail',
      '--embed-metadata',
      '-N', '4',
      '--no-mtime',
      if (cookies != null) ...['--cookies', cookies],
      '-o', '$dir/$_template',
    ];
