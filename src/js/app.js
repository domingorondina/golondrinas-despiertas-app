// Main Application Controller for Golondrinas Despiertas

import { initStorage, getSavedAlarms, saveAlarms } from './storage.js';
import { initTTS } from './tts.js';
import { initAlarmEngine, updateEngineAlarms, scheduleSnooze } from './alarmEngine.js';
import { initUI, renderAlarmList, triggerRingingScreen, openEditor } from './ui.js';

let currentAlarms = [];
let deferredPrompt = null;

// Capture PWA Install Prompt for Mobile Devices
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const isDismissed = localStorage.getItem('pwa_install_dismissed');
  const banner = document.getElementById('installPwaBanner');
  if (!isDismissed && banner) {
    banner.classList.remove('hidden');
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  // Setup PWA Install Banner Actions
  const banner = document.getElementById('installPwaBanner');
  const btnDoInstall = document.getElementById('btnDoInstall');
  const btnDismissInstall = document.getElementById('btnDismissInstall');

  // Check if standalone PWA or show prompt on first visit
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isStandalone && !localStorage.getItem('pwa_install_dismissed') && banner) {
    banner.classList.remove('hidden');
  }

  if (btnDoInstall) {
    btnDoInstall.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install: ${outcome}`);
        deferredPrompt = null;
        if (banner) banner.classList.add('hidden');
      } else {
        alert("Para instalar en tu teléfono:\n\n• En Android (Chrome): Toca los 3 puntos (⋮) y selecciona 'Agregar a la pantalla principal'.\n• En iPhone (Safari): Toca el botón Compartir (⎋) y selecciona 'Agregar a la pantalla de inicio'.");
      }
    });
  }

  if (btnDismissInstall) {
    btnDismissInstall.addEventListener('click', () => {
      if (banner) banner.classList.add('hidden');
      localStorage.setItem('pwa_install_dismissed', 'true');
    });
  }

  // 1. Register Service Worker for PWA Offline support
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('PWA Service Worker registered successfully.');
    } catch (e) {
      console.warn('Service Worker registration failed:', e);
    }
  }

  // 2. Initialize IndexedDB
  await initStorage();

  // 3. Load Saved Alarms & Normalize Time Format (e.g. '7:00' -> '07:00')
  const rawAlarms = getSavedAlarms();
  currentAlarms = rawAlarms.map(a => ({
    ...a,
    time: a.time ? (a.time.length === 4 && a.time.includes(':') ? '0' + a.time : a.time) : '07:30'
  }));

  // 4. Initialize Web Speech API TTS
  initTTS();

  // 5. Initialize UI
  await initUI({
    alarms: currentAlarms,
    onSaveAlarm: handleSaveAlarm,
    onDeleteAlarm: handleDeleteAlarm,
    onToggleAlarm: handleToggleAlarm
  });

  // 6. Initialize Alarm Engine Scheduler
  initAlarmEngine(currentAlarms, (triggeredAlarm) => {
    triggerRingingScreen(
      triggeredAlarm,
      (snoozedAlarmObj) => {
        const snoozed = scheduleSnooze(snoozedAlarmObj, 5);
        currentAlarms.push(snoozed);
        saveAlarms(currentAlarms);
        updateEngineAlarms(currentAlarms);
        renderAlarmList(currentAlarms, handleToggleAlarm, (a) => openEditor(a));
      },
      (dismissedAlarm) => {
        console.log('Alarm dismissed:', dismissedAlarm.label);
      }
    );
  });
});

function handleSaveAlarm(updatedAlarm) {
  const index = currentAlarms.findIndex(a => a.id === updatedAlarm.id);
  if (index >= 0) {
    currentAlarms[index] = updatedAlarm;
  } else {
    currentAlarms.push(updatedAlarm);
  }
  persistAndRefresh();
}

function handleDeleteAlarm(alarmId) {
  currentAlarms = currentAlarms.filter(a => a.id !== alarmId);
  persistAndRefresh();
}

function handleToggleAlarm(alarmId, active) {
  const alarm = currentAlarms.find(a => a.id === alarmId);
  if (alarm) {
    alarm.active = active;
    persistAndRefresh();
  }
}

function persistAndRefresh() {
  saveAlarms(currentAlarms);
  updateEngineAlarms(currentAlarms);
  renderAlarmList(currentAlarms, handleToggleAlarm, (a) => openEditor(a));
}
