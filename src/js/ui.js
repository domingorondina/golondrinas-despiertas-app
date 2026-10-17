// User Interface Controller for Golondrinas Despiertas

import { getSpanishVoices, speakText, stopSpeech, buildDynamicVocalMessage } from './tts.js';
import { playRingtone, stopRingtone, duckRingtone, unlockAudio, startSleepSound, stopSleepSound } from './audio.js';
import { getAllCustomAudios, saveCustomAudio } from './storage.js';
import { generateMathMission, startShakeMission } from './missions.js';
import { releaseWakeLock, requestWakeLock, stopVibration, scheduleSnooze, scheduleWakeUpCheck, unlockAudioKeeper } from './alarmEngine.js';

let currentEditingAlarm = null;
let currentRingingAlarm = null;
let customAudioList = [];
let isTestingRingtone = false;

// DOM Element Selectors
const elements = {
  currentTime: document.getElementById('currentTime'),
  currentDate: document.getElementById('currentDate'),
  nextAlarmBadge: document.getElementById('nextAlarmBadge'),
  alarmList: document.getElementById('alarmList'),
  fabAdd: document.getElementById('fabAdd'),
  nightstandBtn: document.getElementById('nightstandBtn'),

  // Modal Editor
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  editTime: document.getElementById('editTime'),
  editActive: document.getElementById('editActive'),
  editLabel: document.getElementById('editLabel'),
  editVocalMsg: document.getElementById('editVocalMsg'),
  editVocalVol: document.getElementById('editVocalVol'),
  editVocalVolVal: document.getElementById('editVocalVolVal'),
  editPitch: document.getElementById('editPitch'),
  editRate: document.getElementById('editRate'),
  editVoiceSelect: document.getElementById('editVoiceSelect'),
  editRingtone: document.getElementById('editRingtone'),
  btnTestRingtone: document.getElementById('btnTestRingtone'),
  audioFileInput: document.getElementById('audioFileInput'),
  editDate: document.getElementById('editDate'),
  editGradualVol: document.getElementById('editGradualVol'),
  editVibrate: document.getElementById('editVibrate'),
  editMission: document.getElementById('editMission'),

  // Action Buttons (Reference App Style)
  btnFinish: document.getElementById('btnFinish'),
  btnRevert: document.getElementById('btnRevert'),
  btnDelete: document.getElementById('btnDelete'),
  btnTestSpeech: document.getElementById('btnTestSpeech'),
  btnTestAlarmNow: document.getElementById('btnTestAlarmNow'),

  // Ringing Overlay
  ringingOverlay: document.getElementById('ringingOverlay'),
  ringingTime: document.getElementById('ringingTime'),
  ringingLabel: document.getElementById('ringingLabel'),
  ringingVocalMsg: document.getElementById('ringingVocalMsg'),
  btnSnooze: document.getElementById('btnSnooze'),
  btnDismiss: document.getElementById('btnDismiss'),

  // Nightstand View
  nightstandView: document.getElementById('nightstandView'),
  nightstandClock: document.getElementById('nightstandClock'),
  nightstandCloseBtn: document.getElementById('nightstandCloseBtn'),
  nightstandSleepSoundBtn: document.getElementById('nightstandSleepSoundBtn'),

  // Mission Modal
  missionModal: document.getElementById('missionModal'),
  missionTitle: document.getElementById('missionTitle'),
  missionContent: document.getElementById('missionContent')
};

