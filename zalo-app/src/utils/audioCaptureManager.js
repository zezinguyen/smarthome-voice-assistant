/**
 * Audio Capture Manager - Deep Module
 * Che giấu toàn bộ cấu hình Web Audio API, AnalyserNode FFT, Time-Domain RMS/Peak,
 * MediaRecorder codecs, và quản lý giải phóng tài nguyên microphone phần cứng.
 */

// Tính toán âm lượng người nói (Voice Volume 0-100) kết hợp FFT và Time-Domain
export function calculateVoiceVolume(dataArray, timeData = null) {
  if ((!dataArray || dataArray.length === 0) && (!timeData || timeData.length === 0)) return 0;

  let peak = 0;
  let voiceSum = 0;
  const voiceBins = dataArray ? Math.min(dataArray.length, 48) : 0;
  for (let i = 0; i < voiceBins; i++) {
    if (dataArray[i] > peak) peak = dataArray[i];
    voiceSum += dataArray[i];
  }
  const voiceAvg = voiceBins > 0 ? voiceSum / voiceBins : 0;
  let scaled = (voiceAvg * 0.5 + peak * 0.5) / 1.3;

  // Nếu không có năng lượng trong dải FFT và cũng không có timeData thì xem như không có tiếng
  if (peak === 0 && voiceAvg === 0 && (!timeData || timeData.length === 0)) {
    return 0;
  }

  // Nếu có dữ liệu sóng thời gian (timeData), tính độ lệch âm lượng tức thời kết hợp
  if (timeData && timeData.length > 0) {
    let timePeak = 0;
    let timeSumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const dev = Math.abs(timeData[i] - 128);
      if (dev > timePeak) timePeak = dev;
      timeSumSq += dev * dev;
    }
    const timeRms = Math.sqrt(timeSumSq / timeData.length);
    if (timePeak > 2) {
      const timeScaled = Math.min(100, Math.round((timeRms * 2.2 + timePeak * 0.8) * 1.5));
      scaled = Math.max(scaled, timeScaled);
    }
  }

  return Math.min(100, Math.round(scaled));
}

// Trích xuất các dải tần số âm thanh (Voice Frequency Spectrum Bands: 0-100) cho sóng âm động
export function getFrequencyBands(dataArray, numBands = 20, timeData = null) {
  if ((!dataArray || dataArray.length === 0) && (!timeData || timeData.length === 0)) {
    return new Array(numBands).fill(0);
  }
  const voiceBins = dataArray ? Math.min(dataArray.length, 48) : 0;
  const binStep = Math.max(1, Math.floor((voiceBins || 48) / numBands));
  const bands = [];

  let timePeak = 0;
  let timeRms = 0;
  if (timeData && timeData.length > 0) {
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const dev = Math.abs(timeData[i] - 128);
      if (dev > timePeak) timePeak = dev;
      sumSq += dev * dev;
    }
    timeRms = Math.sqrt(sumSq / timeData.length);
  }
  const hasVoiceInTime = timePeak > 2;

  for (let b = 0; b < numBands; b++) {
    let freqScaled = 0;
    if (dataArray && voiceBins > 0) {
      const start = b * binStep;
      const end = Math.min(voiceBins, start + binStep);
      let sum = 0;
      let peak = 0;
      let count = 0;
      for (let i = start; i < end; i++) {
        if (dataArray[i] > peak) peak = dataArray[i];
        sum += dataArray[i];
        count++;
      }
      const avg = count > 0 ? sum / count : 0;
      freqScaled = (avg * 0.4 + peak * 0.6) / 1.5;
    }

    let timeBandScaled = 0;
    if (hasVoiceInTime && timeData) {
      const sliceSize = Math.max(1, Math.floor(timeData.length / numBands));
      const tStart = b * sliceSize;
      const tEnd = Math.min(timeData.length, tStart + sliceSize);
      let localPeak = 0;
      for (let j = tStart; j < tEnd; j++) {
        const dev = Math.abs(timeData[j] - 128);
        if (dev > localPeak) localPeak = dev;
      }
      // Định hình sóng âm tự nhiên: các cột giữa cao hơn 2 biên (phù hợp dải tần giọng người 300Hz-3kHz)
      const centerFactor = 1.0 - Math.abs((b - (numBands / 2)) / (numBands / 2)) * 0.35;
      timeBandScaled = ((localPeak / 128) * 100 * 2.8 + (timeRms / 128) * 100 * 1.5) * centerFactor;
    }

    const bandVal = Math.max(freqScaled, timeBandScaled);
    bands.push(Math.min(100, Math.round(bandVal)));
  }

  return bands;
}

