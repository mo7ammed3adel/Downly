# Builds the Android APKs into mobile/dist.
#
# Flutter, Gradle and CMake can't build from a folder whose path has non-English characters on
# Windows, so the project is mirrored into an English-only folder and built there.
#
#   pwsh mobile/tool/build.ps1                 # release, one APK per CPU type
#   pwsh mobile/tool/build.ps1 -Mode debug     # debug APK
#   pwsh mobile/tool/build.ps1 -Install        # also installs the matching APK on the connected phone
#   pwsh mobile/tool/build.ps1 -WorkDir E:\build\downly   # another English-only folder with free space
param(
    [ValidateSet('release', 'debug')] [string] $Mode = 'release',
    [string] $WorkDir = 'D:\dev\downly-mobile',
    [switch] $Install
)
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent

# Mirror the sources (build outputs and caches stay in the work folder)
robocopy $source $WorkDir /MIR /XD build dist .dart_tool .gradle .idea /XF local.properties /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

Push-Location $WorkDir
try {
    flutter pub get | Out-Null
    if ($Mode -eq 'release') {
        flutter build apk --release --split-per-abi --target-platform android-arm,android-arm64,android-x64
    } else {
        flutter build apk --debug
    }
    if ($LASTEXITCODE -ne 0) { throw 'flutter build failed' }
} finally {
    Pop-Location
}

$dist = Join-Path $source 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$version = (Select-String -Path (Join-Path $source 'pubspec.yaml') -Pattern '^version:\s*([\d.]+)').Matches[0].Groups[1].Value
foreach ($apk in Get-ChildItem "$WorkDir\build\app\outputs\flutter-apk\*.apk") {
    $abi = if ($apk.Name -match 'app-(.+)-release\.apk') { $Matches[1] } elseif ($apk.Name -match 'debug') { 'debug' } else { 'universal' }
    Copy-Item $apk.FullName (Join-Path $dist "Downly-$version-$abi.apk") -Force
}
Get-ChildItem $dist | Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } } | Format-Table -AutoSize

if ($Install) {
    $deviceAbi = (adb shell getprop ro.product.cpu.abi).Trim()
    $apk = Get-ChildItem $dist "Downly-$version-$(if ($Mode -eq 'debug') { 'debug' } else { $deviceAbi }).apk"
    adb install -r $apk.FullName
}
