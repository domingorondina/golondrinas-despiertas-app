// Alarm Engine & Scheduler for Golondrinas Despiertas

let activeAlarms = [];
let alarmCheckInterval = null;
let wakeLockObj = null;
let onAlarmTriggerCallback = null;
let firedAlarmKeysThisMinute = new Set();
let wakeUpCheckTimeout = null;
let silentAudioElement = null;
let audioKeeperStarted = false;

export function initAlarmEngine(alarms, onTrigger) {
  activeAlarms = alarms;
  onAlarmTriggerCallback = onTrigger;
  
  if (alarmCheckInterval) clearInterval(alarmCheckInterval);
  
  // Check every 500ms for exact minute matching and zero missed ticks
  alarmCheckInterval = setInterval(checkAlarms, 500);

  // Catch-up check when device wakes up or tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAlarms();
      keepSilentAudioAlive();
    }
  });

  window.addEventListener('focus', () => {
    checkAlarms();
    keepSilentAudioAlive();
  });

  setupSilentAudioKeeper();
  requestNotificationPermission();

  // Try to acquire wake lock if active alarms exist
  refreshWakeLockState();
}

export function updateEngineAlarms(alarms) {
  activeAlarms = alarms;
  keepSilentAudioAlive();
  refreshWakeLockState();
}

function normalizeTimeStr(t) {
  if (!t) return '';
  const parts = t.split(':');
  if (parts.length < 2) return t;
  const h = String(parts[0]).padStart(2, '0');
  const m = String(parts[1]).padStart(2, '0');
  return `${h}:${m}`;
}

function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function checkAlarms() {
  const now = new Date();
  const todayDateStr = getLocalDateStr(now);
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const mappedDay = currentDay === 0 ? 7 : currentDay; // 1 = Mon ... 7 = Sun

  activeAlarms.forEach(alarm => {
    if (!alarm.active) return;
    
    const alarmTimeNormalized = normalizeTimeStr(alarm.time);
    if (!alarmTimeNormalized) return;

    const parts = alarmTimeNormalized.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;

    const alarmDateToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parts[0], parts[1], 0, 0);
    
    // Difference in milliseconds between now and the alarm time today
    const diffMs = now.getTime() - alarmDateToday.getTime();

    // Trigger if within the exact minute or if the screen was turned on within 30 min of the alarm time
    if (diffMs < 0 || diffMs > 1800000) return;

    // Unique key per alarm, date and time: e.g. "alarm_1_2026-08-25_19:00"
    const fireKey = `${alarm.id}_${todayDateStr}_${alarmTimeNormalized}`;
    if (firedAlarmKeysThisMinute.has(fireKey)) return;

    // Check repeat days or date
    let shouldFire = false;

    if (alarm.repeatDays && alarm.repeatDays.length > 0) {
      if (alarm.repeatDays.includes(mappedDay)) {
        shouldFire = true;
      }
    } else if (alarm.date) {
      if (alarm.date === todayDateStr) {
        shouldFire = true;
      }
    } else {
      // Once-off alarm (no days selected, no date set) -> fires today
      shouldFire = true;
    }

    if (shouldFire) {
      firedAlarmKeysThisMinute.add(fireKey);
      fireAlarm(alarm);
    }
  });

  // Clean old keys older than current day to prevent memory leak
  if (firedAlarmKeysThisMinute.size > 100) {
    firedAlarmKeysThisMinute.clear();
  }
}

function fireAlarm(alarm) {
  requestWakeLock();
  triggerVibration(alarm.vibrate);
  showSystemNotification(alarm);

  if (onAlarmTriggerCallback) {
    onAlarmTriggerCallback(alarm);
  }
}

// Request Web Screen Wake Lock
export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      if (!wakeLockObj) {
        wakeLockObj = await navigator.wakeLock.request('screen');
        wakeLockObj.addEventListener('release', () => {
          wakeLockObj = null;
        });
      }
    } catch (err) {
      console.warn('Wake Lock error:', err);
    }
  }
}

export function refreshWakeLockState() {
  const hasActiveAlarms = activeAlarms.some(a => a.active);
  if (hasActiveAlarms) {
    requestWakeLock();
  }
}

export function releaseWakeLock() {
  if (wakeLockObj) {
    wakeLockObj.release().catch(() => {});
    wakeLockObj = null;
  }
}

// Trigger device vibration
export function triggerVibration(enabled = true) {
  if (enabled && 'vibrate' in navigator) {
    navigator.vibrate([800, 400, 800, 400, 1200]);
  }
}

export function stopVibration() {
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

// System Notification API for lock screen popup
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function showSystemNotification(alarm) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const title = `⏰ ¡Alarma: ${alarm.label || 'Golondrinas Despiertas'}!`;
      const options = {
        body: alarm.vocalMsg || `Son las ${alarm.time}. ¡Es hora de despertar!`,
        icon: 'manifest.webmanifest',
        tag: 'golondrinas-alarm',
        renotify: true,
        requireInteraction: true
      };

      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }
}