// Initialize UI Event Listeners & State
export async function initUI({ alarms, onSaveAlarm, onDeleteAlarm, onToggleAlarm }) {
  updateClock();
  setInterval(updateClock, 1000);

  // Global AudioContext, Silent Keeper & Speech Unlocker on any user gesture
  const unlockHandler = () => {
    unlockAudio();
    unlockAudioKeeper();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  };
  window.addEventListener('pointerdown', unlockHandler);
  window.addEventListener('keydown', unlockHandler);

  customAudioList = await getAllCustomAudios();
  populateVoiceSelector();
  populateRingtoneSelector();

  renderAlarmList(alarms, onToggleAlarm, (alarm) => openEditor(alarm));

  elements.fabAdd.addEventListener('click', () => {
    openEditor(createNewAlarmObj());
  });

  elements.btnFinish.addEventListener('click', () => {
    if (!currentEditingAlarm) return;
    const updated = readEditorFormValues(currentEditingAlarm);
    onSaveAlarm(updated);
    closeEditor();
  });

  elements.btnRevert.addEventListener('click', () => {
    if (currentEditingAlarm) {
      populateEditorForm(currentEditingAlarm);
    }
  });

  elements.btnDelete.addEventListener('click', () => {
    if (currentEditingAlarm && currentEditingAlarm.id) {
      onDeleteAlarm(currentEditingAlarm.id);
      closeEditor();
    }
  });

  if (elements.btnTestAlarmNow) {
    elements.btnTestAlarmNow.addEventListener('click', () => {
      unlockAudio();
      if (!currentEditingAlarm) return;
      const alarmToTest = readEditorFormValues(currentEditingAlarm);
      triggerRingingScreen(
        alarmToTest,
        () => {},
        () => {}
      );
    });
  }

  if (elements.btnTestSpeech) {
    elements.btnTestSpeech.addEventListener('click', () => {
      unlockAudio();
      const text = elements.editVocalMsg.value || 'Prueba de voz en Golondrinas Despiertas';
      const vol = parseFloat(elements.editVocalVol.value) / 100;
      const pitch = parseFloat(elements.editPitch.value);
      const rate = parseFloat(elements.editRate.value);
      const voiceIdx = parseInt(elements.editVoiceSelect.value, 10) || 0;

      speakText({ text, volume: vol, pitch, rate, voiceIndex: voiceIdx });
    });
  }

  if (elements.btnTestRingtone) {
    elements.btnTestRingtone.addEventListener('click', () => {
      unlockAudio();
      if (isTestingRingtone) {
        stopRingtone();
        isTestingRingtone = false;
        elements.btnTestRingtone.innerText = '🎵 Probar Tono';
      } else {
        const ringtone = elements.editRingtone.value || 'xylophone';
        const vol = parseFloat(elements.editVocalVol.value) / 100;
        playRingtone({ ringtone, targetVolume: vol, gradualVolume: false });
        isTestingRingtone = true;
        elements.btnTestRingtone.innerText = '⏹️ Detener Tono';
      }
    });
  }

  // Handle custom audio file upload
  elements.audioFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const record = await saveCustomAudio(file);
        customAudioList.push(record);
        populateRingtoneSelector();
        elements.editRingtone.value = record.id;
      } catch (err) {
        alert('Error al guardar el archivo de audio local.');
      }
    }
  });

  // Nightstand Mode Events
  elements.nightstandBtn.addEventListener('click', openNightstandMode);
  elements.nightstandCloseBtn.addEventListener('click', closeNightstandMode);
  
  let sleepPlaying = false;
  elements.nightstandSleepSoundBtn.addEventListener('click', () => {
    sleepPlaying = !sleepPlaying;
    if (sleepPlaying) {
      startSleepSound('rain');
      elements.nightstandSleepSoundBtn.innerText = '🌧️ Detener Lluvia';
    } else {
      stopSleepSound();
      elements.nightstandSleepSoundBtn.innerText = '🌧️ Sonidos de Lluvia';
    }
  });
}

let latestAlarmsRef = [];

// Update Clock and Next Alarm Counter
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  elements.currentTime.innerText = `${hours}:${mins}`;
  if (elements.nightstandClock) elements.nightstandClock.innerText = `${hours}:${mins}`;

  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  elements.currentDate.innerText = now.toLocaleDateString('es-ES', options);

  updateNextAlarmBadge(latestAlarmsRef);
}

// Render Alarm Cards
export function renderAlarmList(alarms, onToggle, onEdit) {
  latestAlarmsRef = alarms || [];
  elements.alarmList.innerHTML = '';

  if (!alarms || alarms.length === 0) {
    elements.alarmList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏰</div>
        <p>No tienes alarmas configuradas.</p>
        <p style="font-size:0.85rem; margin-top:4px;">Toca el botón + para agregar tu primera alarma parlante.</p>
      </div>
    `;
    elements.nextAlarmBadge.innerHTML = `<span>No hay alarmas configuradas</span>`;
    return;
  }

  alarms.forEach(alarm => {
    const card = document.createElement('div');
    card.className = `alarm-card ${alarm.active ? 'active' : ''}`;
    
    const repeatStr = formatDays(alarm.repeatDays);

    card.innerHTML = `
      <div class="alarm-info">
        <div class="alarm-time">${alarm.time}</div>
        <div class="alarm-label">${alarm.label || 'Alarma'}</div>
        <div class="alarm-meta">
          <span>${repeatStr}</span>
          ${alarm.vocalMsg ? `<span class="badge badge-voice">🗣️ Voz</span>` : ''}
          ${alarm.mission !== 'none' ? `<span class="badge badge-mission">🎯 ${alarm.mission}</span>` : ''}
        </div>
      </div>
      <label class="switch" onclick="event.stopPropagation()">
        <input type="checkbox" ${alarm.active ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;

    card.querySelector('input').addEventListener('change', (e) => {
      onToggle(alarm.id, e.target.checked);
    });

    card.addEventListener('click', () => onEdit(alarm));
    elements.alarmList.appendChild(card);
  });

  updateNextAlarmBadge(alarms);
}

