// Web Audio Engine & Ringtone Player for Golondrinas Despiertas
import { getCustomAudio } from './storage.js';

let audioCtx = null;
let currentGainNode = null;
let isPlaying = false;
let isPreviewing = false;
let volumeRampInterval = null;
let currentAudioElement = null;
let synthTimer = null;
let baseTargetVolume = 0.9;

export function getAudioContext() {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// User-gesture unlock function for mobile browsers & Chromium autoplay policies
export async function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {}
  }
  // Trigger a silent micro-oscillator to fully unblock Web Audio pipeline
  if (ctx && ctx.state === 'running') {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    } catch (e) {}
  }
}

// Play default synth ringtones procedural or custom audio
export async function playRingtone({ ringtone = 'xylophone', targetVolume = 0.9, gradualVolume = true, rampSeconds = 10 }) {
  stopRingtone();
  isPlaying = true;
  baseTargetVolume = Math.max(0.2, Math.min(1.0, targetVolume));

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {}
  }

  const initialVol = gradualVolume ? 0.25 : baseTargetVolume;
  
  if (ringtone && ringtone.startsWith('custom_audio_')) {
    // Play custom audio blob from IndexedDB
    try {
      const blob = await getCustomAudio(ringtone);
      if (blob) {
        const audioUrl = URL.createObjectURL(blob);
        currentAudioElement = new Audio(audioUrl);
        currentAudioElement.loop = true;
        currentAudioElement.volume = initialVol;
        await currentAudioElement.play();

        if (gradualVolume) {
          startVolumeRamp((vol) => {
            if (currentAudioElement) currentAudioElement.volume = vol;
          }, initialVol, baseTargetVolume, rampSeconds);
        }
        return;
      }
    } catch (e) {
      console.warn('Failed playing custom audio, falling back to synth:', e);
    }
  }

  // Built-in Synthesizer Ringtones (Xylophone, Birds, Chime, Digital)
  if (ctx) {
    currentGainNode = ctx.createGain();
    currentGainNode.gain.setValueAtTime(initialVol, ctx.currentTime);
    currentGainNode.connect(ctx.destination);

    playSynthPattern(ringtone, ctx, currentGainNode);

    if (gradualVolume) {
      startVolumeRamp((vol) => {
        if (currentGainNode && ctx) {
          currentGainNode.gain.setValueAtTime(vol, ctx.currentTime);
        }
      }, initialVol, baseTargetVolume, rampSeconds);
    }
  }
}

// Duck ringtone volume when TTS voice speaks so speech is loud and clear
export function duckRingtone(duck = true) {
  if (!isPlaying) return;
  const target = duck ? 0.2 : baseTargetVolume;

  if (currentAudioElement) {
    currentAudioElement.volume = Math.max(0.1, target);
  }
  if (currentGainNode && audioCtx) {
    try {
      currentGainNode.gain.setValueAtTime(target, audioCtx.currentTime);
    } catch (e) {}
  }
}

// Stop ringtone playback
export function stopRingtone() {
  isPlaying = false;
  isPreviewing = false;
  if (synthTimer) {
    clearTimeout(synthTimer);
    synthTimer = null;
  }
  if (volumeRampInterval) {
    clearInterval(volumeRampInterval);
    volumeRampInterval = null;
  }
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.src = '';
    } catch (e) {}
    currentAudioElement = null;
  }
  if (currentGainNode) {
    try {
      currentGainNode.gain.setValueAtTime(0, audioCtx ? audioCtx.currentTime : 0);
      currentGainNode.disconnect();
    } catch (e) {}
    currentGainNode = null;
  }
}

// Volume ramp-up utility
function startVolumeRamp(setVolFn, startVol, endVol, durationSec) {
  const steps = 30;
  const stepTime = (durationSec * 1000) / steps;
  const volIncrement = (endVol - startVol) / steps;
  let currentVol = startVol;
  let currentStep = 0;

  volumeRampInterval = setInterval(() => {
    currentStep++;
    currentVol += volIncrement;
    if (currentVol > endVol) currentVol = endVol;
    setVolFn(currentVol);

    if (currentStep >= steps || currentVol >= endVol) {
      clearInterval(volumeRampInterval);
      volumeRampInterval = null;
    }
  }, stepTime);
}