export function isVirtualOrUnwantedMic(label) {
  if (!label) return false;
  const l = label.toLowerCase();
  return (
    l.includes('deskin') ||
    l.includes('deskln') ||
    l.includes('virtual') ||
    l.includes('stereo mix') ||
    l.includes('camo') ||
    l.includes('droidcam') ||
    l.includes('iriun') ||
    l.includes('obs') ||
    l.includes('line in') ||
    l.includes('blackhole') ||
    l.includes('vb-audio') ||
    l.includes('cable output')
  );
}

export function isHardwareMicrophone(label) {
  if (!label) return false;
  const l = label.toLowerCase();
  if (isVirtualOrUnwantedMic(label)) return false;
  return (
    l.includes('array') ||
    l.includes('realtek') ||
    l.includes('intel') ||
    l.includes('headset') ||
    l.includes('headphone') ||
    l.includes('usb') ||
    l.includes('built-in') ||
    l.includes('internal') ||
    l.includes('microphone')
  );
}

// Quét danh sách thiết bị Microphone thực tế
export async function getAudioInputDevices() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return [];
  }
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach((t) => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');

    // Sắp xếp: micro thực lên đầu, micro ảo xuống cuối
    return audioInputs.sort((a, b) => {
      const aBad = isVirtualOrUnwantedMic(a.label);
      const bBad = isVirtualOrUnwantedMic(b.label);
      if (aBad && !bBad) return 1;
      if (!aBad && bBad) return -1;
      return 0;
    });
  } catch (err) {
    console.warn('Lỗi quét thiết bị Microphone:', err);
    return [];
  }
}

// Chọn micro ưu tiên (loại bỏ triệt để micro ảo như DeskIn, stereo mix)
export function pickDefaultMicrophone(devices) {
  if (!devices || devices.length === 0) return '';

  // 1. Ưu tiên cao nhất: Micro phần cứng vật lý thực tế (Microphone Array, Realtek, Headset, USB, Intel...)
  const hardwareMic = devices.find(
    (m) =>
      m.label &&
      isHardwareMicrophone(m.label) &&
      m.deviceId !== 'default' &&
      m.deviceId !== 'communications'
  );
  if (hardwareMic) return hardwareMic.deviceId;

  // 2. Bất kỳ micro nào có nhãn thực tế không phải ảo/unwanted
  const realMic = devices.find(
    (m) =>
      m.label &&
      !isVirtualOrUnwantedMic(m.label) &&
      m.deviceId !== 'default' &&
      m.deviceId !== 'communications'
  );
  if (realMic) return realMic.deviceId;

  // 3. Nếu 'default' không phải là micro ảo (kiểm tra label của default)
  const sysDefault = devices.find((m) => m.deviceId === 'default');
  if (sysDefault && (!sysDefault.label || !isVirtualOrUnwantedMic(sysDefault.label))) {
    return 'default';
  }

  // 4. Thiết bị đầu tiên không phải micro ảo
  const nonVirtual = devices.find((m) => !isVirtualOrUnwantedMic(m.label));
  return nonVirtual ? nonVirtual.deviceId : (devices[0]?.deviceId || '');
}

// Kiểm tra codec MediaRecorder được hỗ trợ tốt nhất
export function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm';
  }
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  return 'audio/webm';
}

// Khởi tạo AudioContext kèm AnalyserNode và kiểm tra trạng thái
export async function createAudioAnalyser(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn('AudioContext resume warning:', e);
    }
  }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.2; // Độ phản hồi cao, bắt sóng nhanh
  analyser.minDecibels = -90; // Nhạy hơn với âm lượng giọng nói thông thường
  analyser.maxDecibels = -10;

  const source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);

  // Thêm silent GainNode kết nối tới destination để trình duyệt luôn chạy audio render clock
  const silentGain = ctx.createGain();
  silentGain.gain.value = 0.0;
  analyser.connect(silentGain);
  try {
    silentGain.connect(ctx.destination);
  } catch {}

  return { ctx, analyser, source, silentGain };
}