// Silent Audio Keeper to prevent Android Doze Mode timer suspension
function generateSilentWavDataUri(seconds = 5) {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < dataSize; i++) {
    view.setUint8(44 + i, 128); // 8-bit PCM center (silence)
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

function setupSilentAudioKeeper() {
  // En app nativa con AlarmManager no se requiere audio continuo que secuestre el foco de Spotify
}

export function unlockAudioKeeper() {
  // Operación no-op para proteger la reproducción de música externa
}

export function keepSilentAudioAlive() {
  // Operación no-op para no pausar Spotify ni otras apps multimedia
}

// Schedule Snooze
export function scheduleSnooze(alarm, snoozeMins = 5) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + snoozeMins);
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');

  const snoozedAlarm = {
    ...alarm,
    id: 'snooze_' + Date.now(),
    time: `${hours}:${mins}`,
    active: true,
    repeatDays: [],
    date: now.toISOString().split('T')[0]
  };

  activeAlarms.push(snoozedAlarm);
  return snoozedAlarm;
}

// Schedule Wake-up Check
export function scheduleWakeUpCheck(alarm, onWakeUpCheckTrigger) {
  if (wakeUpCheckTimeout) clearTimeout(wakeUpCheckTimeout);

  wakeUpCheckTimeout = setTimeout(() => {
    if (onWakeUpCheckTrigger) {
      onWakeUpCheckTrigger(alarm);
    }
  }, 5 * 60 * 1000);
}

// --- NATIVE ANDROID ALARMMANAGER / CAPACITOR LOCAL NOTIFICATIONS BRIDGE ---
function getCapacitorNotifications() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    return window.Capacitor.Plugins.LocalNotifications;
  }
  return null;
}

export async function requestNativeAlarmPermissions() {
  const ln = getCapacitorNotifications();
  if (ln) {
    try {
      const status = await ln.checkPermissions();
      if (status.display !== 'granted') {
        await ln.requestPermissions();
      }
      if (ln.createChannel) {
        await ln.createChannel({
          id: 'alarm_channel_high_v2',
          name: 'Alarmas Golondrinas Despiertas',
          description: 'Canal de máxima prioridad para despertar el teléfono',
          importance: 5,
          visibility: 1,
          vibration: true
        });
      }

      // Escuchar cuando el sistema dispara la notificación o el usuario la toca para activar la alarma
      ln.addListener('localNotificationReceived', (notification) => {
        console.log('Notificación de alarma recibida en primer plano:', notification);
        const alarmId = notification.extra ? notification.extra.alarmId : null;
        const matchingAlarm = activeAlarms.find(a => a.id === alarmId);
        if (matchingAlarm && onAlarmTriggerCallback) {
          onAlarmTriggerCallback(matchingAlarm);
        }
      });

      ln.addListener('localNotificationActionPerformed', (action) => {
        console.log('Notificación de alarma accionada / abierta:', action);
        const alarmId = action.notification && action.notification.extra ? action.notification.extra.alarmId : null;
        const matchingAlarm = activeAlarms.find(a => a.id === alarmId);
        if (matchingAlarm && onAlarmTriggerCallback) {
          onAlarmTriggerCallback(matchingAlarm);
        }
      });
    } catch (e) {
      console.warn('Native permissions error:', e);
    }
  }
}

export async function syncNativeAlarms(alarms) {
  const ln = getCapacitorNotifications();
  if (!ln) return;

  try {
    const pending = await ln.getPending();
    if (pending && pending.notifications && pending.notifications.length > 0) {
      await ln.cancel({ notifications: pending.notifications });
    }

    const now = new Date();
    const currentDay = now.getDay();
    const mappedDay = currentDay === 0 ? 7 : currentDay;
    const currentMinutesToday = now.getHours() * 60 + now.getMinutes();

    const notificationsToSchedule = [];
    let counterId = 100;

    alarms.filter(a => a.active).forEach(alarm => {
      const timeParts = (alarm.time || '07:30').split(':').map(Number);
      const alarmMins = timeParts[0] * 60 + timeParts[1];
      const days = (alarm.repeatDays && alarm.repeatDays.length > 0) ? alarm.repeatDays : [mappedDay];

      days.forEach(day => {
        let offset = (day - mappedDay + 7) % 7;
        if (offset === 0 && alarmMins <= currentMinutesToday) {
          offset = 7;
        }

        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, timeParts[0], timeParts[1], 0, 0);

        counterId++;
        notificationsToSchedule.push({
          id: counterId,
          title: 'Alarma: ' + (alarm.label || 'Golondrinas Despiertas'),
          body: alarm.vocalMsg || ('Son las ' + alarm.time + '. Hora de despertar.'),
          schedule: {
            at: targetDate,
            allowWhileIdle: true,
            repeats: alarm.repeatDays && alarm.repeatDays.length > 0
          },
          channelId: 'alarm_channel_high_v2',
          ongoing: true,
          autoCancel: false,
          extra: { alarmId: alarm.id, time: alarm.time }
        });
      });
    });

    if (notificationsToSchedule.length > 0) {
      await ln.schedule({ notifications: notificationsToSchedule });
      console.log(notificationsToSchedule.length + ' alarmas programadas en Android AlarmManager.');
    }
  } catch (err) {
    console.warn('Error sincronizando alarmas nativas:', err);
  }
}
