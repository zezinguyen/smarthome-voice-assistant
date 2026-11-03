import { describe, it, expect } from 'vitest';
import {
  calculateVoiceVolume,
  getFrequencyBands,
  pickDefaultMicrophone,
  getSupportedAudioMimeType
} from './audioCaptureManager';

describe('audioCaptureManager - Deep Module Seams', () => {
  describe('calculateVoiceVolume', () => {
    it('returns 0 for empty or invalid data', () => {
      expect(calculateVoiceVolume([])).toBe(0);
      expect(calculateVoiceVolume(null)).toBe(0);
    });

    it('calculates bounded voice volume between 0 and 100', () => {
      // Simulate silent room
      const silence = new Uint8Array(128).fill(5);
      const lowVol = calculateVoiceVolume(silence);
      expect(lowVol).toBeLessThan(10);

      // Simulate loud human speech (frequency bins 0-48 filled with high energy)
      const loudVoice = new Uint8Array(128);
      for (let i = 0; i < 48; i++) loudVoice[i] = 200;
      const highVol = calculateVoiceVolume(loudVoice);
      expect(highVol).toBeGreaterThan(40);
      expect(highVol).toBeLessThanOrEqual(100);
    });

    it('ignores high-frequency noise above speech spectrum (> bin 48)', () => {
      const speechNoise = new Uint8Array(128);
      // High frequency hiss only above bin 48
      for (let i = 50; i < 128; i++) speechNoise[i] = 255;
      const vol = calculateVoiceVolume(speechNoise);
      expect(vol).toBe(0);
    });
  });

  describe('getFrequencyBands', () => {
    it('returns array of zeroes when empty or null data is passed', () => {
      const bands = getFrequencyBands([], 20);
      expect(bands).toHaveLength(20);
      expect(bands.every((b) => b === 0)).toBe(true);
    });

    it('generates energetic frequency bands when voice is detected', () => {
      const loudVoice = new Uint8Array(128);
      for (let i = 0; i < 48; i++) loudVoice[i] = 180;
      const bands = getFrequencyBands(loudVoice, 20);
      expect(bands).toHaveLength(20);
      expect(bands[0]).toBeGreaterThan(30);
      expect(bands[10]).toBeGreaterThan(30);
    });
  });

  describe('pickDefaultMicrophone', () => {
    it('returns empty string when devices list is empty', () => {
      expect(pickDefaultMicrophone([])).toBe('');
      expect(pickDefaultMicrophone(null)).toBe('');
    });

    it('filters out Stereo Mix and Virtual microphones, picking real hardware microphone', () => {
      const devices = [
        { deviceId: 'dev-1', label: 'Stereo Mix (Realtek Audio)' },
        { deviceId: 'dev-2', label: 'Virtual Audio Cable Line 1' },
        { deviceId: 'dev-3', label: 'Microphone Array (Intel Smart Sound)' },
        { deviceId: 'dev-4', label: 'Camo Microphone' }
      ];

      expect(pickDefaultMicrophone(devices)).toBe('dev-3');
    });

    it('filters out DeskIn virtual microphone even if Windows marks it as default, picking Microphone Array', () => {
      const devices = [
        { deviceId: 'default', label: 'Default - Microphone (DeskIn(R) Virtual Audio Device)' },
        { deviceId: 'deskin-id', label: 'Microphone (DeskIn(R) Virtual Audio Device)' },
        { deviceId: 'realtek-array-id', label: 'Microphone Array (Realtek(R) Audio)' }
      ];

      expect(pickDefaultMicrophone(devices)).toBe('realtek-array-id');
    });

    it('falls back to the first device if no specialized labels match', () => {
      const devices = [
        { deviceId: 'dev-a', label: 'Generic Audio 1' },
        { deviceId: 'dev-b', label: 'Generic Audio 2' }
      ];

      expect(pickDefaultMicrophone(devices)).toBe('dev-a');
    });
  });

  describe('getFrequencyBands with time-domain wave', () => {
    it('bounces frequency bands using timeData when voice is detected in time-domain', () => {
      // Simulate speech in time-domain (oscillating between 80 and 176 around 128)
      const timeData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        timeData[i] = Math.round(128 + 40 * Math.sin(i * 0.2));
      }
      const emptyFreq = new Uint8Array(128).fill(0);
      const bands = getFrequencyBands(emptyFreq, 20, timeData);
      expect(bands).toHaveLength(20);
      // Middle bands should be responsive and energized
      expect(bands[10]).toBeGreaterThan(20);
    });
  });

  describe('getSupportedAudioMimeType', () => {
    it('returns standard audio format string', () => {
      const mime = getSupportedAudioMimeType();
      expect(typeof mime).toBe('string');
      expect(mime.length).toBeGreaterThan(0);
    });
  });
});
