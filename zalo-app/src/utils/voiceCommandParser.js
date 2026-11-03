export const IR_COMMANDS = [
  {
    keywords: [
      'mở youtube', 'bật youtube', 'xem youtube', 'vào youtube', 'mở yt', 'bật yt', 'youtube', 'yt',
      'mở vô túp', 'bật vô túp', 'coi vô túp', 'mở du túp', 'bật du túp', 'coi du túp', 'xem du túp',
      'mở du tu be', 'vô túp côi', 'du túp coi', 'mở mạng coi'
    ],
    action: 'APP_YOUTUBE',
    title: 'Mở ứng dụng YouTube',
    irCode: '0x20DF58A7',
    device: 'Smart TV (Hồng ngoại)',
    icon: '▶️',
    description: 'Phát mã IR mở trực tiếp ứng dụng YouTube trên TV'
  },
  {
    keywords: [
      'bật tivi', 'bật tv', 'mở tivi', 'mở tv', 'khởi động tivi', 'bật màn hình',
      'bật đài', 'mở đài', 'bật ti di', 'mở ti di', 'bật vô tuyến', 'mở vô tuyến',
      'bật tivi lên', 'mở tivi lên', 'bật tivi côi', 'mở tivi côi', 'bật dùm tivi', 'mở giùm tivi',
      'cho coi tivi', 'cho xem tivi'
    ],
    action: 'TV_POWER_ON',
    title: 'Bật nguồn Tivi',
    irCode: '0x20DF10EF',
    device: 'Smart TV (Hồng ngoại)',
    icon: '📺',
    description: 'Phát xung IR Power On để bật Tivi'
  },
  {
    keywords: [
      'tắt tivi', 'tắt tv', 'đóng tivi', 'tắt màn hình', 'tắt đài', 'tắt ti di', 'tắt vô tuyến',
      'tắt tivi côi', 'tắt giùm tivi', 'tắt dùm tivi', 'nghỉ coi tivi', 'thôi coi tivi', 'tắt máy đi'
    ],
    action: 'TV_POWER_OFF',
    title: 'Tắt nguồn Tivi',
    irCode: '0x20DF10EF',
    device: 'Smart TV (Hồng ngoại)',
    icon: '🔌',
    description: 'Phát xung IR Power Off để tắt Tivi'
  },
  {
    keywords: [
      'tăng âm', 'to lên', 'tăng volume', 'tăng tiếng', 'to tiếng', 'cho to lên', 'vặn to lên',
      'lớn lên', 'bự lên', 'cho lớn tiếng', 'kêu to lên', 'to lên côi', 'to lên chút', 'bự lên chút'
    ],
    action: 'VOL_UP',
    title: 'Tăng âm lượng (+)',
    irCode: '0x20DF40BF',
    device: 'Smart TV (Hồng ngoại)',
    icon: '🔊',
    description: 'Phát xung IR Volume Up (+)'
  },
  {
    keywords: [
      'giảm âm', 'nhỏ lại', 'giảm volume', 'giảm tiếng', 'nhỏ tiếng', 'cho nhỏ lại', 'vặn nhỏ lại',
      'bớt tiếng', 'hạ tiếng', 'nhỏ bớt', 'bé lại', 'nhỏ lại côi', 'nhỏ lại chút', 'bớt ồn'
    ],
    action: 'VOL_DOWN',
    title: 'Giảm âm lượng (-)',
    irCode: '0x20DFC03F',
    device: 'Smart TV (Hồng ngoại)',
    icon: '🔉',
    description: 'Phát xung IR Volume Down (-)'
  },
  {
    keywords: [
      'tắt tiếng', 'im lặng', 'mute', 'câm', 'ngắt tiếng', 'đừng kêu'
    ],
    action: 'MUTE',
    title: 'Tắt tiếng (Mute)',
    irCode: '0x20DF906F',
    device: 'Smart TV (Hồng ngoại)',
    icon: '🔇',
    description: 'Tắt/Bật tiếng tạm thời'
  },
  {
    keywords: ['vtv1', 'kênh vtv1', 'mở vtv1', 'kênh 1', 'đài vtv1'],
    action: 'CH_VTV1',
    title: 'Chuyển sang kênh VTV1',
    irCode: '0x20DF00FF',
    device: 'Smart TV (Hồng ngoại)',
    icon: '📡',
    description: 'Chọn kênh truyền hình số 1'
  },
  {
    keywords: ['vtv3', 'kênh vtv3', 'mở vtv3', 'kênh 3', 'đài vtv3'],
    action: 'CH_VTV3',
    title: 'Chuyển sang kênh VTV3',
    irCode: '0x20DF08F7',
    device: 'Smart TV (Hồng ngoại)',
    icon: '📡',
    description: 'Chọn kênh truyền hình số 3'
  }
];

