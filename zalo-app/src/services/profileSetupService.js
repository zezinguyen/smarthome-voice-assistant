import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { generateRequestId, getHomeRealtimeChannel } from './iotService';

/**
 * Sửa profile trên mạch từ app (TẠM — docs/contracts.md mục 3.8): giao thức điều hòa, phím học cho Tivi.
 * App gửi yêu cầu vào kênh home:<homeId>, mạch trả lời kèm đúng requestId.
 * Khi server quản lý profile (mục 3.7) thì chuyển sang gọi Edge Function.
 */

const DEFAULT_HOME_ID = '00000000-0000-0000-0000-000000000001';
const REPLY_EVENTS = ['profile_info', 'setup_result', 'learn_progress', 'learn_result', 'learn_timeout'];

// Danh sách giao thức điều hòa ưu tiên dòng Âm trần Cassette lên đầu (khớp AC_PROTOCOL_CANDIDATES trong config.h)
export const DEFAULT_AC_PROTOCOLS = [
  'DAIKIN64',
  'DAIKIN176',
  'DAIKIN128',
  'DAIKIN200',
  'PANASONIC_AC',
  'PANASONIC_AC32',
  'MITSUBISHI_AC',
  'MITSUBISHI_HEAVY_152',
  'MITSUBISHI112',
  'MITSUBISHI136',
  'MITSUBISHI_HEAVY_88',
  'TOSHIBA_AC',
  'CARRIER_AC64',
  'MIDEA',
  'COOLIX',
  'GREE',
  'LG',
  'LG2',
  'SAMSUNG_AC',
  'FUJITSU_AC',
  'HITACHI_AC',
  'HAIER_AC_YRW02',
  'DAIKIN',
  'DAIKIN2',
  'DAIKIN216',
  'DAIKIN160',
  'DAIKIN152',
  'SHARP_AC',
  'KELVINATOR',
  'TCL112AC',
  'HAIER_AC',
  'ELECTRA_AC',
  'AIRWELL',
  'KELON',
  'MIRAGE',
  'TECO',
  'VESTEL_AC',
  'TECHNIBEL_AC',
];

export const AC_PROTOCOL_META = {
  DAIKIN64: { label: 'Âm trần Daikin Cassette (Remote BRC52A62 / R04089...)', ceiling: true, togglePower: true },
  DAIKIN176: { label: 'Âm trần Daikin Cassette (Remote BRC4C151 / BRC4C153)', ceiling: true, togglePower: false },
  DAIKIN128: { label: 'Âm trần Daikin Cassette (Remote BRC52B63)', ceiling: true, togglePower: true },
  DAIKIN200: { label: 'Âm trần Daikin Cassette 360° (Remote BRC4M150W16)', ceiling: true, togglePower: false },
  DAIKIN: { label: 'Daikin Inverter treo tường (ARC433 / ARC470)', ceiling: false, togglePower: false },
  DAIKIN2: { label: 'Daikin 2 chiều cao cấp (ARC477)', ceiling: false, togglePower: false },
  DAIKIN216: { label: 'Daikin thế hệ mới (ARC480)', ceiling: false, togglePower: false },
  DAIKIN160: { label: 'Daikin 20-byte (ARC423A5)', ceiling: false, togglePower: false },
  DAIKIN152: { label: 'Daikin 19-byte (ARC480A5)', ceiling: false, togglePower: false },
  PANASONIC_AC: { label: 'Âm trần & Treo tường Panasonic Inverter (216-bit)', ceiling: true, togglePower: false },
  PANASONIC_AC32: { label: 'Âm trần Panasonic dòng gọn (32-bit)', ceiling: true, togglePower: true },
  MITSUBISHI_AC: { label: 'Âm trần & Treo tường Mitsubishi Electric', ceiling: true, togglePower: false },
  MITSUBISHI112: { label: 'Âm trần & Treo tường Mitsubishi Electric (112-bit)', ceiling: true, togglePower: false },
  MITSUBISHI136: { label: 'Âm trần & Treo tường Mitsubishi Electric (136-bit)', ceiling: true, togglePower: false },
  MITSUBISHI_HEAVY_152: { label: 'Âm trần Mitsubishi Heavy Industries (152-bit)', ceiling: true, togglePower: false },
  MITSUBISHI_HEAVY_88: { label: 'Mitsubishi Heavy Industries (88-bit)', ceiling: true, togglePower: false },
  TOSHIBA_AC: { label: 'Âm trần & Treo tường Toshiba', ceiling: true, togglePower: false },
  CARRIER_AC64: { label: 'Âm trần & Nối ống gió Carrier (64-bit)', ceiling: true, togglePower: false },
  MIDEA: { label: 'Âm trần & Treo tường Midea / Funiki / Comfee (48-bit)', ceiling: true, togglePower: false },
  COOLIX: { label: 'Funiki R32 / Midea / Casper / Nagakawa (24-bit)', ceiling: false, togglePower: false },
  GREE: { label: 'Âm trần & Treo tường Gree / Casper', ceiling: true, togglePower: false },
  LG: { label: 'Âm trần & Treo tường LG (28-bit)', ceiling: true, togglePower: false },
  LG2: { label: 'Âm trần & Treo tường LG thế hệ 2', ceiling: true, togglePower: false },
  SAMSUNG_AC: { label: 'Âm trần Cassette 360° & Treo tường Samsung', ceiling: true, togglePower: false },
  FUJITSU_AC: { label: 'Âm trần & Treo tường Fujitsu / General', ceiling: true, togglePower: false },
  HITACHI_AC: { label: 'Âm trần & Treo tường Hitachi', ceiling: true, togglePower: false },
  HAIER_AC_YRW02: { label: 'Âm trần & Treo tường Haier / Aqua (YR-W02)', ceiling: true, togglePower: false },
  SHARP_AC: { label: 'Điều hòa Sharp Inverter', ceiling: false, togglePower: false },
  KELVINATOR: { label: 'Gree / Electrolux / Kelvinator (128-bit)', ceiling: false, togglePower: false },
  TCL112AC: { label: 'Điều hòa TCL / Casper (112-bit)', ceiling: false, togglePower: false },
  HAIER_AC: { label: 'Điều hòa Haier / Aqua', ceiling: false, togglePower: false },
  ELECTRA_AC: { label: 'Điều hòa AUX / Sumikura / Electra', ceiling: false, togglePower: false },
  AIRWELL: { label: 'Điều hòa Airwell (Đảo nguồn)', ceiling: false, togglePower: true },
  KELON: { label: 'Điều hòa Kelon / Hisense (Đảo nguồn)', ceiling: false, togglePower: true },
  MIRAGE: { label: 'Điều hòa Mirage', ceiling: false, togglePower: false },
  TECO: { label: 'Điều hòa Teco', ceiling: false, togglePower: false },
  VESTEL_AC: { label: 'Điều hòa Vestel', ceiling: false, togglePower: false },
  TECHNIBEL_AC: { label: 'Điều hòa Technibel', ceiling: false, togglePower: false },
};

