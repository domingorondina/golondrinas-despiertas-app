// Anti-Snooze Missions Module for Golondrinas Despiertas

export function generateMathMission() {
  const num1 = Math.floor(Math.random() * 20) + 10;
  const num2 = Math.floor(Math.random() * 20) + 5;
  const answer = num1 + num2;
  return {
    question: `${num1} + ${num2} = ?`,
    answer: answer
  };
}

export function startShakeMission({ targetShakes = 15, onProgress, onComplete }) {
  let shakeCount = 0;
  let lastX = null, lastY = null, lastZ = null;
  const threshold = 15; // Acceleration threshold

  function handleMotion(event) {
    const accel = event.accelerationIncludingGravity || event.acceleration;
    if (!accel) return;

    const { x, y, z } = accel;
    if (lastX !== null && lastY !== null && lastZ !== null) {
      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);

      if (deltaX + deltaY + deltaZ > threshold) {
        shakeCount++;
        if (onProgress) onProgress(shakeCount, targetShakes);

        if (shakeCount >= targetShakes) {
          stopShakeMission();
          if (onComplete) onComplete();
        }
      }
    }

    lastX = x;
    lastY = y;
    lastZ = z;
  }

  function stopShakeMission() {
    window.removeEventListener('devicemotion', handleMotion);
  }

  if (window.DeviceMotionEvent) {
    // Request permission if iOS 13+
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('devicemotion', handleMotion);
        }
      }).catch(console.error);
    } else {
      window.addEventListener('devicemotion', handleMotion);
    }
  }

  return stopShakeMission;
}