export const REGIONAL_VOCABULARY = {
  YOUTUBE: [
    'youtube', 'yt', 'du tup', 'du tup be', 'du tu be', 'vo tup', 'u tup', 'du túp', 
    'du tu bê', 'vô túp', 'u túp', 'mở mạng', 'xem mạng', 'xem clip', 'video'
  ],
  TV: [
    'tivi', 'ti vi', 'ti di', 'tivi', 'tv', 'đài', 'dai', 'vô tuyến', 'vo tuyen', 'truyền hình', 'màn hình'
  ],
  POWER_ON: [
    'bật', 'mở', 'khởi động', 'lên', 'cho coi', 'cho xem', 'bật lên', 'mở lên', 'xem tivi'
  ],
  POWER_OFF: [
    'tắt', 'đóng', 'tắt đi', 'nghỉ coi', 'thôi coi', 'tắt dùm', 'tắt giùm', 'tắt máy'
  ],
  VOL_UP: [
    'to lên', 'to hơn', 'lớn lên', 'lớn hơn', 'tăng âm', 'tăng tiếng', 'bự lên', 'bự hơn', 
    'vặn to', 'kêu to', 'cho to', 'to tiếng', 'lớn tiếng'
  ],
  VOL_DOWN: [
    'nhỏ lại', 'nhỏ hơn', 'bớt tiếng', 'giảm âm', 'giảm tiếng', 'hạ tiếng', 'vặn nhỏ', 
    'nhỏ bớt', 'cho nhỏ', 'nhỏ tiếng', 'bé lại'
  ],
  MUTE: [
    'tắt tiếng', 'im lặng', 'câm', 'mute', 'ngắt tiếng', 'đừng kêu'
  ]
};

export function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Phân tích giọng nói với hỗ trợ Remote ảo (customRemotes) và Điều hòa (Specs 7.3)
 */
