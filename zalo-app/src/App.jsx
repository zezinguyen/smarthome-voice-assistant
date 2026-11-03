import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { analyzeVoiceWithGemini, transcribeAndAnalyzeAudioWithGemini } from './services/geminiService';
import { getIotConfig, saveIotConfig, sendIotCommand } from './services/iotService';
import { parseVoiceCommand } from './utils/voiceCommandParser';
import {
  getAudioInputDevices,
  pickDefaultMicrophone,
  isVirtualOrUnwantedMic,
  testMicrophone,
  startAudioCapture
} from './utils/audioCaptureManager';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  testSupabaseConnection
} from './services/supabaseClient';
import {
  fetchHomeData,
  pairBoardWithCode,
  fetchPendingLearnedCodes,
  assignLearnedCode,
  recordVoiceCommandLog,
  subscribeHomeRealtime,
  createHomeInvite,
  joinHomeWithInvite,
  removeHomeMember
} from './services/supabaseService';
import { SUPABASE_SCHEMA_SQL } from './services/supabaseSchema';
import AcSetupModal from './components/AcSetupModal';
import TvSetupModal from './components/TvSetupModal';
import { fetchBoardProfile, getAcProtocolLabel, isTogglePowerAcProtocol, saveAcProtocol } from './services/profileSetupService';



