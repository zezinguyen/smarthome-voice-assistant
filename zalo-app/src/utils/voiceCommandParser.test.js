import { describe, it, expect } from 'vitest';
import { parseVoiceCommand } from './voiceCommandParser';

describe('voiceCommandParser - Seam: Edge cases & Unknown input', () => {
  it('returns null when input is empty or null', () => {
    expect(parseVoiceCommand('')).toBeNull();
    expect(parseVoiceCommand(null)).toBeNull();
  });

  it('returns UNKNOWN action when command is not recognized', () => {
    const result = parseVoiceCommand('xin chào thế giới');
    expect(result).not.toBeNull();
    expect(result.action).toBe('UNKNOWN');
    expect(result.irCode).toBe('0x00000000');
  });
});

describe('voiceCommandParser - Seam: Core Intent Matching', () => {
  it('identifies TV Power On command (with and without diacritics)', () => {
    expect(parseVoiceCommand('bật tivi')).toMatchObject({
      action: 'TV_POWER_ON',
      irCode: '0x20DF10EF'
    });
    expect(parseVoiceCommand('bat tivi')).toMatchObject({
      action: 'TV_POWER_ON',
      irCode: '0x20DF10EF'
    });
  });

  it('identifies TV Power Off command', () => {
    expect(parseVoiceCommand('tắt tivi')).toMatchObject({
      action: 'TV_POWER_OFF',
      irCode: '0x20DF10EF'
    });
    expect(parseVoiceCommand('tat tivi')).toMatchObject({
      action: 'TV_POWER_OFF',
      irCode: '0x20DF10EF'
    });
  });

  it('identifies Volume and Mute commands', () => {
    expect(parseVoiceCommand('tăng âm')).toMatchObject({
      action: 'VOL_UP',
      irCode: '0x20DF40BF'
    });
    expect(parseVoiceCommand('giảm âm')).toMatchObject({
      action: 'VOL_DOWN',
      irCode: '0x20DFC03F'
    });
    expect(parseVoiceCommand('tắt tiếng')).toMatchObject({
      action: 'MUTE',
      irCode: '0x20DF906F'
    });
  });

  it('identifies TV channel switching commands', () => {
    expect(parseVoiceCommand('mở vtv1')).toMatchObject({
      action: 'CH_VTV1',
      irCode: '0x20DF00FF'
    });
    expect(parseVoiceCommand('mở vtv3')).toMatchObject({
      action: 'CH_VTV3',
      irCode: '0x20DF08F7'
    });
  });

  it('identifies open YouTube app command', () => {
    expect(parseVoiceCommand('mở youtube')).toMatchObject({
      action: 'APP_YOUTUBE',
      irCode: '0x20DF58A7'
    });
    expect(parseVoiceCommand('mo youtube')).toMatchObject({
      action: 'APP_YOUTUBE',
      irCode: '0x20DF58A7'
    });
  });
});

describe('voiceCommandParser - Seam: Regional Dialect Semantics', () => {
  it('handles Northern & Central dialect expressions (vô tuyến, đài, thời sự)', () => {
    expect(parseVoiceCommand('mở vô tuyến')).toMatchObject({
      action: 'TV_POWER_ON'
    });
    expect(parseVoiceCommand('thời sự')).toMatchObject({
      action: 'CH_VTV1'
    });
    expect(parseVoiceCommand('đừng kêu')).toMatchObject({
      action: 'MUTE'
    });
  });

  it('handles Southern dialect expressions (bự lên, nhỏ lại côi, nghỉ coi, cho coi)', () => {
    expect(parseVoiceCommand('cho bự lên')).toMatchObject({
      action: 'VOL_UP'
    });
    expect(parseVoiceCommand('nhỏ lại côi')).toMatchObject({
      action: 'VOL_DOWN'
    });
    expect(parseVoiceCommand('nghỉ coi tivi')).toMatchObject({
      action: 'TV_POWER_OFF'
    });
    expect(parseVoiceCommand('cho coi tivi')).toMatchObject({
      action: 'TV_POWER_ON'
    });
  });
});

describe('voiceCommandParser - Seam: YouTube Dynamic Entity Extraction', () => {
  it('extracts specific YouTube channel query and generates valid search URL', () => {
    const result = parseVoiceCommand('mở kênh VTV24 trên youtube');
    expect(result).toMatchObject({
      action: 'YOUTUBE_SEARCH',
      channelQuery: 'VTV24',
      youtubeUrl: 'https://www.youtube.com/results?search_query=VTV24',
      irCode: '0x20DF58A7'
    });
  });

  it('strips polite/padding words and extracts music/video topics', () => {
    const result = parseVoiceCommand('mở ca nhạc trữ tình trên mạng cho tôi');
    expect(result).toMatchObject({
      action: 'YOUTUBE_SEARCH',
      channelQuery: 'Ca nhạc trữ tình'
    });
    expect(result.youtubeUrl).toContain('search_query=');
  });

  it('detects traditional music or drama intent without explicit mention of youtube', () => {
    const result = parseVoiceCommand('nghe cải lương hồ quảng');
    expect(result).toMatchObject({
      action: 'YOUTUBE_SEARCH',
      channelQuery: 'Cải lương hồ quảng'
    });
  });

  it('extracts query when pattern is "tìm trên youtube [query]" or "lên youtube tìm [query]"', () => {
    const res1 = parseVoiceCommand('tìm trên youtube bài hát cắt đôi nỗi sầu');
    expect(res1).toMatchObject({
      action: 'YOUTUBE_SEARCH',
      channelQuery: 'Bài hát cắt đôi nỗi sầu'
    });

    const res2 = parseVoiceCommand('lên youtube tìm review xe điện vinfast');
    expect(res2).toMatchObject({
      action: 'YOUTUBE_SEARCH',
      channelQuery: 'Review xe điện vinfast'
    });
  });

  it('detects karaoke and search intent even without explicit mention of youtube', () => {
    const res = parseVoiceCommand('bật karaoke duyên phận tone nam');
    expect(res).toMatchObject({
      action: 'YOUTUBE_SEARCH',
      channelQuery: 'Karaoke duyên phận tone nam'
    });
  });
});