// Procedural synth patterns for default tones (Loud, Clear, Beautiful)
function playSynthPattern(type, ctx, gainNode) {
  let intervalMs = 600;
  let patternSeq = [];

  if (type === 'birds') {
    intervalMs = 700;
    // Pleasant bird chirp sequence with dual frequency modulations
    patternSeq = [
      { freq: 1760, duration: 0.15, type: 'sine' },
      { freq: 2349, duration: 0.2, type: 'sine' },
      { freq: 1975, duration: 0.15, type: 'sine' },
      { freq: 2793, duration: 0.35, type: 'sine' }
    ];
  } else if (type === 'chime') {
    intervalMs = 1200;
    // Resonant harmonic chime chords (A4, C#5, E5, A5)
    patternSeq = [
      { freq: 440, duration: 1.1, type: 'triangle' },
      { freq: 554.37, duration: 1.1, type: 'sine' },
      { freq: 659.25, duration: 1.1, type: 'triangle' },
      { freq: 880, duration: 1.4, type: 'sine' }
    ];
  } else if (type === 'digital') {
    intervalMs = 450;
    // Classic loud energetic digital dual-beep alarm
    patternSeq = [
      { freq: 950, duration: 0.12, type: 'square' },
      { freq: 950, duration: 0.12, type: 'square' },
      { freq: 1400, duration: 0.18, type: 'square' },
      { freq: 0, duration: 0.2, type: 'sine' } // pause
    ];
  } else {
    // Default 'xylophone' - Bright melodic morning marimba / xylophone
    intervalMs = 650;
    patternSeq = [
      { freq: 523.25, duration: 0.6, type: 'sine' }, // C5
      { freq: 659.25, duration: 0.6, type: 'sine' }, // E5
      { freq: 783.99, duration: 0.6, type: 'sine' }, // G5
      { freq: 1046.50, duration: 0.8, type: 'sine' }, // C6
      { freq: 880.00, duration: 0.6, type: 'sine' },  // A5
      { freq: 783.99, duration: 0.8, type: 'sine' }   // G5
    ];
  }

  let step = 0;

  function triggerStep() {
    if (!isPlaying || !currentGainNode || !ctx) return;
    
    const note = patternSeq[step % patternSeq.length];
    
    if (note.freq > 0) {
      try {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = note.type || 'sine';
        osc.frequency.setValueAtTime(note.freq, ctx.currentTime);

        // Rich tone with second harmonic for acoustic ringtones
        let oscHarmonic = null;
        let harmGain = null;
        if (type === 'xylophone' || type === 'chime') {
          oscHarmonic = ctx.createOscillator();
          harmGain = ctx.createGain();
          oscHarmonic.type = 'triangle';
          oscHarmonic.frequency.setValueAtTime(note.freq * 2, ctx.currentTime);
          harmGain.gain.setValueAtTime(0.3, ctx.currentTime);
          harmGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.duration);
          oscHarmonic.connect(harmGain);
          harmGain.connect(gainNode);
          oscHarmonic.start();
          oscHarmonic.stop(ctx.currentTime + note.duration);
        }

        // Main note envelope
        noteGain.gain.setValueAtTime(0.85, ctx.currentTime);
        noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.duration);

        osc.connect(noteGain);
        noteGain.connect(gainNode);

        osc.start();
        osc.stop(ctx.currentTime + note.duration);
      } catch (e) {
        console.warn('Synth trigger error:', e);
      }
    }

    step++;
    if (isPlaying) {
      synthTimer = setTimeout(triggerStep, intervalMs);
    }
  }

  triggerStep();
}

// Sleep Sounds Generator for Bedside Mode (Rain / Ocean Waves)
let sleepNoiseNode = null;
export function startSleepSound(type = 'rain') {
  stopSleepSound();
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Pink/Brown noise generation
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5; // Gain boost
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(type === 'rain' ? 800 : 400, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, ctx.currentTime);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start();
  sleepNoiseNode = { noise, gain };
}

export function stopSleepSound() {
  if (sleepNoiseNode) {
    try {
      sleepNoiseNode.noise.stop();
      sleepNoiseNode.noise.disconnect();
    } catch (e) {}
    sleepNoiseNode = null;
  }
}