export function parseVoiceCommand(text, customRemotes = []) {
  if (!text || !text.trim()) {
    return null;
  }

  const lower = text.toLowerCase().trim();
  const noTone = removeVietnameseTones(lower);

  // 0. So khớp với các nút của Remote ảo tự tạo (voiceAliases) (Specs 7.3)
  if (Array.isArray(customRemotes)) {
    for (const remote of customRemotes) {
      if (!remote.buttons || !Array.isArray(remote.buttons)) continue;
      for (const btn of remote.buttons) {
        const aliases = btn.voiceAliases || [];
        const btnLabel = btn.label || '';
        const match = aliases.some(alias => {
          const aLower = alias.toLowerCase().trim();
          const aNoTone = removeVietnameseTones(aLower);
          return lower.includes(aLower) || noTone.includes(aNoTone);
        }) || (btnLabel && (lower.includes(btnLabel.toLowerCase()) || noTone.includes(removeVietnameseTones(btnLabel))));

        if (match) {
          const irData = btn.ir || {
            protocol: btn.protocol || 'NEC',
            code: btn.irCode || btn.code || '0x00000000',
            bits: btn.bits || 32
          };
          return {
            action: btn.action || 'CUSTOM_ACTION',
            title: btn.label || 'Nút tuỳ chỉnh',
            deviceId: remote.deviceId || 'custom_device',
            irCode: irData.code || '0x00000000',
            ir: irData,
            device: remote.name || 'Remote ảo',
            icon: '✨',
            description: `Khớp lệnh từ remote ảo [${remote.name}] - Nút: ${btn.label}`
          };
        }
      }
    }
  }

  // 1. Phân tích lệnh Điều hòa (AC Commands - Specs 6.2, Contracts 3.3)
  const standaloneTempMatch = lower.match(/(?:cho|đặt|bật|hạ|tăng|xuống|lên|mở)?\s*(\d{1,2})\s*(?:độ|do|c)(?:\b|\s|$)/i) ||
                              lower.match(/(?:^|\s)(\d{1,2})\s*(?:độ|do|c)(?:\b|\s|$)/i);
  const isComfortPhrase = lower.includes('nóng quá') || lower.includes('nong qua') || 
                          lower.includes('lạnh quá') || lower.includes('lanh qua') ||
                          lower.includes('nóng thế') || lower.includes('lạnh thế') ||
                          lower.includes('trời nóng') || lower.includes('trời lạnh') ||
                          lower.includes('phòng nóng') || lower.includes('phòng lạnh') ||
                          lower.includes('nực quá') || lower.includes('oi bức');
  const isAcMention = lower.includes('điều hòa') || lower.includes('điều hoà') || 
                      lower.includes('dieu hoa') || noTone.includes('dieu hoa') ||
                      lower.includes('máy lạnh') || lower.includes('may lanh') ||
                      noTone.includes('may lanh') ||
                      lower.includes('máy điều hòa') || lower.includes('máy điều hoà') ||
                      lower.includes('âm trần') || noTone.includes('am tran') ||
                      lower.includes('cassette') || lower.includes('daikin') ||
                      lower.includes('nhiệt độ') || noTone.includes('nhiet do') ||
                      Boolean(standaloneTempMatch) || isComfortPhrase;

  if (isAcMention) {
    // Tắt điều hòa
    if (lower.includes('tắt') || lower.includes('tat') || lower.includes('đóng') || lower.includes('nghỉ')) {
      return {
        action: 'POWER_OFF',
        title: 'Tắt điều hòa',
        deviceId: 'ac_funiki',
        device: 'Điều hòa (Hồng ngoại)',
        power: false,
        icon: '❄️',
        description: 'Phát tín hiệu tắt điều hòa'
      };
    }

    // Cảm thán nhiệt độ nóng/lạnh tự nhiên
    if (lower.includes('nóng quá') || lower.includes('nong qua') || lower.includes('nóng thế') || lower.includes('nực quá')) {
      return {
        action: 'SET',
        title: 'Bật điều hòa 22°C (Làm mát)',
        deviceId: 'ac_funiki',
        device: 'Điều hòa (Hồng ngoại)',
        power: true,
        temp: 22,
        mode: 'cool',
        fan: 'high',
        icon: '❄️',
        description: 'Làm mát nhanh khi phòng quá nóng'
      };
    }
    if (lower.includes('lạnh quá') || lower.includes('lanh qua') || lower.includes('lạnh thế')) {
      return {
        action: 'SET',
        title: 'Tăng điều hòa lên 26°C',
        deviceId: 'ac_funiki',
        device: 'Điều hòa (Hồng ngoại)',
        power: true,
        temp: 26,
        mode: 'cool',
        fan: 'low',
        icon: '❄️',
        description: 'Tăng nhiệt độ khi phòng quá lạnh'
      };
    }

    // Đặt nhiệt độ cụ thể (VD: "bật điều hòa 24 độ", "đặt 26 độ", "24 độ" -> kẹp 16-30 độ)
    const tempMatch = standaloneTempMatch || lower.match(/(?:đặt|bật|cho|xuống|lên|mở|hạ|tăng)?\s*(\d{1,2})\s*(?:độ|do|c)/i);
    let targetTemp = 24;
    let hasExplicitTemp = false;
    if (tempMatch && tempMatch[1]) {
      hasExplicitTemp = true;
      const parsedTemp = parseInt(tempMatch[1], 10);
      if (parsedTemp >= 16 && parsedTemp <= 30) {
        targetTemp = parsedTemp;
      } else if (parsedTemp < 16) {
        targetTemp = 16;
      } else if (parsedTemp > 30) {
        targetTemp = 30;
      }
    } else if (lower.includes('hạ') || lower.includes('giảm') || lower.includes('mát hơn')) {
      hasExplicitTemp = true;
      targetTemp = 22;
    } else if (lower.includes('tăng') || lower.includes('ấm hơn')) {
      hasExplicitTemp = true;
      targetTemp = 26;
    }

    // Chế độ (mode)
    let acMode = 'cool';
    let hasExplicitMode = false;
    if (lower.includes('hút ẩm') || lower.includes('khô') || noTone.includes('hut am') || lower.includes('dry')) {
      acMode = 'dry';
      hasExplicitMode = true;
    } else if (lower.includes('chế độ quạt') || lower.includes('chỉ quạt') || lower.includes('bật quạt điều hòa')) {
      acMode = 'fan';
      hasExplicitMode = true;
    } else if (lower.includes('sưởi') || lower.includes('heat')) {
      acMode = 'heat';
      hasExplicitMode = true;
    } else if (lower.includes('tự động') || lower.includes('auto')) {
      acMode = 'auto';
      hasExplicitMode = true;
    } else if (lower.includes('làm lạnh') || lower.includes('làm mát') || lower.includes('cool')) {
      acMode = 'cool';
      hasExplicitMode = true;
    }

    // Tốc độ quạt (fan speed)
    let acFan = 'auto';
    let hasExplicitFan = false;
    if (lower.includes('quạt mạnh') || lower.includes('gió mạnh') || lower.includes('quat manh') || lower.includes('gio manh') || lower.includes('quạt lớn') || lower.includes('fan high')) {
      acFan = 'high';
      hasExplicitFan = true;
    } else if (lower.includes('quạt nhẹ') || lower.includes('gió nhẹ') || lower.includes('quat nhe') || lower.includes('gio nhe') || lower.includes('quạt êm') || lower.includes('quạt nhỏ') || lower.includes('fan low')) {
      acFan = 'low';
      hasExplicitFan = true;
    } else if (lower.includes('quạt vừa') || lower.includes('gió vừa') || lower.includes('quat vua') || lower.includes('gio vua') || lower.includes('fan med')) {
      acFan = 'medium';
      hasExplicitFan = true;
    } else if (lower.includes('quạt tự động') || lower.includes('gió tự động') || lower.includes('fan auto')) {
      acFan = 'auto';
      hasExplicitFan = true;
    }

    return {
      action: 'SET',
      title: `Bật điều hòa ${targetTemp}°C (${acMode})`,
      deviceId: 'ac_funiki',
      device: 'Điều hòa (Hồng ngoại)',
      power: true,
      temp: targetTemp,
      hasExplicitTemp,
      hasExplicitMode,
      hasExplicitFan,
      mode: acMode,
      fan: acFan,
      icon: '❄️',
      description: `Đặt điều hòa nhiệt độ ${targetTemp}°C, chế độ ${acMode}, quạt ${acFan}`
    };
  }

  // 2. Bóc tách kênh hoặc nội dung YouTube cụ thể
  const ytKeywords = ['youtube', 'yt', 'du tup', 'du túp', 'vo tup', 'vô túp', 'u tup', 'u túp', 'mạng'];
  const hasYtMention = ytKeywords.some(k => lower.includes(k) || noTone.includes(k));

  let extractedChannel = '';

  const channelMatch = text.match(/(?:mở|bật|vào|xem|coi)\s+(?:kênh|kenh)\s+([^,.]+)/i);
  if (channelMatch && channelMatch[1]) {
    extractedChannel = channelMatch[1].replace(/(?:trên|tren)\s+(?:youtube|yt|du\s*túp|du\s*tup|vô\s*túp|vo\s*tup|mạng)/gi, '').trim();
  }

  // Mẫu: "tìm trên youtube [nội dung]", "xem trên mạng [nội dung]"
  if (!extractedChannel && hasYtMention) {
    const findOnYtMatch = text.match(/(?:tìm|kiếm|tìm kiếm|search|mở|bật|xem|coi)\s+(?:trên|ở)\s+(?:youtube|yt|du\s*túp|du\s*tup|vô\s*túp|vo\s*tup|mạng)\s+(.+)/i);
    if (findOnYtMatch && findOnYtMatch[1]) {
      extractedChannel = findOnYtMatch[1].trim();
    }
  }

  // Mẫu: "[nội dung] trên youtube"
  if (!extractedChannel && hasYtMention) {
    const onYtMatch = text.match(/(?:mở|bật|vào|xem|coi|nghe|tìm|kiếm|tìm kiếm)\s+(.+?)\s+(?:trên|tren|ở)\s+(?:youtube|yt|du\s*túp|du\s*tup|vô\s*túp|vo\s*tup|mạng)/i);
    if (onYtMatch && onYtMatch[1]) {
      extractedChannel = onYtMatch[1].replace(/^(?:kênh|kenh)\s+/i, '').trim();
    }
  }

  // Mẫu: "(lên|vào|mở) youtube (tìm|kiếm|xem|coi|bật|mở|nghe) [nội dung]"
  if (!extractedChannel && hasYtMention) {
    const enterYtMatch = text.match(/(?:vào|vao|mở|mo|bật|bat|lên|len)\s+(?:youtube|yt|du\s*túp|du\s*tup|vô\s*túp|vo\s*tup|mạng)\s+(?:xem|coi|bật|mở|nghe|tìm|kiếm|tìm kiếm)\s+(.+)/i);
    if (enterYtMatch && enterYtMatch[1]) {
      extractedChannel = enterYtMatch[1].replace(/^(?:kênh|kenh)\s+/i, '').trim();
    }
  }

  // Mẫu: Nhạc, karaoke, clip, phim, hài (kể cả không nói từ youtube)
  if (!extractedChannel) {
    const musicMatch = text.match(/^(?:mở|bật|nghe|cho nghe|cho coi|cho xem|tìm|kiếm|hát)\s+(nhạc\s+[^,.]+|ca nhạc\s+[^,.]+|karaoke\s+[^,.]+|cải lương\s+[^,.]+|hài\s+[^,.]+|phim\s+[^,.]+|video\s+[^,.]+|clip\s+[^,.]+)/i);
    if (musicMatch && musicMatch[1] && !lower.includes('tivi') && !lower.includes('đài') && !lower.includes('điều hòa') && !lower.includes('điều hoà')) {
      extractedChannel = musicMatch[1].trim();
    }
  }

  if (extractedChannel) {
    extractedChannel = extractedChannel
      .replace(/\s+(?:cho\s+tao|cho\s+tôi|cho\s+em|cho\s+anh|giúp|dùm|giùm|với|nhé|nha|đi|coi|xem)$/gi, '')
      .trim();

    const lowerChan = extractedChannel.toLowerCase();
    const isExplicitYoutube = lower.includes('youtube') || lower.includes('yt') || noTone.includes('du tup') || noTone.includes('vo tup');
    const isTvBroadcast = !isExplicitYoutube && (lowerChan.includes('vtv') || lowerChan.includes('htv') || lowerChan.includes('thời sự') || lowerChan.includes('truyền hình'));

    if (!isTvBroadcast && extractedChannel.length > 1 && !['youtube', 'yt', 'du tup', 'du túp'].includes(lowerChan)) {
      const cleanTitle = extractedChannel.charAt(0).toUpperCase() + extractedChannel.slice(1);
      return {
        action: 'YOUTUBE_SEARCH',
        title: `Mở kênh "${cleanTitle}" trên YouTube`,
        channelQuery: cleanTitle,
        youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTitle)}`,
        irCode: '0x20DF58A7',
        device: 'Smart TV (Hồng ngoại + Cast)',
        icon: '▶️',
        description: `Phát mã IR mở YouTube trên TV và mở luồng kênh "${cleanTitle}" để Cast`
      };
    }
  }

  // 3. So khớp với danh sách IR commands cơ bản
  for (const cmd of IR_COMMANDS) {
    if (
      cmd.keywords.some((keyword) => {
        const lowerKeyword = keyword.toLowerCase();
        const noToneKeyword = removeVietnameseTones(keyword);
        return lower.includes(lowerKeyword) || noTone.includes(noToneKeyword);
      })
    ) {
      return cmd;
    }
  }

  // 4. Thuật toán phân tích ngữ nghĩa phương ngữ 3 miền (Dialect Semantic Intent Matching)
  const hasYouTube = REGIONAL_VOCABULARY.YOUTUBE.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));
  const hasTV = REGIONAL_VOCABULARY.TV.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));
  const hasOn = REGIONAL_VOCABULARY.POWER_ON.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));
  const hasOff = REGIONAL_VOCABULARY.POWER_OFF.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));
  const hasVolUp = REGIONAL_VOCABULARY.VOL_UP.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));
  const hasVolDown = REGIONAL_VOCABULARY.VOL_DOWN.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));
  const hasMute = REGIONAL_VOCABULARY.MUTE.some(w => lower.includes(w) || noTone.includes(removeVietnameseTones(w)));

  if (hasYouTube) {
    return IR_COMMANDS.find(c => c.action === 'APP_YOUTUBE');
  }
  if (lower.includes('vtv1') || lower.includes('thời sự') || noTone.includes('thoi su') || lower.includes('kênh 1')) {
    return IR_COMMANDS.find(c => c.action === 'CH_VTV1');
  }
  if (lower.includes('vtv3') || lower.includes('kênh 3') || noTone.includes('kenh 3')) {
    return IR_COMMANDS.find(c => c.action === 'CH_VTV3');
  }
  if (hasVolUp) {
    return IR_COMMANDS.find(c => c.action === 'VOL_UP');
  }
  if (hasVolDown) {
    return IR_COMMANDS.find(c => c.action === 'VOL_DOWN');
  }
  if (hasMute) {
    return IR_COMMANDS.find(c => c.action === 'MUTE');
  }
  if (hasOff && (hasTV || lower.includes('tivi') || lower.includes('tv') || lower.includes('đài') || lower.includes('màn hình') || lower.includes('vô tuyến') || lower.includes('nghỉ coi') || lower.includes('thôi coi'))) {
    return IR_COMMANDS.find(c => c.action === 'TV_POWER_OFF');
  }
  if (hasOn && (hasTV || lower.includes('tivi') || lower.includes('tv') || lower.includes('đài') || lower.includes('màn hình') || lower.includes('vô tuyến') || lower.includes('xem tivi') || lower.includes('coi tivi'))) {
    return IR_COMMANDS.find(c => c.action === 'TV_POWER_ON');
  }

  return {
    action: 'UNKNOWN',
    title: 'Lệnh chưa được cấu hình',
    irCode: '0x00000000',
    device: 'Chưa xác định',
    icon: '❓',
    description: `Chưa có mã hồng ngoại tương ứng cho câu nói "${text}"`
  };
}