function updateNextAlarmBadge(alarms) {
  if (!elements.nextAlarmBadge) return;
  if (!alarms || alarms.length === 0) {
    elements.nextAlarmBadge.innerHTML = `<span>No hay alarmas configuradas</span>`;
    return;
  }
  const activeList = alarms.filter(a => a.active);
  if (activeList.length === 0) {
    elements.nextAlarmBadge.innerHTML = `<span>Todas las alarmas desactivadas</span>`;
    return;
  }

  const nextInfo = getNextAlarmInfo(activeList);
  if (!nextInfo) {
    elements.nextAlarmBadge.innerHTML = `<span>No hay próximas alarmas</span>`;
    return;
  }

  const { alarm, diffMinutes, offset } = nextInfo;
  let whenStr = 'Hoy';
  if (offset === 1) whenStr = 'Mañana';
  else if (offset > 1) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const now = new Date();
    const targetDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    whenStr = dayNames[targetDate.getDay()];
  }

  const hoursLeft = Math.floor(diffMinutes / 60);
  const minsLeft = diffMinutes % 60;
  let timeLeftStr = '';
  if (hoursLeft > 0) {
    timeLeftStr = `${hoursLeft}h ${minsLeft}m`;
  } else {
    timeLeftStr = `${minsLeft} min`;
  }

  elements.nextAlarmBadge.innerHTML = `<span>🔔 Próxima: ${whenStr} ${alarm.time} (en ${timeLeftStr})</span>`;
}

function getNextAlarmInfo(activeAlarmsList) {
  if (!activeAlarmsList || activeAlarmsList.length === 0) return null;

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun..6=Sat
  const mappedDay = currentDay === 0 ? 7 : currentDay;
  const currentMinutesToday = now.getHours() * 60 + now.getMinutes();

  let closest = null;
  let minDiffMinutes = Infinity;

  activeAlarmsList.forEach(alarm => {
    const parts = (alarm.time || '07:30').split(':').map(Number);
    const alarmMinutes = parts[0] * 60 + parts[1];

    const days = (alarm.repeatDays && alarm.repeatDays.length > 0) ? alarm.repeatDays : [1, 2, 3, 4, 5, 6, 7];
    
    for (let offset = 0; offset < 7; offset++) {
      const targetDay = ((mappedDay - 1 + offset) % 7) + 1;
      if (days.includes(targetDay)) {
        let diffMinutes = offset * 24 * 60 + (alarmMinutes - currentMinutesToday);
        if (diffMinutes <= 0 && offset === 0) {
          // Passed today, check next occurrence
          continue;
        }
        if (diffMinutes > 0 && diffMinutes < minDiffMinutes) {
          minDiffMinutes = diffMinutes;
          closest = {
            alarm,
            diffMinutes,
            offset
          };
        }
      }
    }
  });

  return closest;
}

// Editor Modal Management
export function openEditor(alarm) {
  currentEditingAlarm = alarm;
  elements.modalTitle.innerText = alarm.id ? 'Editar Alarma' : 'Nueva Alarma';
  populateEditorForm(alarm);
  elements.modalOverlay.classList.add('open');
}

function closeEditor() {
  elements.modalOverlay.classList.remove('open');
  currentEditingAlarm = null;
  stopSpeech();
  stopRingtone();
  isTestingRingtone = false;
  if (elements.btnTestRingtone) {
    elements.btnTestRingtone.innerText = '🎵 Probar Tono';
  }
}