describe('voiceCommandParser - Seam: Air Conditioner (AC) Controls', () => {
  it('extracts fan speed modes (low, med, high, auto) from voice command', () => {
    const resLow = parseVoiceCommand('bật điều hòa 25 độ quạt gió nhẹ');
    expect(resLow).toMatchObject({
      action: 'SET',
      temp: 25,
      fan: 'low'
    });

    const resHigh = parseVoiceCommand('máy lạnh 22 độ quạt mạnh');
    expect(resHigh).toMatchObject({
      action: 'SET',
      temp: 22,
      fan: 'high'
    });

    const resMedium = parseVoiceCommand('bật âm trần 23 độ quạt vừa');
    expect(resMedium).toMatchObject({
      action: 'SET',
      deviceId: 'ac_funiki',
      temp: 23,
      fan: 'medium',
      hasExplicitTemp: true,
      hasExplicitFan: true
    });

    const resOffCeiling = parseVoiceCommand('tắt âm trần đi');
    expect(resOffCeiling).toMatchObject({
      action: 'POWER_OFF',
      deviceId: 'ac_funiki',
      power: false
    });
  });

  it('clamps out-of-range temperatures between 16°C and 30°C per AC specs', () => {
    const resTooLow = parseVoiceCommand('bật điều hòa 10 độ');
    expect(resTooLow.temp).toBe(16);

    const resTooHigh = parseVoiceCommand('máy lạnh 35 độ');
    expect(resTooHigh.temp).toBe(30);
  });

  it('recognizes standalone temperature phrases like "24 độ", "đặt 25 độ"', () => {
    const res1 = parseVoiceCommand('24 độ');
    expect(res1).toMatchObject({
      action: 'SET',
      deviceId: 'ac_funiki',
      temp: 24,
      power: true
    });

    const res2 = parseVoiceCommand('đặt 26 độ');
    expect(res2).toMatchObject({
      action: 'SET',
      deviceId: 'ac_funiki',
      temp: 26,
      power: true
    });
  });

  it('recognizes comfort phrases "nóng quá" and "lạnh quá"', () => {
    const hot = parseVoiceCommand('nóng quá');
    expect(hot).toMatchObject({
      action: 'SET',
      deviceId: 'ac_funiki',
      temp: 22,
      fan: 'high'
    });

    const cold = parseVoiceCommand('lạnh quá đi');
    expect(cold).toMatchObject({
      action: 'SET',
      deviceId: 'ac_funiki',
      temp: 26,
      fan: 'low'
    });
  });
});

describe('voiceCommandParser - Seam: Custom Remotes & Voice Aliases', () => {
  const mockCustomRemotes = [
    {
      id: 'rem_fan',
      name: 'Quạt Senko',
      deviceId: 'fan_living',
      buttons: [
        {
          id: 'btn_swing',
          label: 'Đảo gió',
          action: 'SWING',
          voiceAliases: ['quay quạt', 'đảo gió', 'xoay quạt'],
          ir: { protocol: 'NEC', code: '0x00FF5AA5', bits: 32 }
        },
        {
          id: 'btn_fan_off',
          label: 'Tắt quạt',
          action: 'POWER_OFF',
          voiceAliases: ['tắt quạt senko', 'nghỉ quạt'],
          ir: { protocol: 'NEC', code: '0x00FF1234', bits: 32 }
        }
      ]
    }
  ];

  it('matches custom remote button by voice alias even with dialect/tone differences', () => {
    const res = parseVoiceCommand('làm ơn quay quat cho mát', mockCustomRemotes);
    expect(res).not.toBeNull();
    expect(res.action).toBe('SWING');
    expect(res.deviceId).toBe('fan_living');
    expect(res.irCode).toBe('0x00FF5AA5');
    expect(res.ir).toEqual({ protocol: 'NEC', code: '0x00FF5AA5', bits: 32 });
  });

  it('prioritizes custom remote voice alias over generic TV power off', () => {
    const res = parseVoiceCommand('tắt quạt senko đi', mockCustomRemotes);
    expect(res).not.toBeNull();
    expect(res.action).toBe('POWER_OFF');
    expect(res.deviceId).toBe('fan_living');
    expect(res.device).toBe('Quạt Senko');
  });
});


