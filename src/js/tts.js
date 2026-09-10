// Web Speech Synthesis (TTS) Module for Golondrinas Despiertas

let synth = window.speechSynthesis;
let availableVoices = [];

export function getSpanishVoices() {
  if (!synth) return [];
  const voices = synth.getVoices();
  // Filter Spanish voices first, or fallback to all voices
  const spanish = voices.filter(v => v.lang.startsWith('es'));
  availableVoices = spanish.length > 0 ? spanish : voices;
  return availableVoices;
}

// Load voices async (browser event)
export function initTTS(onVoicesReady) {
  if (!synth) return;
  getSpanishVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = () => {
      const voices = getSpanishVoices();
      if (onVoicesReady) onVoicesReady(voices);
    };
  }
}

// Speak a text string with custom parameters
export function speakText({ text, volume = 1.0, pitch = 1.0, rate = 1.0, voiceIndex = 0, onStart, onEnd }) {
  if (!('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }
  
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch (e) {}

  if (!text || text.trim() === '') {
    if (onEnd) onEnd();
    return;
  }

  setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
      
      if (voices && voices.length > 0) {
        if (voices[voiceIndex]) {
          utterance.voice = voices[voiceIndex];
        } else {
          const esVoice = voices.find(v => v.lang.startsWith('es'));
          if (esVoice) utterance.voice = esVoice;
          else utterance.voice = voices[0];
        }
      }
      
      utterance.volume = Math.max(0.1, Math.min(1.0, volume));
      utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
      utterance.rate = Math.max(0.5, Math.min(2.0, rate));

      if (onStart) {
        utterance.onstart = onStart;
      }

      if (onEnd) {
        utterance.onend = onEnd;
        utterance.onerror = onEnd;
      }

      window.speechSynthesis.speak(utterance);
      window.speechSynthesis.resume();
    } catch (e) {
      console.warn('TTS playback error:', e);
      if (onEnd) onEnd();
    }
  }, 60);
}

// Stop any speaking utterance
export function stopSpeech() {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

// Format dynamic morning message (Time + Date + Custom Message)
export function buildDynamicVocalMessage(alarm) {
  const now = new Date();
  const hours = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('es-ES', options);

  let greeting = 'Buenos días.';
  if (hours >= 12 && hours < 20) greeting = 'Buenas tardes.';
  else if (hours >= 20 || hours < 6) greeting = 'Buenas noches.';

  let output = `${greeting} Son las ${hours} y ${mins} del ${dateStr}. `;
  if (alarm.vocalMsg && alarm.vocalMsg.trim()) {
    output += `${alarm.vocalMsg.trim()}`;
  }

  return output;
}
