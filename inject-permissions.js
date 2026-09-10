const fs = require('fs');
const p = './android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(p, 'utf8');

const perms = [
  '    <uses-permission android:name=\ android.permission.SCHEDULE_EXACT_ALARM\ />',
  '    <uses-permission android:name=\android.permission.USE_EXACT_ALARM\ />',
  '    <uses-permission android:name=\android.permission.WAKE_LOCK\ />',
  '    <uses-permission android:name=\android.permission.VIBRATE\ />',
  '    <uses-permission android:name=\android.permission.POST_NOTIFICATIONS\ />',
  '    <uses-permission android:name=\android.permission.USE_FULL_SCREEN_INTENT\ />',
  '    <uses-permission android:name=\android.permission.FOREGROUND_SERVICE\ />',
  '    <uses-permission android:name=\android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK\ />'
].join('\n');

m = m.replace('<application', perms + '\n    <application');
m = m.replace('<activity', '<activity android:showWhenLocked=\true\ android:turnScreenOn=\true\ android:keepScreenOn=\true\');

fs.writeFileSync(p, m, 'utf8');
console.log('Permisos nativos inyectados con éxito en AndroidManifest.xml');