function populateEditorForm(alarm) {
  elements.editTime.value = alarm.time || '07:30';
  elements.editActive.checked = alarm.active !== false;
  elements.editLabel.value = alarm.label || '';
  elements.editVocalMsg.value = alarm.vocalMsg || '';
  elements.editVocalVol.value = alarm.vocalVolume !== undefined ? alarm.vocalVolume : 80;
  elements.editVocalVolVal.innerText = `${elements.editVocalVol.value}%`;
  elements.editPitch.value = alarm.vocalPitch || 1.0;
  elements.editRate.value = alarm.vocalRate || 1.0;
  elements.editVoiceSelect.value = alarm.voiceIndex || 0;
  elements.editRingtone.value = alarm.ringtone || 'xylophone';
  elements.editDate.value = alarm.date || '';
  elements.editGradualVol.checked = alarm.gradualVolume !== false;
  elements.editVibrate.checked = alarm.vibrate !== false;
  elements.editMission.value = alarm.mission || 'none';

  // Render Day Selection Buttons
  const daysContainer = document.getElementById('daySelector');
  daysContainer.innerHTML = '';
  const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const selectedDays = alarm.repeatDays || [];

  dayNames.forEach((name, idx) => {
    const dayVal = idx + 1; // 1..7
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `day-btn ${selectedDays.includes(dayVal) ? 'selected' : ''}`;
    btn.innerText = name;
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
    });
    daysContainer.appendChild(btn);
  });
}

function normalizeTimeStr(t) {
  if (!t) return '07:30';
  const parts = t.split(':');
  if (parts.length < 2) return t;
  const h = String(parts[0]).padStart(2, '0');
  const m = String(parts[1]).padStart(2, '0');
  return `${h}:${m}`;
}

function readEditorFormValues(original) {
  const selectedDays = [];
  document.querySelectorAll('#daySelector .day-btn').forEach((btn, idx) => {
    if (btn.classList.contains('selected')) {
      selectedDays.push(idx + 1);
    }
  });

  return {
    id: original.id || 'alarm_' + Date.now(),
    time: normalizeTimeStr(elements.editTime.value),
    active: elements.editActive.checked,
    label: elements.editLabel.value.trim() || 'Alarma',
    vocalMsg: elements.editVocalMsg.value.trim(),
    vocalVolume: parseInt(elements.editVocalVol.value, 10),
    vocalPitch: parseFloat(elements.editPitch.value),
    vocalRate: parseFloat(elements.editRate.value),
    voiceIndex: parseInt(elements.editVoiceSelect.value, 10),
    ringtone: elements.editRingtone.value,
    date: elements.editDate.value,
    repeatDays: selectedDays,
    gradualVolume: elements.editGradualVol.checked,
    vibrate: elements.editVibrate.checked,
    mission: elements.editMission.value
  };
}

function populateVoiceSelector() {
  const voices = getSpanishVoices();
  elements.editVoiceSelect.innerHTML = '';
  voices.forEach((v, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.innerText = `${v.name} (${v.lang})`;
    elements.editVoiceSelect.appendChild(opt);
  });
}

function populateRingtoneSelector() {
  elements.editRingtone.innerHTML = `
    <option value="xylophone">Morning Xylophone (Predeterminado)</option>
    <option value="birds">Canto de Golondrinas / Naturaleza</option>
    <option value="chime">Campana Suave / Chime</option>
    <option value="digital">Alarma Digital Clásica</option>
  `;

  if (customAudioList.length > 0) {
    const group = document.createElement('optgroup');
    group.label = '📱 Mis Melodías Locales';
    customAudioList.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.innerText = `🎵 ${item.name}`;
      group.appendChild(opt);
    });
    elements.editRingtone.appendChild(group);
  }
}

// Trigger Ringing Screen Overlay
export function triggerRingingScreen(alarm, onSnooze, onDismiss) {
  currentRingingAlarm = alarm;
  elements.ringingTime.innerText = alarm.time;
  elements.ringingLabel.innerText = alarm.label || '¡Es hora!';
  
  const fullSpeechText = buildDynamicVocalMessage(alarm);
  elements.ringingVocalMsg.innerText = fullSpeechText;

  elements.ringingOverlay.classList.add('active');

  // Start Sound & Speech Loop
  const vol = (alarm.vocalVolume !== undefined ? alarm.vocalVolume : 80) / 100;
  playRingtone({
    ringtone: alarm.ringtone || 'xylophone',
    targetVolume: vol,
    gradualVolume: alarm.gradualVolume !== false,
    rampSeconds: 10
  });

  // Read Voice Message with auto-ducking of background ringtone
  speakText({
    text: fullSpeechText,
    volume: Math.min(1.0, vol + 0.2),
    pitch: alarm.vocalPitch || 1.0,
    rate: alarm.vocalRate || 1.0,
    voiceIndex: alarm.voiceIndex || 0,
    onStart: () => {
      duckRingtone(true);
    },
    onEnd: () => {
      duckRingtone(false);
    }
  });

  // Snooze Event
  elements.btnSnooze.onclick = () => {
    stopRingtoneAndSpeech();
    elements.ringingOverlay.classList.remove('active');
    onSnooze(alarm);
  };

  // Dismiss Event (Checks for Missions)
  elements.btnDismiss.onclick = () => {
    if (alarm.mission && alarm.mission !== 'none') {
      openMissionModal(alarm.mission, () => {
        dismissAlarmComplete(onDismiss);
      });
    } else {
      dismissAlarmComplete(onDismiss);
    }
  };
}