export function getAcProtocolLabel(protocol) {
  return AC_PROTOCOL_META[protocol]?.label || protocol;
}

export function isTogglePowerAcProtocol(protocol) {
  return Boolean(AC_PROTOCOL_META[protocol]?.togglePower);
}

export const AC_SETUP_ERRORS = {
  E_BUSY: 'Mạch đang học lệnh, thử lại sau',
  E_PROTOCOL: 'Mạch không hỗ trợ giao thức này',
  E_BAD_REQUEST: 'Sai loại thiết bị hoặc dữ liệu không hợp lệ',
  E_SAVE_FAILED: 'Mạch không lưu được cấu hình',
  E_IR_SEND_FAIL: 'Phát hồng ngoại lỗi',
  E_LEARN_FAIL: 'Hai lần bấm không khớp, thử lại',
  E_TIMEOUT: 'Mạch không phản hồi (kiểm tra mạch còn online)',
  E_NOT_CONFIGURED: 'Chưa cấu hình Supabase',
  E_LEARN_TIMEOUT: 'Hết thời gian chờ bấm remote',
};

export function acSetupErrorText(code) {
  return AC_SETUP_ERRORS[code] || code || 'Lỗi không xác định';
}

// requestId -> { onReply(event, payload) }
const pending = new Map();
const boundChannels = new WeakSet();

function bindReplies(channel) {
  if (boundChannels.has(channel)) return;
  boundChannels.add(channel);
  REPLY_EVENTS.forEach((event) => {
    channel.on('broadcast', { event }, ({ payload }) => {
      const waiter = payload && pending.get(payload.requestId);
      if (waiter) waiter.onReply(event, payload);
    });
  });
}

// Chờ kênh vào xong (joined) trước khi gửi, nếu không sẽ lỡ phản hồi đến sớm của mạch
async function waitJoined(channel, timeoutMs = 3000) {
  const start = Date.now();
  while (channel.state !== 'joined' && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Gửi `event` kèm requestId mới, chờ phản hồi.
 * onReply(event, payload) trả về kết quả để kết thúc, hoặc undefined để chờ tiếp (VD learn_progress).
 */
function request(event, payload, { homeId = DEFAULT_HOME_ID, timeoutMs = 5000, onReply }) {
  if (!isSupabaseConfigured()) return Promise.resolve({ ok: false, error: 'E_NOT_CONFIGURED' });
  const channel = getHomeRealtimeChannel(getSupabase(), homeId);
  if (!channel) return Promise.resolve({ ok: false, error: 'E_NOT_CONFIGURED' });
  bindReplies(channel);

  const requestId = generateRequestId();
  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      pending.delete(requestId);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'E_TIMEOUT' }), timeoutMs);
    pending.set(requestId, {
      onReply: (replyEvent, replyPayload) => {
        const result = onReply(replyEvent, replyPayload);
        if (result !== undefined) finish(result);
      },
    });
    waitJoined(channel)
      .then(() => channel.send({ type: 'broadcast', event, payload: { ...payload, requestId } }))
      .catch(() => finish({ ok: false, error: 'E_TIMEOUT' }));
  });
}