// Bắt đầu phiên kiểm tra Microphone (Đo volume + thu âm thử phát lại)
export async function testMicrophone(deviceId, {
  onVolume,
  onFrequencyBands,
  onRecordedUrl,
  onError,
  onMutedChange,
  onTrackInfo
} = {}) {
  let stream = null;
  let animFrameId = null;
  let analyserSetup = null;
  let mediaRecorder = null;
  const audioChunks = [];

  let chosenDeviceId = deviceId;
  if (!chosenDeviceId || chosenDeviceId === 'default') {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter((d) => d.kind === 'audioinput');
        const best = pickDefaultMicrophone(audioInputs);
        if (best && best !== 'default') {
          chosenDeviceId = best;
        }
      }
    } catch {}
  }

  try {
    const tryConstraints = [];
    if (chosenDeviceId && chosenDeviceId !== 'default') {
      tryConstraints.push({
        audio: {
          deviceId: { exact: chosenDeviceId },
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      tryConstraints.push({
        audio: {
          deviceId: { ideal: chosenDeviceId },
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
    }
    tryConstraints.push({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    tryConstraints.push({ audio: true });

    let lastError = null;
    for (const c of tryConstraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream && stream.getAudioTracks().length > 0) break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!stream || stream.getAudioTracks().length === 0) {
      throw lastError || new Error('Không thể mở microphone');
    }

    let track = stream.getAudioTracks()[0];

    // Nếu rơi vào micro ảo (DeskIn/Stereo Mix), tìm đổi sang micro thực
    if (track && isVirtualOrUnwantedMic(track.label)) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const realDev = devs.find((d) => d.kind === 'audioinput' && !isVirtualOrUnwantedMic(d.label) && d.deviceId !== 'default');
        if (realDev) {
          stream.getTracks().forEach((t) => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: realDev.deviceId },
              autoGainControl: true,
              echoCancellation: true,
              noiseSuppression: true
            }
          });
          track = stream.getAudioTracks()[0];
        }
      } catch {}
    }

    if (onTrackInfo && track) {
      onTrackInfo({
        label: track.label,
        muted: track.muted,
        enabled: track.enabled,
        settings: track.getSettings ? track.getSettings() : {}
      });
    }
    if (onMutedChange && track) {
      onMutedChange(track.muted);
      track.onmute = () => onMutedChange(true);
      track.onunmute = () => onMutedChange(false);
    }

    // 1. Phân tích âm lượng qua AudioContext & AnalyserNode
    analyserSetup = await createAudioAnalyser(stream);
    if (analyserSetup) {
      const analyser = analyserSetup.analyser;
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);

      const loop = () => {
        if (analyserSetup.ctx && analyserSetup.ctx.state === 'suspended') {
          try { analyserSetup.ctx.resume(); } catch {}
        }
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);
        const vol = calculateVoiceVolume(freqData, timeData);
        if (onVolume) onVolume(vol);
        if (onFrequencyBands) {
          onFrequencyBands(getFrequencyBands(freqData, 20, timeData));
        }
        animFrameId = requestAnimationFrame(loop);
      };
      loop();
    }

    // 2. Thu âm thử nghiệm để người dùng có thể nghe lại
    const mimeType = getSupportedAudioMimeType();
    try {
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        if (audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          if (onRecordedUrl) onRecordedUrl(url, blob);
        }
      };
      mediaRecorder.start(100);
    } catch (recErr) {
      console.warn('Lỗi khởi tạo MediaRecorder khi test mic:', recErr);
    }

    return {
      stream,
      analyserSetup,
      track,
      stop: () => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          try { mediaRecorder.stop(); } catch {}
        }
        if (analyserSetup?.ctx && analyserSetup.ctx.state !== 'closed') {
          try { analyserSetup.ctx.close(); } catch {}
        }
        if (stream) {
          try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        }
        if (onVolume) onVolume(0);
        if (onFrequencyBands) onFrequencyBands(new Array(20).fill(0));
      }
    };
  } catch (err) {
    if (onError) onError(err);
    if (stream) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    }
    return { stop: () => {} };
  }
}