// Vì sao lần nghe không ra chữ: nhận giọng nói của trình duyệt lỗi và không có bản ghi để gửi AI
function describeVoiceIssue({ captureError, speechError, hasRecording, hasApiKey }) {
  if (speechError === 'not-allowed') {
    return 'Quyền Micro bị từ chối. Bạn vui lòng bấm vào biểu tượng Micro/Ổ khoá trên thanh địa chỉ trình duyệt để Cho phép (Allow)!';
  }
  if (speechError === 'network') {
    return 'Lỗi kết nối máy chủ nhận diện Google (network). Vui lòng kiểm tra lại mạng Internet hoặc thử nói lại!';
  }
  if (speechError === 'audio-capture') {
    return 'Không tìm thấy thiết bị Microphone đang hoạt động trên máy tính!';
  }
  if (!hasRecording && captureError) {
    const reason = `${captureError.name || 'Lỗi'}: ${captureError.message || ''}`.trim();
    return `Không mở được micro (${reason}). Hãy kiểm tra micro trong Cài đặt!`;
  }
  return 'Chưa phát hiện giọng nói. Hãy bấm vào nút Micro và nói to rõ ngay nhé!';
}

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [parsedCommand, setParsedCommand] = useState(null);
  const [actionToast, setActionToast] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showAcSetup, setShowAcSetup] = useState(false);
  const [showTvSetup, setShowTvSetup] = useState(false);
  const [acProtocol, setAcProtocol] = useState(() => localStorage.getItem('smart_home_ac_protocol') || 'DAIKIN64');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showFamilyModal, setShowFamilyModal] = useState(false);

  // Thành viên gia đình cùng dùng chung mạch (Specs 4.4 Multi-user)
  const [homeMembers, setHomeMembers] = useState([
    {
      id: 'mem_owner',
      userId: '00000000-0000-0000-0000-0000000000aa',
      role: 'owner',
      displayName: 'Nguyễn Văn An',
      createdAt: new Date().toISOString()
    }
  ]);
  const [activeInvite, setActiveInvite] = useState({
    inviteCode: 'H84K92',
    role: 'member',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    usedCount: 1,
    maxUses: 10
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [joinInviteInput, setJoinInviteInput] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMessage, setJoinMessage] = useState(null);
  const [currentUserId] = useState(() => {
    let id = localStorage.getItem('smart_home_user_id');
    if (!id) {
      id = '00000000-0000-0000-0000-0000000000aa';
      localStorage.setItem('smart_home_user_id', id);
    }
    return id;
  });
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState(() => {
    return localStorage.getItem('smart_home_user_name') || 'Nguyễn Văn An';
  });

  // Danh sách mạch phần cứng ESP32 trong nhà (Specs 4.4, Contracts 3.6)
  const [boards, setBoards] = useState([
    {
      id: 'board_living_01',
      name: 'Mạch IR Phòng Khách',
      room: 'Phòng khách',
      battery: 85,
      charging: false,
      usb: true,
      rssi: -58,
      firmware: '0.1.0',
      isOnline: true
    }
  ]);

  // Danh sách thiết bị trong nhà (Quạt, Điều hòa, TV)
  const [devices, setDevices] = useState([
    { id: 'tv_living', boardId: 'board_living_01', name: 'Tivi LG Phòng Khách', room: 'Phòng khách', type: 'tv', active: false, statusText: 'Đã tắt' },
    { id: 'ac_funiki', boardId: 'board_living_01', name: 'Điều hòa Âm trần Daikin', room: 'Phòng khách', type: 'ac', active: false, temp: 24, mode: 'cool', fan: 'auto', statusText: 'Đã tắt' }
  ]);

  // Remote ảo tự tạo & Mã học từ nút bấm (Specs 7.1)
  const [customRemotes, setCustomRemotes] = useState([]);
  const [pendingCodes, setPendingCodes] = useState([]);
  const [selectedCodeToAssign, setSelectedCodeToAssign] = useState(null);
  const [assignDeviceId, setAssignDeviceId] = useState('ac_funiki');
  const [assignLabel, setAssignLabel] = useState('Bật/Tắt điều hòa');
  const [assignAction, setAssignAction] = useState('AC_POWER');
  const [assignAliases, setAssignAliases] = useState('bật điều hòa, tắt điều hòa, mở điều hòa, đóng điều hòa');

  // Ghép đôi mạch mới
  const [pairingInputCode, setPairingInputCode] = useState('');
  const [pairingBoardName, setPairingBoardName] = useState('Mạch IR Phòng Ngủ');
  const [pairingRoom, setPairingRoom] = useState('Phòng ngủ');
  const [pairingLoading, setPairingLoading] = useState(false);

  // Điều hòa State
  const [acTemp, setAcTemp] = useState(24);
  const [acMode, setAcMode] = useState('cool');
  const [acFan, setAcFan] = useState('auto');

  // Cấu hình Supabase Backend
  const [supabaseUrl, setSupabaseUrl] = useState(() => getSupabaseConfig().url);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(() => getSupabaseConfig().anonKey);
  const [supabasePingResult, setSupabasePingResult] = useState('');
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [isSupabaseOnline, setIsSupabaseOnline] = useState(() => isSupabaseConfigured());
  const [sqlCopied, setSqlCopied] = useState(false);
  const [textCommandInput, setTextCommandInput] = useState('');

  // Cấu hình IoT
  const [iotAutoSend, setIotAutoSend] = useState(() => getIotConfig().autoSend);
  const [iotTvBrand, setIotTvBrand] = useState(() => getIotConfig().tvBrand);
  const [iotAcBrand, setIotAcBrand] = useState(() => getIotConfig().acBrand || 'Panasonic');

  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState(() => {
    return localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || 'sk-39de97d6695c5a0c3919ca96e19f3f86574ac5d3c72c41e0b3b2136d471b048a';
  });
  const geminiApiKey = geminiApiKeyInput || 'sk-39de97d6695c5a0c3919ca96e19f3f86574ac5d3c72c41e0b3b2136d471b048a';

  // Quản lý thu âm & Sóng âm trực tiếp
  const audioCaptureRef = useRef(null);
  const micTestControllerRef = useRef(null);
  const [liveVolume, setLiveVolume] = useState(0);
  const [frequencyBands, setFrequencyBands] = useState(() => new Array(20).fill(0));

  // Thiết bị Micro
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testLiveVol, setTestLiveVol] = useState(0);
  const [testRecordedAudioUrl, setTestRecordedAudioUrl] = useState('');

  const recognitionRef = useRef(null);
  // Lý do lần nghe gần nhất không có kết quả, để báo đúng cho người dùng
  const voiceIssueRef = useRef({ captureError: null, speechError: null });
  const sessionIdRef = useRef(0);
  const sessionStartTimeRef = useRef(0);
  const isListeningRef = useRef(false);
  const isStartingRef = useRef(false);
  const commandHandledRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const currentTranscriptRef = useRef('');
  const maxSessionTimerRef = useRef(null);
  const maxSessionVolumeRef = useRef(0);

  // Đọc phản hồi bằng giọng nói tiếng Việt
  const speakFeedback = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch { }
  };

  const showNotification = (msg) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(''), 4000);
  };

  const handleToggleTestMic = async () => {
    if (isTestingMic) {
      if (micTestControllerRef.current) {
        micTestControllerRef.current.stop();
        micTestControllerRef.current = null;
      }
      setIsTestingMic(false);
      setTestLiveVol(0);
    } else {
      setIsTestingMic(true);
      setTestRecordedAudioUrl('');
      try {
        const ctrl = await testMicrophone(selectedDeviceId, {
          onVolume: (vol) => setTestLiveVol(vol),
          onRecordedUrl: (url) => setTestRecordedAudioUrl(url),
          onError: (err) => {
            showNotification('Lỗi khi mở micro: ' + (err.message || err.name));
            setIsTestingMic(false);
          }
        });
        micTestControllerRef.current = ctrl;
      } catch (e) {
        showNotification('Không thể mở micro: ' + e.message);
        setIsTestingMic(false);
      }
    }
  };

  // Tải dữ liệu ban đầu từ Supabase (Homes, Boards, Devices, Remotes, Pending Codes)
  const refreshHomeData = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const data = await fetchHomeData();
      if (data) {
        setIsSupabaseOnline(true);
        if (data.boards && data.boards.length > 0) setBoards(data.boards);
        if (data.devices && data.devices.length > 0) {
          // Gộp, không thay thế: thiết bị chỉ có trên mạch (VD ac_funiki) chưa có trong home_devices
          setDevices(prev => [...data.devices, ...prev.filter(d => !data.devices.some(x => x.id === d.id))]);
          const ac = data.devices.find(d => d.type === 'ac');
          if (ac) {
            setAcTemp(ac.temp || 24);
            setAcMode(ac.mode || 'cool');
            if (ac.fan) setAcFan(ac.fan);
          }
        }
        if (data.customRemotes) setCustomRemotes(data.customRemotes);
        if (data.homeMembers && data.homeMembers.length > 0) setHomeMembers(data.homeMembers);
        if (data.activeInvite) setActiveInvite(data.activeInvite);
      }
      const pending = await fetchPendingLearnedCodes();
      setPendingCodes(pending || []);
    } catch (err) {
      console.warn('Lỗi refreshHomeData:', err);
    }
  };

  useEffect(() => {
    refreshHomeData();

    // Đăng ký Supabase Realtime lắng nghe cập nhật thiết bị, mạch, mã học và thành viên
    const unsubscribe = subscribeHomeRealtime({
      onDeviceStateUpdated: (st) => {
        setDevices(prev => prev.map(d => {
          if (d.id === st.device_id) {
            return {
              ...d,
              active: Boolean(st.power),
              temp: st.temp || d.temp,
              mode: st.mode || d.mode,
              fan: st.fan || d.fan,
              statusText: st.power ? `Đang bật (${st.temp || 24}°C)` : 'Đã tắt'
            };
          }
          return d;
        }));
        if (st.device_id === 'ac_funiki') {
          if (st.temp) setAcTemp(st.temp);
          if (st.mode) setAcMode(st.mode);
          if (st.fan) setAcFan(st.fan);
        }
      },
      onBoardUpdated: (board) => {
        setBoards(prev => {
          const exists = prev.some(b => b.id === board.id);
          if (exists) {
            return prev.map(b => {
              if (b.id === board.id) {
                const isOnline = board.isOnline !== undefined
                  ? board.isOnline
                  : (board.last_seen_at ? (Date.now() - new Date(board.last_seen_at).getTime()) <= (6 * 60 * 1000) : false);
                return { ...b, ...board, isOnline };
              }
              return b;
            });
          }
          return [...prev, { name: 'Mạch IR ESP32', room: 'Phòng khách', ...board, isOnline: true }];
        });
      },
      onLearnEvent: (evt) => {
        if (evt.event === 'learn_progress') {
          showNotification(evt.status === 'first_captured' ? '📡 Đã nhận lần 1! Bấm lại lần 2 để xác nhận.' : '⚠️ Mã không khớp, vui lòng bấm lại.');
        } else if (evt.event === 'learn_result') {
          showNotification(evt.status === 'ok' ? '✅ Đã học mã thành công!' : '❌ Học lệnh thất bại.');
        } else if (evt.event === 'learn_timeout') {
          showNotification('⏳ Hết thời gian chờ học lệnh (15 giây).');
        }
      },
      onLearnedCodeAdded: (code) => {
        setPendingCodes(prev => [code, ...prev]);
        showNotification('⚡ Mạch vừa học được mã IR mới từ remote!');
      },
      onMembersUpdated: () => {
        refreshHomeData();
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Tự động quét và chọn Microphone vật lý thực tế (loại bỏ DeskIn/micro ảo, ưu tiên Microphone Array/Realtek)
  useEffect(() => {
    let alive = true;
    getAudioInputDevices().then((devices) => {
      if (!alive || !devices || devices.length === 0) return;
      setAudioDevices(devices);
      const saved = localStorage.getItem('selected_audio_device');
      const savedDev = saved ? devices.find(d => d.deviceId === saved) : null;
      if (savedDev && !isVirtualOrUnwantedMic(savedDev.label)) {
        setSelectedDeviceId(saved);
      } else {
        const best = pickDefaultMicrophone(devices);
        if (best) {
          setSelectedDeviceId(best);
          localStorage.setItem('selected_audio_device', best);
        }
      }
    }).catch((err) => {
      console.warn('Lỗi quét thiết bị microphone lúc khởi động:', err);
    });
    return () => { alive = false; };
  }, []);

  // Đọc giao thức điều hòa đang lưu trên mạch (mạch offline thì giữ "Chọn giao thức")
  useEffect(() => {
    let alive = true;
    fetchBoardProfile().then((res) => {
      if (!alive || !res.ok) return;
      const ac = res.devices.find(d => d.id === 'ac_funiki') || res.devices.find(d => d.type === 'ac' || d.id === 'ac_living');
      if (ac?.acProtocol) {
        const savedLocal = localStorage.getItem('smart_home_ac_protocol');
        if (!savedLocal && ac.acProtocol === 'COOLIX') {
          setAcProtocol('DAIKIN64');
          localStorage.setItem('smart_home_ac_protocol', 'DAIKIN64');
          saveAcProtocol({ deviceId: ac.id || 'ac_funiki', protocol: 'DAIKIN64', name: 'Điều hòa Âm trần Daikin' });
        } else {
          setAcProtocol(ac.acProtocol);
          localStorage.setItem('smart_home_ac_protocol', ac.acProtocol);
        }
      }
    });
    return () => { alive = false; };
  }, []);

  // Xử lý tạo mã mời gia đình mới (Specs 4.4)
  const handleCreateNewInvite = async () => {
    setInviteLoading(true);
    try {
      const res = await createHomeInvite('00000000-0000-0000-0000-000000000001', 'member', currentUserId);
      if (res && res.success) {
        setActiveInvite({
          inviteCode: res.inviteCode,
          role: 'member',
          expiresAt: res.expiresAt,
          usedCount: 0,
          maxUses: 10
        });
        showNotification(`Đã tạo mã mời mới: ${res.inviteCode}`);
      } else {
        showNotification(res.message || 'Lỗi tạo mã mời');
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteCode = () => {
    if (!activeInvite?.inviteCode) return;
    navigator.clipboard.writeText(activeInvite.inviteCode);
    showNotification(`Đã sao chép mã mời [${activeInvite.inviteCode}]!`);
  };

  const handleShareZaloInvite = () => {
    if (!activeInvite?.inviteCode) return;
    const shareText = `Mời bạn cùng tham gia điều khiển Nhà thông minh (Tivi & Điều hòa)! Nhập mã mời: ${activeInvite.inviteCode} trong Zalo Mini App.`;
    if (navigator.share) {
      navigator.share({
        title: 'Mời tham gia Nhà Thông Minh',
        text: shareText
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText);
      showNotification('Đã sao chép nội dung mời Zalo vào bộ nhớ tạm!');
    }
  };

  const handleJoinHomeSubmit = async (e) => {
    e.preventDefault();
    if (!joinInviteInput.trim()) return;
    setJoinLoading(true);
    setJoinMessage(null);
    try {
      const res = await joinHomeWithInvite(joinInviteInput, currentUserId, currentUserDisplayName);
      if (res && res.success) {
        setJoinMessage({ success: true, text: res.message });
        showNotification(res.message);
        setJoinInviteInput('');
        refreshHomeData();
      } else {
        setJoinMessage({ success: false, text: res.message || 'Mã mời không hợp lệ hoặc đã hết hạn' });
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleRemoveMemberClick = async (memberUserId, memberName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn gỡ thành viên [${memberName}] khỏi nhà không? Người này sẽ lập tức mất quyền điều khiển mạch.`)) {
      return;
    }
    const res = await removeHomeMember('00000000-0000-0000-0000-000000000001', memberUserId);
    if (res && res.success) {
      showNotification(`Đã gỡ [${memberName}] thành công`);
      refreshHomeData();
    } else {
      showNotification(res.message || 'Lỗi khi gỡ thành viên');
    }
  };

  // Điều khiển TV
  const handleTvCommand = async (action, title) => {
    const cmd = {
      deviceId: 'tv_living',
      action,
      title,
      device: 'Smart TV (Hồng ngoại)'
    };
    setParsedCommand(cmd);
    speakFeedback(title);
    showNotification(`Đang gửi lệnh: ${title}...`);

    const res = await sendIotCommand(cmd);
    if (res.success) {
      showNotification(res.message);
      // POWER là phím bật/tắt chung: app chỉ đoán trạng thái (IR một chiều, không biết Tivi đang bật hay tắt)
      if (action === 'POWER' || action === 'TV_POWER_ON' || action === 'TV_POWER_OFF') {
        setDevices(prev => prev.map(d => {
          if (d.id !== 'tv_living') return d;
          const active = action === 'POWER' ? !d.active : action === 'TV_POWER_ON';
          return { ...d, active, statusText: active ? 'Đang bật' : 'Đã tắt' };
        }));
      }
    } else {
      showNotification(`Lỗi: ${res.message}`);
    }
  };

  // Điều khiển Điều hòa Âm trần / Treo tường (AC)
  const handleAcControl = async ({
    power,
    temp,
    mode,
    fan,
    forceToggle = false,
    keepPower = false,
    actionOverride,
    syncOnly = false,
  }) => {
    const targetPower = power !== undefined ? Boolean(power) : true;
    const targetTemp = temp !== undefined ? temp : acTemp;
    const targetMode = mode !== undefined ? mode : acMode;
    const targetFan = fan !== undefined ? fan : acFan;
    const targetProtocol = acProtocol || 'DAIKIN64';

    if (temp !== undefined) setAcTemp(targetTemp);
    if (mode !== undefined) setAcMode(targetMode);
    if (fan !== undefined) setAcFan(targetFan);

    // Đồng bộ trạng thái nguồn (khi người dùng vừa bấm remote vật lý, không phát tia IR)
    if (syncOnly || actionOverride === 'SYNC_POWER') {
      setDevices(prev => prev.map(d => (d.id === 'ac_funiki' || d.type === 'ac') ? {
        ...d,
        active: targetPower,
        temp: targetTemp,
        mode: targetMode,
        fan: targetFan,
        statusText: targetPower ? `Đang bật (${targetTemp}°C)` : 'Đã tắt'
      } : d));
      const syncTitle = `Đồng bộ trạng thái: ${targetPower ? 'Đang Bật' : 'Đã Tắt'} (không phát IR)`;
      showNotification(`⇄ ${syncTitle}`);
      await sendIotCommand({
        deviceId: 'ac_funiki',
        action: 'SYNC_POWER',
        title: syncTitle,
        power: targetPower,
        temp: targetTemp,
        mode: targetMode,
        fan: targetFan,
        protocol: targetProtocol,
        device: 'Điều hòa âm trần (Hồng ngoại)'
      });
      return;
    }

    const modeNames = { cool: 'Lạnh', dry: 'Hút ẩm', fan: 'Quạt', heat: 'Sưởi', auto: 'Tự động' };
    const action = actionOverride || (targetPower ? 'SET' : 'POWER_OFF');
    let title = targetPower
      ? `Điều hòa ${targetTemp}°C (${modeNames[targetMode] || targetMode})`
      : 'Tắt điều hòa';
    if (action === 'POWER') {
      title = `Đảo nguồn điều hòa (${targetPower ? 'Bật' : 'Tắt'})`;
    } else if (action === 'POWER_ON') {
      title = `Bật điều hòa ${targetTemp}°C`;
    }

    const cmd = {
      deviceId: 'ac_funiki',
      action,
      title,
      power: targetPower,
      temp: targetTemp,
      mode: targetMode,
      fan: targetFan,
      protocol: targetProtocol,
      forceToggle,
      keepPower,
      device: 'Điều hòa âm trần (Hồng ngoại)'
    };

    setParsedCommand(cmd);
    speakFeedback(title);
    showNotification(`Đang gửi: ${title}...`);

    const res = await sendIotCommand(cmd);
    if (res.success) {
      showNotification(res.message);
      setDevices(prev => prev.map(d => (d.id === 'ac_funiki' || d.type === 'ac') ? {
        ...d,
        active: targetPower,
        temp: targetTemp,
        mode: targetMode,
        fan: targetFan,
        statusText: targetPower ? `Đang bật (${targetTemp}°C)` : 'Đã tắt'
      } : d));
    } else {
      showNotification(`Lỗi: ${res.message}`);
    }
  };

  // Bấm nút trên Remote ảo tự tạo
  const handleCustomButtonClick = async (remote, btn) => {
    const cmd = {
      deviceId: remote.deviceId || 'tv_living',
      action: btn.action || 'CUSTOM_ACTION',
      title: btn.label || 'Nút tuỳ chỉnh',
      device: remote.name || 'Remote ảo',
      ir: btn.ir || undefined
    };
    setParsedCommand(cmd);
    speakFeedback(cmd.title);
    showNotification(`Đang phát: ${cmd.title}...`);

    const res = await sendIotCommand(cmd);
    if (res.success) {
      showNotification(res.message);
    } else {
      showNotification(`Lỗi: ${res.message}`);
    }
  };

  // Ghép đôi mạch bằng mã 6 số
  const handlePairBoardSubmit = async (e) => {
    e.preventDefault();
    if (!pairingInputCode.trim()) {
      showNotification('Vui lòng nhập mã 6 số hiển thị trên OLED mạch!');
      return;
    }
    setPairingLoading(true);
    const res = await pairBoardWithCode(pairingInputCode, pairingBoardName, pairingRoom);
    setPairingLoading(false);
    if (res.success) {
      showNotification('Ghép đôi mạch ESP32 thành công!');
      setShowPairingModal(false);
      setPairingInputCode('');
      refreshHomeData();
    } else {
      showNotification(res.message || 'Mã ghép đôi không đúng hoặc hết hạn!');
    }
  };

  // Gán mã IR vừa học vào thiết bị
  const handleAssignCodeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCodeToAssign) return;

    const aliases = assignAliases.split(',').map(s => s.trim()).filter(Boolean);
    const res = await assignLearnedCode({
      codeId: selectedCodeToAssign.id,
      deviceId: assignDeviceId || 'ac_funiki',
      action: assignAction,
      label: assignLabel,
      voiceAliases: aliases
    });

    if (res.success) {
      showNotification('Đã gán mã IR thành công!');
      setShowAssignModal(false);
      setSelectedCodeToAssign(null);
      refreshHomeData();
    } else {
      showNotification(res.message || 'Lỗi khi gán mã IR');
    }
  };

  // Xử lý khẩu lệnh giọng nói với hỗ trợ Remote ảo và Điều hòa
  const processVoiceText = async (text) => {
    if (!text || !text.trim()) return;
    const clean = text.trim();

    // 1. Phân tích qua parser nội bộ với danh sách customRemotes
    const parsed = parseVoiceCommand(clean, customRemotes);
    if (parsed && parsed.action !== 'UNKNOWN') {
      if (parsed.ir) {
        await handleCustomButtonClick(
          { deviceId: parsed.deviceId, name: parsed.device },
          { action: parsed.action, label: parsed.title, ir: parsed.ir }
        );
        return;
      }

      setParsedCommand(parsed);
      speakFeedback(parsed.title);

      const isAc = parsed.deviceId === 'ac_funiki' ||
                   (parsed.device && parsed.device.toLowerCase().includes('điều hòa')) ||
                   (parsed.action && parsed.action.startsWith('AC_'));

      if (isAc) {
        const curActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
        const explicitTurnOn = /\b(bật|mở|bat|mo)\b/i.test(clean);
        await handleAcControl({
          power: parsed.power,
          temp: parsed.hasExplicitTemp === false ? acTemp : parsed.temp,
          mode: parsed.hasExplicitMode === false ? acMode : parsed.mode,
          fan: parsed.hasExplicitFan === false ? acFan : parsed.fan,
          keepPower: parsed.power !== false && curActive,
          forceToggle: parsed.power !== false && !curActive && explicitTurnOn,
          actionOverride: parsed.power === false ? 'POWER_OFF' : (explicitTurnOn && !curActive ? 'POWER_ON' : 'SET'),
        });
      } else {
        await handleTvCommand(parsed.action, parsed.title);
      }
      return;
    }

    // 2. Dự phòng gọi Gemini AI
    if (geminiApiKey) {
      try {
        const aiRes = await analyzeVoiceWithGemini(clean, geminiApiKey, customRemotes);
        if (aiRes && aiRes.action && aiRes.action !== 'UNKNOWN') {
          // Kiểm tra nếu là nút của remote ảo
          let matchedCustomBtn = null;
          let matchedRemote = null;
          if (Array.isArray(customRemotes)) {
            for (const r of customRemotes) {
              const b = (r.buttons || []).find(btn => btn.action === aiRes.action || btn.label === aiRes.title);
              if (b) {
                matchedCustomBtn = b;
                matchedRemote = r;
                break;
              }
            }
          }

          if (matchedCustomBtn && matchedRemote) {
            await handleCustomButtonClick(matchedRemote, matchedCustomBtn);
            return;
          }

          const isAc = aiRes.action.startsWith('AC_') || 
                       aiRes.device?.toLowerCase().includes('điều hòa') ||
                       aiRes.device?.toLowerCase().includes('máy lạnh');
          const cmd = {
            deviceId: isAc ? 'ac_funiki' : (aiRes.deviceId || 'tv_living'),
            action: aiRes.action,
            title: aiRes.title || (isAc ? 'Lệnh điều hòa' : 'Lệnh điều khiển TV'),
            device: isAc ? 'Điều hòa (Hồng ngoại)' : (aiRes.device || 'Smart TV (Hồng ngoại)'),
            power: aiRes.action !== 'AC_OFF',
            temp: aiRes.temp || 24,
            mode: aiRes.mode || 'cool',
            fan: aiRes.fan || 'auto'
          };
          setParsedCommand(cmd);
          speakFeedback(cmd.title);

          if (isAc) {
            const curActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
            const wantOn = aiRes.action !== 'AC_OFF';
            await handleAcControl({
              power: wantOn,
              temp: aiRes.temp || 24,
              mode: aiRes.mode || 'cool',
              fan: aiRes.fan || 'auto',
              keepPower: wantOn && curActive,
              actionOverride: wantOn ? (curActive ? 'SET' : 'POWER_ON') : 'POWER_OFF',
            });
          } else {
            await handleTvCommand(cmd.action, cmd.title);
          }
          return;
        }
      } catch (err) {
        console.warn('Lỗi phân tích Gemini AI fallback:', err);
      }
    }

    speakFeedback('Chưa nhận diện được giọng nói');
    showNotification(`Chưa nhận diện được: "${clean}"`);
  };

  // Xử lý gửi lệnh thủ công (gõ phím hoặc chọn nhanh)
  const handleManualCommandSubmit = (e) => {
    if (e) e.preventDefault();
    if (!textCommandInput.trim()) return;
    const cmd = textCommandInput.trim();
    setTextCommandInput('');
    setTranscript(cmd);
    processVoiceText(cmd);
  };

  // Quản lý Microphone & Nhận diện
  const startListening = () => {
    if (isListeningRef.current || isStartingRef.current) return;
    sessionIdRef.current += 1;
    sessionStartTimeRef.current = Date.now();
    const currentSession = sessionIdRef.current;

    setTranscript('');
    setInterimText('');
    setParsedCommand(null);
    commandHandledRef.current = false;
    currentTranscriptRef.current = '';
    voiceIssueRef.current = { captureError: null, speechError: null };
    maxSessionVolumeRef.current = 0;

    // Trình duyệt chỉ cho dùng micro trên HTTPS hoặc localhost (mở bằng http://<IP> sẽ bị chặn, không báo lỗi)
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      showNotification('Micro chỉ chạy trên HTTPS hoặc localhost. Bạn đang mở bằng http://' + window.location.host + ' — hãy dùng localhost hoặc HTTPS.');
      return;
    }

    // 1. Kiểm tra hỗ trợ Micro từ trình duyệt
    const hasMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

    if (!hasMedia && !SpeechRecognition) {
      showNotification('Trình duyệt không hỗ trợ microphone hoặc chưa cho phép kết nối.');
      return;
    }

    // Đánh dấu lắng nghe NGAY LẬP TỨC để UI phản hồi không có độ trễ
    setIsListening(true);
    isListeningRef.current = true;

    // 2. Web Speech API nhận diện trực tiếp bằng tiếng Việt (Khởi động tức thì)
    if (SpeechRecognition) {
      const launchRecognition = () => {
        if (!isListeningRef.current || sessionIdRef.current !== currentSession) return;
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'vi-VN';
          recognition.continuous = false; // Lệnh khẩu lệnh đơn: tự động chốt câu ngay khi ngắt câu
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            let accumulatedFinal = '';
            let interim = '';
            for (let i = 0; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) {
                accumulatedFinal += res[0].transcript;
              } else {
                interim += res[0].transcript;
              }
            }
            const combined = (accumulatedFinal + ' ' + interim).trim();
            if (interim) {
              setInterimText(interim);
            }
            if (combined) {
              currentTranscriptRef.current = combined;
            }
            if (accumulatedFinal) {
              setTranscript(accumulatedFinal);
              setInterimText('');
              currentTranscriptRef.current = accumulatedFinal;
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = setTimeout(() => {
                if (isListeningRef.current && sessionIdRef.current === currentSession) {
                  stopListening();
                }
              }, 400);
            }
          };

          recognition.onerror = (e) => {
            console.warn('SpeechRecognition error:', e.error);
            voiceIssueRef.current.speechError = e.error;
            if (e.error === 'not-allowed') {
              showNotification('Quyền Micro bị từ chối. Hãy cho phép Micro trên trình duyệt!');
              stopListening();
            } else if (e.error === 'network') {
              showNotification('Lỗi kết nối máy chủ giọng nói Google (network).');
            } else if (e.error === 'audio-capture') {
              showNotification('Không tìm thấy thiết bị Micro đang hoạt động!');
            }
          };

          recognition.onend = () => {
            if (!isListeningRef.current || sessionIdRef.current !== currentSession) return;
            // Nếu đã nhận diện được câu nói thì dừng và thực thi lệnh ngay
            if (currentTranscriptRef.current) {
              stopListening();
              return;
            }
            // Nếu chưa có chữ và chưa hết 8s, tự tạo instance mới để nghe tiếp
            const elapsed = Date.now() - sessionStartTimeRef.current;
            if (elapsed < 8000) {
              setTimeout(() => {
                if (isListeningRef.current && sessionIdRef.current === currentSession) {
                  launchRecognition();
                }
              }, 80);
            } else {
              stopListening();
            }
          };

          recognitionRef.current = recognition;
          recognition.start();
        } catch (recErr) {
          console.warn('Lỗi khởi tạo SpeechRecognition:', recErr);
        }
      };

      launchRecognition();
    }

    // 3. Khởi động AudioCapture đo sóng âm song song trong nền (không chặn luồng nhận diện)
    if (hasMedia) {
      const activeMicId = selectedDeviceId || pickDefaultMicrophone(audioDevices);
      startAudioCapture({
        deviceId: activeMicId,
        onVolume: (vol) => {
          if (sessionIdRef.current === currentSession) {
            setLiveVolume(vol);
            if (vol > maxSessionVolumeRef.current) {
              maxSessionVolumeRef.current = vol;
            }
          }
        },
        onFrequencyBands: (bands) => {
          if (sessionIdRef.current === currentSession) setFrequencyBands(bands);
        },
        onError: (err) => {
          console.warn('Lỗi AudioCapture visualizer:', err);
          voiceIssueRef.current.captureError = err;
        }
      }).then((capture) => {
        if (sessionIdRef.current === currentSession && isListeningRef.current) {
          audioCaptureRef.current = capture;
        } else if (capture) {
          try { capture.stop(); } catch {}
        }
      }).catch((captureErr) => {
        console.warn('Không thể khởi động AudioCapture:', captureErr);
        voiceIssueRef.current.captureError = captureErr;
      });
    }

    // Tự động giới hạn phiên lắng nghe tối đa 8 giây
    if (maxSessionTimerRef.current) clearTimeout(maxSessionTimerRef.current);
    maxSessionTimerRef.current = setTimeout(() => {
      if (isListeningRef.current && sessionIdRef.current === currentSession) {
        stopListening();
      }
    }, 8000);
  };

  const stopListening = async () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxSessionTimerRef.current) clearTimeout(maxSessionTimerRef.current);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
      recognitionRef.current = null;
    }

    let recordedBlob = null;
    if (audioCaptureRef.current) {
      try {
        const res = await audioCaptureRef.current.stop();
        recordedBlob = (res instanceof Blob) ? res : res?.blob;
      } catch (stopErr) {
        console.warn('Lỗi stop audioCapture:', stopErr);
      }
      audioCaptureRef.current = null;
    }

    setLiveVolume(0);
    setFrequencyBands(new Array(20).fill(0));

    const finalQuery = (currentTranscriptRef.current || transcript || interimText).trim();
    if (finalQuery) {
      processVoiceText(finalQuery);
    } else if (recordedBlob && geminiApiKey && !geminiApiKey.startsWith('sk-')) {
      showNotification('Đang nhận diện giọng nói qua Gemini AI...');
      try {
        const aiRes = await transcribeAndAnalyzeAudioWithGemini(recordedBlob, geminiApiKey);
        if (aiRes && aiRes.transcript && aiRes.transcript.trim()) {
          setTranscript(aiRes.transcript.trim());
          processVoiceText(aiRes.transcript.trim());
        } else {
          showNotification('Chưa nghe rõ giọng nói. Bạn hãy nói to hơn hoặc dùng các nút lệnh bên dưới!');
        }
      } catch (aiErr) {
        console.error('Lỗi Gemini AI audio:', aiErr);
        showNotification('Lỗi AI nhận diện âm thanh: ' + (aiErr.message || 'Hãy thử nói lại!'));
      }
    } else if (maxSessionVolumeRef.current > 12) {
      showNotification('Đã bắt được tiếng nói! Bạn hãy đổi Micro mặc định trên Chrome sang "Microphone Array" (bấm icon cài đặt cạnh ô địa chỉ URL) để nhận diện chữ nhé!');
    } else {
      showNotification('Chưa nghe rõ giọng nói. Bạn hãy nói to, rõ hơn vào Micro hoặc chọn nút lệnh nhanh bên dưới nhé!');
    }
  };

  const handleMicClick = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const isAnyBoardOnline = boards.some(b => b.isOnline);

  return (
    <div className="app-viewport">
      {/* 1. HEADER TINH TẾ & GỌN GÀNG (KHÔNG TRÀN FORM) */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="header-brand-text">
            <span className="header-title">SmartHome</span>
            <span className="header-badge-tag">AI Voice</span>
          </div>
        </div>

        <div className="header-actions">
          {/* Status pill gọn gàng */}
          <div
            className={`status-pill ${isSupabaseOnline ? 'online' : ''}`}
            title={isSupabaseOnline ? 'Supabase Cloud: Đã kết nối' : 'Supabase Cloud: Ngoại tuyến'}
          >
            <span className="status-dot" />
            <span className="status-label">{isSupabaseOnline ? 'Cloud' : 'Offline'}</span>
          </div>

          <button
            type="button"
            className="family-badge-btn"
            onClick={() => setShowFamilyModal(true)}
            aria-label="Thành viên gia đình"
            title="Quản lý thành viên dùng chung mạch"
          >
            <span className="family-btn-icon">👥</span>
            <span className="family-count-badge">{homeMembers.length}</span>
          </button>

          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setShowSettingsModal(true)}
            aria-label="Cài đặt hệ thống"
            title="Cài đặt hệ thống & Supabase"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* TOAST THÔNG BÁO */}
      {actionToast && (
        <div className="action-toast-banner" role="status">
          <span className="toast-icon">✨</span>
          <span className="toast-text">{actionToast}</span>
        </div>
      )}

      {/* 2. THANH TRẠNG THÁI MẠCH PHẦN CỨNG ESP32 */}
      <section className="boards-section">
        <div className="section-label-row">
          <span className="section-micro-label">MẠCH ĐIỀU KHIỂN ESP32 ({boards.length})</span>
          <span className={`board-live-pill ${isAnyBoardOnline ? 'online' : 'offline'}`}>
            {isAnyBoardOnline ? '🟢 Online' : '⚪ Đang chờ kết nối'}
          </span>
        </div>
        <div className="boards-scroll-container">
          {boards.map((b) => (
            <div key={b.id} className={`board-card-pill ${b.isOnline ? 'online' : 'offline'}`}>
              <div className="board-pill-header">
                <div className="board-name-wrap">
                  <span className="board-icon-chip">{b.isOnline ? '⚡' : '📡'}</span>
                  <span className="board-pill-name">{b.name}</span>
                </div>
                <span className={`board-pill-badge ${b.isOnline ? 'online' : 'offline'}`}>
                  {b.isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="board-pill-stats">
                <span className="board-pill-stat-item">
                  🔋 {b.battery}%{b.charging ? '⚡' : (b.usb ? '🔌' : '')}
                </span>
                <span className="board-pill-stat-item">
                  📶 {b.rssi}dBm
                </span>
                <span className="board-pill-stat-item">
                  📍 {b.room}
                </span>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="add-board-card-btn"
            onClick={() => setShowPairingModal(true)}
            title="Ghép đôi mạch ESP32 mới bằng mã 6 số"
          >
            <div className="add-board-icon">+</div>
            <span>Ghép mạch</span>
          </button>
        </div>
      </section>

      {/* 3. VÙNG MICRO TRỢ LÝ GIỌNG NÓI CAO CẤP */}
      <section className="mic-hero-section">
        <div className="mic-glow-halo" />
        <div className="mic-button-wrapper">
          <button
            type="button"
            className={`mic-primary-btn ${isListening ? 'listening' : ''}`}
            onClick={handleMicClick}
            aria-label={isListening ? 'Đang lắng nghe' : 'Nhấn để ra lệnh'}
          >
            <div className="mic-inner-glow" />
            <svg className="mic-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
        </div>

        <div className="mic-status-container">
          {isListening ? (
            <div className="mic-active-feedback">
              <div className="audio-wave-visualizer">
                {frequencyBands.slice(0, 14).map((band, i) => {
                  const h = Math.max(6, Math.min(38, Math.round((band / 100) * 38)));
                  return (
                    <div
                      key={i}
                      className={`wave-bar ${band > 12 ? 'active-voice' : ''}`}
                      style={{ height: `${h}px` }}
                    />
                  );
                })}
              </div>

              <div className="mic-live-vol-pill active-signal">
                <span className="live-vol-dot" />
                <span className="vol-text">Đang nghe: {liveVolume > 3 ? `${liveVolume}%` : 'Bạn hãy nói...'}</span>
              </div>

              {interimText || transcript ? (
                <div className="mic-transcript-quote">“{interimText || transcript}”</div>
              ) : (
                <p className="mic-subtext">Đang lắng nghe... Hãy nói hoặc chạm lại micro để gửi ngay</p>
              )}
            </div>
          ) : (
            <div className="mic-idle-feedback">
              <h1 className="mic-heading-title">Chạm để ra lệnh</h1>
              <p className="mic-subtext">Nói tự nhiên hoặc chọn lệnh nhanh bên dưới:</p>
              
              <div className="mic-quick-suggestions">
                <button type="button" className="suggestion-pill-chip" onClick={() => handleTvCommand('POWER', 'Nguồn Tivi')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="15" x="2" y="3" rx="2" />
                    <polyline points="17 2 12 7 7 2" />
                  </svg>
                  <span>Nguồn TV</span>
                </button>
                <button type="button" className="suggestion-pill-chip" onClick={() => handleTvCommand('APP_YOUTUBE', 'Mở YouTube')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span>YouTube</span>
                </button>
                <button type="button" className="suggestion-pill-chip" onClick={() => {
                  const curActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                  handleAcControl({ temp: 24, power: true, keepPower: curActive, forceToggle: !curActive, actionOverride: curActive ? 'SET' : 'POWER_ON' });
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 2v20" />
                    <path d="m4.93 4.93 14.14 14.14" />
                    <path d="M2 12h20" />
                    <path d="m4.93 19.07 14.14-14.14" />
                  </svg>
                  <span>Điều hòa 24°</span>
                </button>
              </div>

              {/* Ô gõ lệnh hỗ trợ trực tiếp khi micro không tiện dùng */}
              <form className="quick-command-form" onSubmit={handleManualCommandSubmit}>
                <input
                  type="text"
                  className="quick-command-input"
                  placeholder="Hoặc gõ: Bật TV, Mở YouTube, Điều hòa 22 độ..."
                  value={textCommandInput}
                  onChange={(e) => setTextCommandInput(e.target.value)}
                />
                <button type="submit" className="quick-command-submit-btn" aria-label="Gửi lệnh">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* 4. MÃ HỌC TỪ NÚT BẤM CHỜ GÁN (Specs 7.1 Cách 2) */}
      {pendingCodes.length > 0 && (
        <section className="pending-codes-box">
          <div className="pending-codes-header">
            <span className="pending-codes-title">⚡ Có {pendingCodes.length} mã IR vừa học từ nút bấm</span>
            <button
              type="button"
              className="assign-code-btn"
              onClick={() => {
                const pc = pendingCodes[0];
                setSelectedCodeToAssign(pc);
                const proto = (pc?.ir?.protocol || '').toUpperCase();
                const isAc = proto.includes('DAIKIN') || proto.includes('AC') || proto.includes('PANASONIC') || proto.includes('TOSHIBA');
                if (isAc) {
                  setAssignDeviceId('ac_funiki');
                  setAssignLabel('Bật/Tắt điều hòa');
                  setAssignAction('POWER');
                  setAssignAliases('bật điều hòa, tắt điều hòa, mở điều hòa, đóng điều hòa, bật máy lạnh, tắt máy lạnh');
                } else {
                  setAssignDeviceId('tv_living');
                  setAssignLabel('Nút mới');
                  setAssignAction('CUSTOM_KEY');
                  setAssignAliases('bật nút mới, mở nút mới');
                }
                setShowAssignModal(true);
              }}
            >
              Gán vào thiết bị
            </button>
          </div>
          <div className="pending-codes-list">
            {pendingCodes.slice(0, 2).map((pc) => (
              <div key={pc.id} className="pending-code-card">
                <span className="pending-code-info">
                  Protocol: <strong>{pc.ir?.protocol || 'RAW'}</strong> • Code: {pc.ir?.code || `${pc.ir?.raw?.length || 0} xung`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. ĐIỀU KHIỂN TIVI LG (REMOTE CARD CHỈN CHU) */}
      <section className="devices-section">
        <div className="device-card-container tv-remote-card">
          <div className="device-card-header">
            <div className="device-title-group">
              <div className="device-icon-badge tv-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="15" x="2" y="3" rx="2" />
                  <polyline points="17 2 12 7 7 2" />
                </svg>
              </div>
              <div>
                <h2 className="device-card-title">{devices.find(d => d.id === 'tv_living')?.name || 'Tivi'}</h2>
                <span className="device-card-subtitle">
                  Hồng ngoại •{' '}
                  <button type="button" className="ac-protocol-link" onClick={() => setShowTvSetup(true)}>
                    Chọn hãng / học phím
                  </button>
                </span>
              </div>
            </div>
            <div className="device-status-badge">
              <span className="status-dot-mini" />
              <span>Sẵn sàng</span>
            </div>
          </div>

          {/* Hàng 1: Nguồn & YouTube */}
          <div className="tv-primary-actions-row">
            {/* Remote Tivi chỉ có một phím nguồn (bật/tắt chung một mã) */}
            <button
              type="button"
              className="tv-action-btn tv-power-on"
              onClick={() => handleTvCommand('POWER', 'Nguồn Tivi')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
              <span className="btn-label">Nguồn</span>
            </button>

            <button
              type="button"
              className="tv-action-btn tv-youtube"
              onClick={() => handleTvCommand('APP_YOUTUBE', 'Mở YouTube')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span className="btn-label">YouTube</span>
            </button>
          </div>

          {/* Hàng 2: Âm lượng & Kênh truyền hình */}
          <div className="tv-controls-grid">
            <button
              type="button"
              className="tv-action-btn"
              onClick={() => handleTvCommand('VOL_UP', 'Tăng âm lượng')}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span className="btn-label">To (+)</span>
            </button>

            <button
              type="button"
              className="tv-action-btn"
              onClick={() => handleTvCommand('VOL_DOWN', 'Giảm âm lượng')}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span className="btn-label">Nhỏ (-)</span>
            </button>

            <button
              type="button"
              className="tv-action-btn"
              onClick={() => handleTvCommand('MUTE', 'Tắt tiếng')}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
              <span className="btn-label">Mute</span>
            </button>

            <button
              type="button"
              className="tv-action-btn tv-channel"
              onClick={() => handleTvCommand('CH_VTV1', 'Kênh VTV1')}
            >
              <span className="channel-badge">HD</span>
              <span className="btn-label">VTV1</span>
            </button>

            <button
              type="button"
              className="tv-action-btn tv-channel"
              onClick={() => handleTvCommand('CH_VTV3', 'Kênh VTV3')}
            >
              <span className="channel-badge">HD</span>
              <span className="btn-label">VTV3</span>
            </button>
          </div>
        </div>
      </section>

      {/* 6. ĐIỀU KHIỂN ĐIỀU HÒA ÂM TRẦN (THERMOSTAT CARD) */}
      <section className="devices-section">
        <div className="device-card-container ac-thermostat-card">
          <div className="ac-panel-header">
            <div className="device-title-group">
              <div className="device-icon-badge ac-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2v20" />
                  <path d="m4.93 4.93 14.14 14.14" />
                  <path d="M2 12h20" />
                  <path d="m4.93 19.07 14.14-14.14" />
                </svg>
              </div>
              <div>
                <h3 className="device-card-title">{devices.find(d => d.id === 'ac_funiki')?.name || 'Điều hòa Âm trần Daikin'}</h3>
                <span className="device-card-subtitle">
                  Giao thức:{' '}
                  <button type="button" className="ac-protocol-link" onClick={() => setShowAcSetup(true)} title={getAcProtocolLabel(acProtocol)}>
                    {acProtocol || 'DAIKIN64'} (Đổi)
                  </button>
                </span>
              </div>
            </div>
            <button
              type="button"
              className={`ac-power-toggle-btn ${devices.find(d => d.id === 'ac_funiki')?.active ? 'active' : ''}`}
              onClick={() => {
                const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                const nextPower = !currentActive;
                handleAcControl({
                  power: nextPower,
                  forceToggle: true,
                  actionOverride: nextPower ? 'POWER_ON' : 'POWER_OFF'
                });
              }}
            >
              <span className="power-indicator-dot" />
              <span>{devices.find(d => d.id === 'ac_funiki')?.active ? 'Đang Bật' : 'Đã Tắt'}</span>
            </button>
          </div>

          {/* Hàng công cụ chuyên dụng cho Điều hòa Âm trần Toggle Nguồn (BRC52A62 / DAIKIN64) */}
          <div className="ac-ceiling-tools-row">
            <button
              type="button"
              className="ac-tool-pill-btn toggle-pulse"
              title="Phát trực tiếp 1 xung ON/OFF giống hệt bấm nút nguồn trên remote âm trần BRC52A62"
              onClick={() => {
                const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                handleAcControl({ power: !currentActive, forceToggle: true, actionOverride: 'POWER' });
              }}
            >
              ⚡ Đảo nguồn trực tiếp
            </button>
            <button
              type="button"
              className="ac-tool-pill-btn sync-state"
              title="Khớp lại trạng thái Bật/Tắt khi bạn vừa dùng remote vật lý mà không phát tia hồng ngoại"
              onClick={() => {
                const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                handleAcControl({ power: !currentActive, syncOnly: true, actionOverride: 'SYNC_POWER' });
              }}
            >
              ⇄ Đồng bộ ({devices.find(d => d.id === 'ac_funiki')?.active ? 'sang Tắt' : 'sang Bật'})
            </button>
          </div>

          <div className="ac-temp-controller">
            <button
              type="button"
              className="ac-stepper-btn"
              onClick={() => {
                const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                handleAcControl({ temp: Math.max(16, acTemp - 1), keepPower: currentActive });
              }}
              aria-label="Giảm nhiệt độ"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <div className="ac-temp-display">
              <span className="ac-temp-label">
                Nhiệt độ cài đặt {isTogglePowerAcProtocol(acProtocol) ? '• Âm trần' : ''}
              </span>
              <div className="ac-temp-value-row">
                <span className="ac-temp-number">{acTemp}</span>
                <span className="ac-temp-unit">°C</span>
              </div>
            </div>
            <button
              type="button"
              className="ac-stepper-btn"
              onClick={() => {
                const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                handleAcControl({ temp: Math.min(30, acTemp + 1), keepPower: currentActive });
              }}
              aria-label="Tăng nhiệt độ"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <div className="ac-modes-segmented">
            {[
              {
                id: 'cool',
                label: 'Lạnh',
                icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 2v20" />
                    <path d="m4.93 4.93 14.14 14.14" />
                    <path d="M2 12h20" />
                    <path d="m4.93 19.07 14.14-14.14" />
                  </svg>
                )
              },
              {
                id: 'dry',
                label: 'Hút ẩm',
                icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                  </svg>
                )
              },
              {
                id: 'fan',
                label: 'Quạt',
                icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 9a3 3 0 0 0-3-3H6a3 3 0 0 0 0 6h3" />
                    <path d="M15 12a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v3" />
                    <path d="M12 15a3 3 0 0 0 3 3h3a3 3 0 0 0 0-6h-3" />
                    <path d="M9 12a3 3 0 0 0-3 3v3a3 3 0 0 0 6 0v-3" />
                  </svg>
                )
              },
              {
                id: 'heat',
                label: 'Sưởi',
                icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                )
              },
              {
                id: 'auto',
                label: 'Tự động',
                icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                )
              }
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                className={`ac-mode-segmented-btn ${acMode === m.id ? 'active' : ''}`}
                onClick={() => {
                  const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                  handleAcControl({ mode: m.id, keepPower: currentActive });
                }}
              >
                <span className="mode-icon-svg">{m.icon}</span>
                <span className="mode-label">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Tốc độ quạt gió dàn lạnh âm trần */}
          <div className="ac-fan-row">
            <span className="ac-fan-label">💨 Gió dàn lạnh:</span>
            <div className="ac-fan-segmented">
              {[
                { id: 'auto', label: 'Tự động' },
                { id: 'low', label: 'Nhẹ' },
                { id: 'medium', label: 'Vừa' },
                { id: 'high', label: 'Mạnh' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`ac-fan-btn ${acFan === f.id ? 'active' : ''}`}
                  onClick={() => {
                    const currentActive = Boolean(devices.find(d => d.id === 'ac_funiki')?.active);
                    handleAcControl({ fan: f.id, keepPower: currentActive });
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. REMOTE ẢO TỰ TẠO (CUSTOM REMOTES - Specs 7.1) */}
      {customRemotes.length > 0 && (
        <section className="devices-section">
          <h2 className="section-heading">Remote ảo của bạn</h2>
          {customRemotes.map((remote) => (
            <div key={remote.id} style={{ marginTop: '8px' }}>
              <div className="quick-chips-container">
                {remote.buttons.map((btn, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="command-chip-btn"
                    onClick={() => handleCustomButtonClick(remote, btn)}
                  >
                    ✨ {btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* MODAL: GIAO THỨC ĐIỀU HÒA ÂM TRẦN (Contracts 3.8) */}
      {showAcSetup && (
        <AcSetupModal
          acDevice={devices.find(d => d.id === 'ac_funiki') || devices.find(d => d.type === 'ac') || { id: 'ac_funiki', name: 'Điều hòa Âm trần Daikin' }}
          acState={{ temp: acTemp, mode: acMode, fan: acFan }}
          initialProtocol={acProtocol}
          onClose={() => setShowAcSetup(false)}
          onSaved={(proto) => {
            setAcProtocol(proto);
            localStorage.setItem('smart_home_ac_protocol', proto);
            setDevices(prev => prev.map(d => (d.id === 'ac_funiki' || d.type === 'ac') ? {
              ...d,
              name: proto.startsWith('DAIKIN')
                ? 'Điều hòa Âm trần Daikin'
                : proto.startsWith('PANASONIC')
                  ? 'Điều hòa Âm trần Panasonic'
                  : proto.startsWith('MITSUBISHI')
                    ? 'Điều hòa Âm trần Mitsubishi'
                    : proto === 'COOLIX'
                      ? 'Điều hòa Funiki / Casper'
                      : `Điều hòa (${proto})`
            } : d));
          }}
          onNotify={showNotification}
        />
      )}

      {/* MODAL: CÀI ĐẶT TIVI — CHỌN HÃNG / HỌC PHÍM (Contracts 3.8) */}
      {showTvSetup && (
        <TvSetupModal
          tvDevice={{ id: 'tv_living', name: devices.find(d => d.id === 'tv_living')?.name || 'Tivi' }}
          onClose={() => setShowTvSetup(false)}
          onNotify={showNotification}
        />
      )}

      {/* MODAL: GHÉP ĐÔI MẠCH ESP32 (Specs 10.2, Contracts 7) */}
      {showPairingModal && (
        <div className="modal-overlay-backdrop" onClick={() => setShowPairingModal(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div className="modal-title-group">
                <h3 className="modal-main-title">Ghép đôi Mạch ESP32</h3>
                <p className="modal-sub-desc">Nhập mã 6 số hiển thị trên màn hình OLED</p>
              </div>
              <button type="button" className="modal-close-icon-btn" onClick={() => setShowPairingModal(false)}>✕</button>
            </div>

            <form onSubmit={handlePairBoardSubmit} className="modal-form-body">
              <div className="input-with-label">
                <span className="input-micro-label">Mã Ghép Đôi (6 chữ số trên OLED)</span>
                <input
                  type="text"
                  maxLength={6}
                  required
                  className="form-text-input"
                  style={{ fontSize: '24px', letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }}
                  value={pairingInputCode}
                  onChange={(e) => setPairingInputCode(e.target.value)}
                  placeholder="123456"
                />
              </div>

              <div className="input-with-label">
                <span className="input-micro-label">Tên gọi mạch</span>
                <input
                  type="text"
                  className="form-text-input"
                  value={pairingBoardName}
                  onChange={(e) => setPairingBoardName(e.target.value)}
                />
              </div>

              <div className="input-with-label">
                <span className="input-micro-label">Vị trí phòng</span>
                <input
                  type="text"
                  className="form-text-input"
                  value={pairingRoom}
                  onChange={(e) => setPairingRoom(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={pairingLoading}
                className="form-action-btn full-width"
                style={{ marginTop: '12px' }}
              >
                {pairingLoading ? 'Đang xác thực...' : 'Hoàn tất ghép đôi'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GÁN MÃ IR HỌC ĐƯỢC (Specs 7.1) */}
      {showAssignModal && selectedCodeToAssign && (
        <div className="modal-overlay-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div className="modal-title-group">
                <h3 className="modal-main-title">Gán mã IR vào nút bấm</h3>
                <p className="modal-sub-desc">Mã: {selectedCodeToAssign.ir?.code || 'RAW'}</p>
              </div>
              <button type="button" className="modal-close-icon-btn" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAssignCodeSubmit} className="modal-form-body">
              <div className="input-with-label">
                <span className="input-micro-label">Gán vào thiết bị nào</span>
                <select
                  className="form-text-input"
                  value={assignDeviceId}
                  onChange={(e) => setAssignDeviceId(e.target.value)}
                >
                  <option value="ac_funiki">Điều hòa Daikin (Phòng khách)</option>
                  <option value="tv_living">Tivi LG (Phòng khách)</option>
                </select>
              </div>

              <div className="input-with-label">
                <span className="input-micro-label">Tên nút hiển thị</span>
                <input
                  type="text"
                  required
                  className="form-text-input"
                  value={assignLabel}
                  onChange={(e) => setAssignLabel(e.target.value)}
                  placeholder="Ví dụ: Chế độ rạp phim"
                />
              </div>

              <div className="input-with-label">
                <span className="input-micro-label">Mã hành động (Action ID)</span>
                <input
                  type="text"
                  required
                  className="form-text-input"
                  value={assignAction}
                  onChange={(e) => setAssignAction(e.target.value)}
                  placeholder="Ví dụ: MOVIE_MODE"
                />
              </div>

              <div className="input-with-label">
                <span className="input-micro-label">Khẩu lệnh giọng nói (cách nhau bằng dấu phẩy)</span>
                <input
                  type="text"
                  className="form-text-input"
                  value={assignAliases}
                  onChange={(e) => setAssignAliases(e.target.value)}
                  placeholder="chế độ phim, bật rạp phim"
                />
              </div>

              <button type="submit" className="form-action-btn full-width" style={{ marginTop: '12px' }}>
                Lưu vào Remote ảo
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CÀI ĐẶT SUPABASE & DATABASE (SETTINGS) */}
      {showSettingsModal && (
        <div className="modal-overlay-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header-row">
              <div className="modal-title-group">
                <h3 className="modal-main-title">Cài đặt Hệ thống & Supabase</h3>
                <p className="modal-sub-desc">Cơ sở dữ liệu đám mây Supabase v3</p>
              </div>
              <button type="button" className="modal-close-icon-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>

            <div className="modal-form-body">
              <div className="form-group-item supabase-config-card">
                <div className="form-item-header-row">
                  <label className="form-item-label">Cơ sở dữ liệu Supabase</label>
                  <span className={`backend-status-tag ${isSupabaseOnline ? 'online' : 'offline'}`}>
                    {isSupabaseOnline ? '🟢 Đã kết nối' : '⚪ Chưa kết nối'}
                  </span>
                </div>

                <div className="form-vertical-inputs">
                  <div className="input-with-label">
                    <span className="input-micro-label">Project URL</span>
                    <input
                      type="text"
                      className="form-text-input"
                      value={supabaseUrl}
                      onChange={(e) => {
                        const val = e.target.value.trim().replace(/\/+$/, '');
                        setSupabaseUrl(val);
                        saveSupabaseConfig({ url: val, anonKey: supabaseAnonKey });
                      }}
                      placeholder="https://xyzcompany.supabase.co"
                    />
                  </div>
                  <div className="input-with-label">
                    <span className="input-micro-label">Anon Public API Key</span>
                    <input
                      type="password"
                      className="form-text-input"
                      value={supabaseAnonKey}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setSupabaseAnonKey(val);
                        saveSupabaseConfig({ url: supabaseUrl, anonKey: val });
                      }}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    />
                  </div>
                </div>

                <div className="form-control-row" style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    className="form-action-btn full-width"
                    onClick={async () => {
                      setIsTestingSupabase(true);
                      setSupabasePingResult('Đang kiểm tra kết nối...');
                      try {
                        const res = await testSupabaseConnection({ url: supabaseUrl, anonKey: supabaseAnonKey });
                        setSupabasePingResult(res.message);
                        if (res.success) {
                          setIsSupabaseOnline(true);
                          refreshHomeData();
                        }
                      } finally {
                        setIsTestingSupabase(false);
                      }
                    }}
                  >
                    {isTestingSupabase ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                  </button>
                </div>

                {supabasePingResult && (
                  <div className="ping-result-box" style={{ marginTop: '8px' }}>
                    {supabasePingResult}
                  </div>
                )}
              </div>

              {/* Cài đặt Trợ lý Giọng nói AI (Gemini) */}
              <div className="form-group-item supabase-config-card" style={{ marginTop: '12px' }}>
                <div className="form-item-header-row">
                  <label className="form-item-label">Trợ lý Giọng nói AI (Gemini)</label>
                  <span className="backend-status-tag online">🟢 Sẵn sàng</span>
                </div>
                <div className="form-vertical-inputs">
                  <div className="input-with-label">
                    <span className="input-micro-label">API Key AI (vilao.ai / Google AI Studio)</span>
                    <input
                      type="password"
                      className="form-text-input"
                      value={geminiApiKeyInput}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setGeminiApiKeyInput(val);
                        localStorage.setItem('gemini_api_key', val);
                      }}
                      placeholder="sk-..."
                    />
                  </div>
                </div>
              </div>

              {/* Cài đặt Thiết bị Microphone */}
              <div className="form-group-item supabase-config-card" style={{ marginTop: '12px' }}>
                <div className="form-item-header-row">
                  <label className="form-item-label">Thiết bị Microphone</label>
                  <span className="backend-status-tag online">
                    {audioDevices.length > 0 ? `🟢 ${audioDevices.length} Thiết bị` : '⚪ Mặc định'}
                  </span>
                </div>
                <div className="form-vertical-inputs">
                  <div className="input-with-label">
                    <span className="input-micro-label">Chọn Microphone thu âm</span>
                    <select
                      className="form-text-input"
                      value={selectedDeviceId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedDeviceId(val);
                        localStorage.setItem('selected_audio_device', val);
                      }}
                    >
                      {audioDevices.map((d) => {
                        const isBad = isVirtualOrUnwantedMic(d.label);
                        const isDefault = d.deviceId === 'default';
                        let prefix = '🎙 ';
                        if (isBad) prefix = '⚠️ [Micro ảo/DeskIn - Không nên chọn] ';
                        else if (d.label && (d.label.toLowerCase().includes('array') || d.label.toLowerCase().includes('realtek'))) {
                          prefix = '⭐ [Micro phần cứng khuyên dùng] ';
                        }
                        return (
                          <option key={d.deviceId} value={d.deviceId}>
                            {prefix}{d.label || (isDefault ? 'Mặc định hệ thống Windows' : `Microphone (${d.deviceId.slice(0, 8)})`)}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <button
                      type="button"
                      className={`form-action-btn full-width ${isTestingMic ? 'danger' : ''}`}
                      onClick={handleToggleTestMic}
                    >
                      {isTestingMic ? '⏹ Dừng kiểm tra Micro' : '🎙 Bấm để thử nói kiểm tra Micro'}
                    </button>

                    {isTestingMic && (
                      <div style={{ marginTop: '8px', padding: '10px', background: 'var(--surface-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                          <span>Mức âm lượng thu được:</span>
                          <strong style={{ color: testLiveVol > 10 ? '#10b981' : '#f59e0b' }}>{testLiveVol}%</strong>
                        </div>
                        <div style={{ height: '10px', background: 'rgba(0,0,0,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${testLiveVol}%`, background: testLiveVol > 15 ? '#10b981' : '#f59e0b', transition: 'width 0.08s ease' }} />
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--secondary-text)', marginTop: '6px', marginBottom: 0 }}>
                          {testLiveVol > 10 ? '✅ Micro đang bắt tiếng rất tốt!' : '⚠️ Hãy nói to vào mic hoặc chọn thiết bị khác trong danh sách phía trên.'}
                        </p>
                      </div>
                    )}

                    {testRecordedAudioUrl && (
                      <div style={{ marginTop: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>Nghe lại tiếng vừa thu:</span>
                        <audio src={testRecordedAudioUrl} controls style={{ width: '100%', marginTop: '4px', height: '36px' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hướng dẫn SQL Script */}
              <div className="form-group-item" style={{ marginTop: '12px' }}>
                <label className="form-item-label">Cài đặt CSDL Supabase (SQL Script)</label>
                <p style={{ fontSize: '12px', color: 'var(--secondary-text)', marginTop: '4px' }}>
                  Chạy script này trong Supabase SQL Editor để kích hoạt toàn bộ 12 bảng, RPC functions và Realtime.
                </p>
                <button
                  type="button"
                  className={`copy-sql-btn ${sqlCopied ? 'copied' : ''}`}
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
                    setSqlCopied(true);
                    setTimeout(() => setSqlCopied(false), 2500);
                  }}
                >
                  {sqlCopied ? '✓ Đã sao chép SQL!' : '📋 Sao chép mã SQL Schema'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUẢN LÝ THÀNH VIÊN GIA ĐÌNH & CHIA SẺ MẠCH (Specs 4.4) */}
      {showFamilyModal && (
        <div className="modal-overlay-backdrop family-members-modal" onClick={() => setShowFamilyModal(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header-row">
              <div className="modal-title-group">
                <h3 className="modal-main-title">Gia Đình & Thành Viên</h3>
                <p className="modal-sub-desc">Cùng điều khiển mạch ESP32 & thiết bị trong nhà</p>
              </div>
              <button type="button" className="modal-close-icon-btn" onClick={() => setShowFamilyModal(false)}>✕</button>
            </div>

            <div className="modal-form-body">
              {/* Thẻ tóm tắt Nhà & Mạch ESP32 đang chia sẻ */}
              <div className="family-meta-card">
                <div className="family-home-header">
                  <span className="family-home-name">🏠 Nhà thông minh của tôi</span>
                  <span className={`backend-status-tag ${isAnyBoardOnline ? 'online' : 'offline'}`}>
                    {boards.length} Mạch ({boards.filter(b => b.isOnline).length} Online)
                  </span>
                </div>
                <p className="family-board-sync-note">
                  Tất cả thành viên trong danh sách dưới đây cùng điều khiển chung các mạch ESP32 trong nhà qua Supabase Cloud Realtime mà không cần cấu hình lại phần cứng.
                </p>
              </div>

              {/* Danh sách thành viên */}
              <div className="family-section-label">
                <span>Danh sách thành viên ({homeMembers.length})</span>
              </div>
              <div className="family-members-list">
                {homeMembers.map((m) => {
                  const isOwner = m.role === 'owner';
                  const isSelf = m.userId === currentUserId || m.displayName?.includes('Bạn');
                  return (
                    <div key={m.id || m.userId} className="family-member-row">
                      <div className="family-member-left">
                        <div className={`member-avatar-circle ${isOwner ? 'owner' : ''}`}>
                          {m.displayName ? m.displayName.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="member-details-col">
                          <div className="member-name-row">
                            <span className="member-display-name">{m.displayName}</span>
                            {isSelf && <span className="member-self-badge">Bạn</span>}
                          </div>
                          <span className={`member-role-badge ${m.role}`}>
                            {isOwner ? '👑 Chủ nhà (Owner)' : '👤 Thành viên (Member)'}
                          </span>
                        </div>
                      </div>

                      <div className="family-member-right">
                        {!isSelf && (
                          <button
                            type="button"
                            className="member-remove-action-btn"
                            onClick={() => handleRemoveMemberClick(m.userId, m.displayName)}
                            title="Gỡ thành viên khỏi nhà"
                          >
                            Gỡ
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hộp mã mời gia đình (Invite Code) */}
              <div className="invite-card-container">
                <div className="invite-card-title">Mời Người Thân Cùng Dùng Mạch</div>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0' }}>
                  Gửi mã này cho người thân (vợ/chồng/con cái). Họ nhập mã trong app là có thể điều khiển ngay lập tức:
                </p>
                {activeInvite ? (
                  <>
                    <div className="invite-code-pill-row">
                      <div className="invite-code-box">{activeInvite.inviteCode}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      Hiệu lực 24h • Đã tham gia: {activeInvite.usedCount || 0}/{activeInvite.maxUses || 10} người
                    </div>
                    <div className="invite-actions-flex">
                      <button
                        type="button"
                        className="invite-action-pill-btn primary"
                        onClick={handleCopyInviteCode}
                      >
                        📋 Sao chép mã
                      </button>
                      <button
                        type="button"
                        className="invite-action-pill-btn"
                        onClick={handleShareZaloInvite}
                      >
                        💬 Gửi qua Zalo
                      </button>
                      <button
                        type="button"
                        className="invite-action-pill-btn"
                        onClick={handleCreateNewInvite}
                        disabled={inviteLoading}
                      >
                        {inviteLoading ? 'Đang tạo...' : '🔄 Đổi mã'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="invite-action-pill-btn primary"
                    onClick={handleCreateNewInvite}
                    disabled={inviteLoading}
                  >
                    {inviteLoading ? 'Đang tạo mã...' : 'Tạo mã mời gia đình'}
                  </button>
                )}
              </div>

              {/* Hộp tham gia nhà khác bằng mã mời */}
              <div className="join-home-card">
                <span className="family-section-label" style={{ marginBottom: '4px' }}>
                  Bạn được mời vào nhà người thân?
                </span>
                <p style={{ fontSize: '12px', color: 'var(--secondary-text)', margin: '0 0 8px 0' }}>
                  Nhập mã mời 6 chữ số/chữ cái nhận được từ chủ nhà để cùng điều khiển mạch:
                </p>
                <form onSubmit={handleJoinHomeSubmit} className="join-home-input-group">
                  <input
                    type="text"
                    maxLength={6}
                    required
                    className="join-home-input"
                    value={joinInviteInput}
                    onChange={(e) => setJoinInviteInput(e.target.value.toUpperCase())}
                    placeholder="VD: H84K92"
                  />
                  <button
                    type="submit"
                    className="join-home-btn"
                    disabled={joinLoading || joinInviteInput.length < 4}
                  >
                    {joinLoading ? 'Đang vào...' : 'Tham Gia'}
                  </button>
                </form>
                {joinMessage && (
                  <div className={`join-feedback-banner ${joinMessage.success ? 'success' : 'error'}`}>
                    {joinMessage.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