const resultReply = (event, payload) =>
  event === 'setup_result' ? { ok: Boolean(payload.ok), error: payload.error, profileVersion: payload.profileVersion } : undefined;

/** Danh sách thiết bị trên mạch + giao thức gợi ý: { ok, devices, acProtocols, profileVersion } */
export function fetchBoardProfile(options = {}) {
  return request('profile_get', {}, {
    ...options,
    onReply: (event, payload) =>
      event === 'profile_info'
        ? {
            ok: true,
            devices: payload.devices || [],
            acProtocols: payload.acProtocols || [],
            profileVersion: payload.profileVersion,
          }
        : undefined,
  });
}

/** Phát thử một giao thức (mạch không lưu) */
export function tryAcProtocol({ protocol, power = true, temp = 25, mode = 'cool', fan = 'auto' }, options = {}) {
  return request('ac_try', { protocol, power, temp, mode, fan }, { ...options, onReply: resultReply });
}

/** Lưu giao thức cho điều hòa (mạch tạo điều hòa mới nếu chưa có deviceId) */
export function saveAcProtocol({ deviceId, protocol, name }, options = {}) {
  const payload = { deviceId, protocol };
  if (name) payload.name = name;
  return request('ac_set_protocol', payload, { ...options, onReply: resultReply });
}

/**
 * Học một mã IR: mạch bật mắt thu, người dùng bấm phím trên remote thật 2 lần.
 * Trả về { ok, ir, detected, acSupported } hoặc { ok: false, error }.
 * onProgress(status): 'first_captured' | 'mismatch'
 */
export function learnIrCode({ onProgress, timeoutMs = 20000, ...options } = {}) {
  return request('learn_start', {}, {
    ...options,
    timeoutMs,
    onReply: (event, payload) => {
      if (event === 'learn_progress') {
        if (onProgress) onProgress(payload.status);
        return undefined;
      }
      if (event === 'learn_timeout') return { ok: false, error: 'E_LEARN_TIMEOUT' };
      if (event !== 'learn_result') return undefined;
      if (payload.status !== 'ok') return { ok: false, error: payload.status };
      return {
        ok: true,
        ir: payload.ir,
        detected: payload.detected || 'UNKNOWN',
        acSupported: Boolean(payload.acSupported),
      };
    },
  });
}

/** Tự nhận giao thức điều hòa: học một phím trên remote điều hòa rồi xem `detected` */
export const detectAcProtocol = learnIrCode;

/** Lưu phím đã học (ir từ learnIrCode) cho thiết bị bấm nút; mạch tạo thiết bị nếu chưa có */
export function saveLearnedCommand({ deviceId, deviceName, action, ir }, options = {}) {
  const payload = { deviceId, action, ir };
  if (deviceName) payload.deviceName = deviceName;
  return request('profile_put_command', payload, { ...options, onReply: resultReply });
}

/** Phát thử một IrCode (VD mã Tivi theo hãng), mạch không lưu */
export function tryIrCode(ir, options = {}) {
  return request('ir_try', { ir }, { ...options, onReply: resultReply });
}

/**
 * Lưu bộ mã có sẵn của một hãng (preset trong tvPresets.js) cho Tivi: lưu lần lượt từng phím.
 * Dừng ở phím lỗi đầu tiên: { ok: false, error, action }.
 */
export async function saveTvPreset({ deviceId, deviceName, preset }, options = {}) {
  for (const [action, ir] of Object.entries(preset.commands)) {
    const res = await saveLearnedCommand({ deviceId, deviceName, action, ir }, options);
    if (!res.ok) return { ok: false, error: res.error, action };
  }
  return { ok: true };
}

/** Huỷ việc học mã (tắt mắt thu trên mạch) */
export async function cancelLearn({ homeId = DEFAULT_HOME_ID } = {}) {
  if (!isSupabaseConfigured()) return;
  const channel = getHomeRealtimeChannel(getSupabase(), homeId);
  if (channel) await channel.send({ type: 'broadcast', event: 'learn_cancel', payload: {} }).catch(() => {});
}