// Bắt đầu thu âm chính thức cho trợ lý giọng nói
export async function startAudioCapture({
  deviceId,
  onVolume,
  onFrequencyBands,
  onRecordedBlob,
  onMutedChange,
  onTrackInfo,
  onError
} = {}) {
  let chosenDeviceId = deviceId;

  // Nếu deviceId rỗng hoặc là 'default', tự động quét tìm micro phần cứng tốt nhất
  if (!chosenDeviceId || chosenDeviceId === 'default') {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter((d) => d.kind === 'audioinput');
        const best = pickDefaultMicrophone(audioInputs);
        if (best && best !== 'default') {
          chosenDeviceId = best;
        }
      }
    } catch {}
  }

  const tryConstraints = [];
  if (chosenDeviceId && chosenDeviceId !== 'default') {
    tryConstraints.push({
      audio: {
        deviceId: { exact: chosenDeviceId },
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    tryConstraints.push({
      audio: {
        deviceId: { ideal: chosenDeviceId },
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
  }
  tryConstraints.push({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  tryConstraints.push({ audio: true });

  let stream = null;
  let lastErr = null;
  for (const c of tryConstraints) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(c);
      if (stream && stream.getAudioTracks().length > 0) break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!stream || stream.getAudioTracks().length === 0) {
    const finalErr = lastErr || new Error('Không thể truy cập Microphone');
    if (onError) onError(finalErr);
    throw finalErr;
  }

  let track = stream.getAudioTracks()[0];

  // Nếu stream trúng phải micro ảo (như DeskIn/Stereo Mix), tìm micro thực khác
  if (track && isVirtualOrUnwantedMic(track.label)) {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const realDev = devs.find((d) => d.kind === 'audioinput' && !isVirtualOrUnwantedMic(d.label) && d.deviceId !== 'default');
      if (realDev) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: realDev.deviceId },
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        track = stream.getAudioTracks()[0];
      }
    } catch {}
  }

  if (onTrackInfo && track) {
    onTrackInfo({
      label: track.label,
      muted: track.muted,
      enabled: track.enabled
    });
  }
  if (onMutedChange && track) {
    onMutedChange(track.muted);
    track.onmute = () => onMutedChange(true);
    track.onunmute = () => onMutedChange(false);
  }

  let animFrameId = null;
  const analyserSetup = await createAudioAnalyser(stream);
  if (analyserSetup) {
    const analyser = analyserSetup.analyser;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.fftSize);

    const liveLoop = () => {
      if (analyserSetup.ctx && analyserSetup.ctx.state === 'suspended') {
        try { analyserSetup.ctx.resume(); } catch {}
      }
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      const vol = calculateVoiceVolume(freqData, timeData);
      if (onVolume) onVolume(vol);
      if (onFrequencyBands) {
        onFrequencyBands(getFrequencyBands(freqData, 20, timeData));
      }
      animFrameId = requestAnimationFrame(liveLoop);
    };
    liveLoop();
  }

  let recorder = null;
  const audioChunks = [];
  const mimeType = getSupportedAudioMimeType();
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    recorder.start(100);
  } catch (recErr) {
    console.warn('Lỗi khởi tạo MediaRecorder (bản ghi audio sẽ không khả dụng):', recErr);
  }

  return {
    stream,
    analyserSetup,
    track,
    stop: () => {
      return new Promise((resolve) => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (onVolume) onVolume(0);
        if (onFrequencyBands) onFrequencyBands(new Array(20).fill(0));

        const cleanup = () => {
          try { stream.getTracks().forEach((t) => t.stop()); } catch {}
          if (analyserSetup?.ctx && analyserSetup.ctx.state !== 'closed') {
            try { analyserSetup.ctx.close(); } catch {}
          }
          const blob = audioChunks.length > 0 
            ? new Blob(audioChunks, { type: mimeType }) 
            : null;
          if (onRecordedBlob) {
            try { onRecordedBlob(blob); } catch (e) { console.warn('Lỗi xử lý onRecordedBlob:', e); }
          }
          resolve(blob);
        };

        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = cleanup;
          try { recorder.stop(); } catch { cleanup(); }
        } else {
          cleanup();
        }
      });
    },
    abort: () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (onVolume) onVolume(0);
      if (onFrequencyBands) onFrequencyBands(new Array(20).fill(0));
      if (recorder) {
        try {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {}
      }
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      if (analyserSetup?.ctx && analyserSetup.ctx.state !== 'closed') {
        try { analyserSetup.ctx.close(); } catch {}
      }
    }
  };
}