function dismissAlarmComplete(onDismiss) {
  stopRingtoneAndSpeech();
  elements.ringingOverlay.classList.remove('active');
  scheduleWakeUpCheck(currentRingingAlarm, (checkAlarm) => {
    alert(`¿Seguís despierto? Verificación de seguridad para la alarma "${checkAlarm.label}".`);
  });
  onDismiss(currentRingingAlarm);
  currentRingingAlarm = null;
}

function stopRingtoneAndSpeech() {
  stopRingtone();
  stopSpeech();
  stopVibration();
  releaseWakeLock();
}

// Anti-Snooze Mission Modal
function openMissionModal(missionType, onSuccess) {
  elements.missionModal.classList.add('active');
  elements.missionContent.innerHTML = '';

  if (missionType === 'math') {
    const mathObj = generateMathMission();
    elements.missionTitle.innerText = '🧠 Desafío Matemático';
    elements.missionContent.innerHTML = `
      <div class="mission-desc">Resuelve la operación para desactivar la alarma:</div>
      <div class="math-problem">${mathObj.question}</div>
      <input type="number" id="mathAnswerInput" class="form-input" placeholder="Respuesta" style="text-align:center; font-size:1.5rem;" autofocus>
      <button type="button" id="btnCheckMath" class="btn-action btn-finish" style="width:100%; margin-top:16px;">Comprobar</button>
    `;
    
    document.getElementById('btnCheckMath').onclick = () => {
      const val = parseInt(document.getElementById('mathAnswerInput').value, 10);
      if (val === mathObj.answer) {
        elements.missionModal.classList.remove('active');
        onSuccess();
      } else {
        alert('Respuesta incorrecta. Inténtalo de nuevo.');
      }
    };
  } else if (missionType === 'shake') {
    elements.missionTitle.innerText = '📱 Desafío de Agitar';
    elements.missionContent.innerHTML = `
      <div class="mission-desc">Agita fuertemente tu teléfono para apagar la alarma:</div>
      <div class="math-problem" id="shakeCountDisplay">0 / 15</div>
    `;

    startShakeMission({
      targetShakes: 15,
      onProgress: (current, total) => {
        document.getElementById('shakeCountDisplay').innerText = `${current} / ${total}`;
      },
      onComplete: () => {
        elements.missionModal.classList.remove('active');
        onSuccess();
      }
    });
  }
}

// Bedside Nightstand Mode
function openNightstandMode() {
  elements.nightstandView.classList.add('active');
  requestWakeLock();
  unlockAudioKeeper();
  updateClock();
}

function closeNightstandMode() {
  elements.nightstandView.classList.remove('active');
  stopSleepSound();
}

function createNewAlarmObj() {
  return {
    id: null,
    time: '08:00',
    active: true,
    label: 'Nueva Alarma',
    vocalMsg: 'Es hora de despertar.',
    vocalVolume: 80,
    vocalPitch: 1.0,
    vocalRate: 1.0,
    voiceIndex: 0,
    ringtone: 'xylophone',
    date: '',
    repeatDays: [1, 2, 3, 4, 5, 6, 7],
    gradualVolume: true,
    vibrate: true,
    mission: 'none'
  };
}

function formatDays(days) {
  if (!days || days.length === 0) return 'Una sola vez';
  if (days.length === 7) return 'Todos los días';
  if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) return 'Lu a Vi';
  const map = { 1: 'Lu', 2: 'Ma', 3: 'Mi', 4: 'Ju', 5: 'Vi', 6: 'Sá', 7: 'Do' };
  return days.map(d => map[d]).join(', ');
}
