const fs = require('fs');
const p = './android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(p, 'utf8');

const perms
  = '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n' +
     '    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />\n' +
     '    <uses-permission android:name="android.permission.WAKE_LOCK" />\n' +
     '    <uses-permission android:name="android.permission.VIBRATE" />\n' +
     '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n' +
     '    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />\n' +
     '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n' +
     '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />\n' +
     '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />\n' +
     '    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />\n';


m = m.replace('<application', perms + '\n    <application');
m = m.replace('<activity', '<activity android:showWhenLocked="true" android:turnScreenOn="true" android:keepScreenOn="true" android:showForAllUsers="true"');

fs.writeFileSync(p, m, 'utf8');
console.log('Permisos nativos (SYSTEM_ALERT_WINDOW) inyectados exitosamente.');
