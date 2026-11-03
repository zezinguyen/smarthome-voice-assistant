import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendIotCommand, getIotConfig, saveIotConfig, resetHomeChannels } from './iotService';
import * as supabaseClientModule from './supabaseClient';

// Mock localStorage nếu chạy trong môi trường Node/Vitest thuần
const mockStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
globalThis.localStorage = mockStorage;

describe('iotService - Seam 1 (Command & Realtime ACK Bridge)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage.clear();
    resetHomeChannels();
  });

  describe('Validation & Configuration', () => {
    it('từ chối khi command null hoặc action là UNKNOWN', async () => {
      const resNull = await sendIotCommand(null);
      expect(resNull).toEqual({
        success: false,
        message: 'Lệnh không hợp lệ để gửi'
      });

      const resUnknown = await sendIotCommand({ action: 'UNKNOWN' });
      expect(resUnknown).toEqual({
        success: false,
        message: 'Lệnh không hợp lệ để gửi'
      });
    });

    it('từ chối và yêu cầu cấu hình khi chưa có Supabase URL / Anon Key', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured').mockReturnValue(false);

      const res = await sendIotCommand({ action: 'POWER', deviceId: 'tv_living' });
      expect(res).toEqual({
        success: false,
        message: 'Chưa cấu hình Supabase! Vui lòng vào Cài đặt để nhập URL & Anon Key.'
      });
    });

    it('lưu và đọc cấu hình IOT từ localStorage chính xác', () => {
      saveIotConfig({ autoSend: false, tvBrand: 'Samsung', acBrand: 'Daikin' });
      const config = getIotConfig();
      expect(config).toEqual({
        autoSend: false,
        tvBrand: 'Samsung',
        acBrand: 'Daikin'
      });
    });
  });

  describe('Gửi lệnh & Bắt tay Realtime Broadcast / ACK với ESP32', () => {
    it('gửi lệnh thành công khi ESP32 phản hồi ACK ok qua WebSocket Realtime', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured').mockReturnValue(true);

      let broadcastHandler = null;
      let sentBroadcast = null;

      // Giả lập Channel Realtime của Supabase
      const mockChannel = {
        state: 'joined',
        subscribe: vi.fn((cb) => { if (cb) cb('SUBSCRIBED'); return mockChannel; }),
        send: vi.fn(async (msg) => {
          sentBroadcast = msg;
          // Giả lập ESP32 nhận được lệnh và phản hồi ACK ngay lập tức sau 10ms
          if (msg.event === 'command' && broadcastHandler) {
            setTimeout(() => {
              broadcastHandler({
                payload: {
                  commandId: msg.payload.commandId,
                  ok: true
                }
              });
            }, 10);
          }
          return 'ok';
        }),
        on: vi.fn((type, filter, handler) => {
          if (type === 'broadcast' && filter.event === 'ack') {
            broadcastHandler = handler;
          }
          return mockChannel;
        })
      };

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: true,
            commandId: 'cmd_test_001',
            seq: 101,
            expiresAt: Date.now() + 10000,
            params: { power: true }
          },
          error: null
        }),
        channel: vi.fn().mockReturnValue(mockChannel),
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        })
      };

      vi.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const res = await sendIotCommand({
        action: 'POWER',
        deviceId: 'tv_living',
        title: 'Bật Tivi'
      });

      // 1. Kiểm tra RPC send_command đã được gọi đúng
      expect(mockSupabase.rpc).toHaveBeenCalledWith('send_command', expect.objectContaining({
        p_device_id: 'tv_living',
        p_action: 'POWER'
      }));

      // 2. Kiểm tra lệnh đã được broadcast xuống kênh home:<homeId>
      expect(sentBroadcast).not.toBeNull();
      expect(sentBroadcast.type).toBe('broadcast');
      expect(sentBroadcast.event).toBe('command');
      expect(sentBroadcast.payload.commandId).toBe('cmd_test_001');

      // 3. Kết quả trả về phải là thành công từ ACK của ESP32
      expect(res.success).toBe(true);
      expect(res.commandId).toBe('cmd_test_001');
      expect(res.message).toContain('thành công');
    });

    it('giữ nguyên protocol, forceToggle, keepPower cho điều hòa âm trần khi RPC trả về params rút gọn', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured').mockReturnValue(true);

      let broadcastHandler = null;
      let sentBroadcast = null;

      const mockChannel = {
        state: 'joined',
        subscribe: vi.fn((cb) => { if (cb) cb('SUBSCRIBED'); return mockChannel; }),
        send: vi.fn(async (msg) => {
          sentBroadcast = msg;
          if (msg.event === 'command' && broadcastHandler) {
            setTimeout(() => {
              broadcastHandler({
                payload: { commandId: msg.payload.commandId, ok: true }
              });
            }, 10);
          }
          return 'ok';
        }),
        on: vi.fn((type, filter, handler) => {
          if (type === 'broadcast' && filter.event === 'ack') {
            broadcastHandler = handler;
          }
          return mockChannel;
        })
      };

      // Giả lập DB RPC cũ chỉ trả về { power, temp, mode, fan }, làm mất protocol/keepPower/forceToggle
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: true,
            commandId: 'cmd_ac_ceiling_01',
            seq: 205,
            expiresAt: Date.now() + 10000,
            params: { power: true, temp: 23, mode: 'cool', fan: 'auto' }
          },
          error: null
        }),
        channel: vi.fn().mockReturnValue(mockChannel),
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        })
      };

      vi.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const res = await sendIotCommand({
        deviceId: 'ac_funiki',
        action: 'SET',
        title: 'Điều hòa âm trần 23°C',
        power: true,
        temp: 23,
        mode: 'cool',
        fan: 'high',
        protocol: 'DAIKIN64',
        keepPower: true,
        forceToggle: false
      });

      expect(res.success).toBe(true);
      expect(sentBroadcast.payload.params).toEqual({
        power: true,
        temp: 23,
        mode: 'cool',
        fan: 'high',
        protocol: 'DAIKIN64',
        keepPower: true,
        forceToggle: false
      });
    });

    it('báo lỗi khi ESP32 trả về ACK thất bại (E_IR_SEND_FAIL)', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured').mockReturnValue(true);

      let broadcastHandler = null;

      const mockChannel = {
        state: 'joined',
        subscribe: vi.fn(),
        send: vi.fn(async (msg) => {
          if (msg.event === 'command' && broadcastHandler) {
            setTimeout(() => {
              broadcastHandler({
                payload: {
                  commandId: msg.payload.commandId,
                  ok: false,
                  error: 'E_IR_SEND_FAIL'
                }
              });
            }, 10);
          }
          return 'ok';
        }),
        on: vi.fn((type, filter, handler) => {
          if (type === 'broadcast' && filter.event === 'ack') {
            broadcastHandler = handler;
          }
          return mockChannel;
        })
      };

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: true,
            commandId: 'cmd_fail_002',
            seq: 102,
            expiresAt: Date.now() + 10000,
            params: {}
          },
          error: null
        }),
        channel: vi.fn().mockReturnValue(mockChannel),
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        })
      };

      vi.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const res = await sendIotCommand({
        action: 'TV_POWER_ON',
        deviceId: 'tv_living'
      });

      expect(res.success).toBe(false);
      expect(res.commandId).toBe('cmd_fail_002');
      expect(res.message).toContain('E_IR_SEND_FAIL');
    });

    it('báo mạch ngoại tuyến khi RPC trả về lỗi E_BOARD_OFFLINE', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured').mockReturnValue(true);

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: false,
            error: 'E_BOARD_OFFLINE'
          },
          error: null
        })
      };

      vi.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const res = await sendIotCommand({
        action: 'POWER',
        deviceId: 'tv_living'
      });

      expect(res.success).toBe(false);
      expect(res.isOffline).toBe(true);
      expect(res.message).toContain('ngoại tuyến');
    });

    it('vẫn phát lệnh qua Realtime khi RPC báo E_BOARD_OFFLINE giả nhưng ESP32 đang online qua Presence', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured').mockReturnValue(true);

      let broadcastHandler = null;
      let sentBroadcast = null;

      const mockChannel = {
        topic: 'realtime:home:00000000-0000-0000-0000-000000000001',
        state: 'joined',
        presenceState: () => ({ board_esp32_live: [{ battery: 95, rssi: -55 }] }),
        subscribe: vi.fn((cb) => { if (cb) cb('SUBSCRIBED'); return mockChannel; }),
        send: vi.fn(async (msg) => {
          sentBroadcast = msg;
          if (msg.event === 'command' && broadcastHandler) {
            setTimeout(() => {
              broadcastHandler({ payload: { commandId: msg.payload.commandId, ok: true } });
            }, 10);
          }
          return 'ok';
        }),
        on: vi.fn((type, filter, handler) => {
          if (type === 'broadcast' && filter.event === 'ack') {
            broadcastHandler = handler;
          }
          return mockChannel;
        })
      };

      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        channels: [mockChannel],
        rpc: vi.fn().mockResolvedValue({
          data: { success: false, error: 'E_BOARD_OFFLINE' },
          error: null
        }),
        channel: vi.fn().mockReturnValue(mockChannel),
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: mockUpdateEq
          })
        })
      };

      vi.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const res = await sendIotCommand({
        deviceId: 'ac_funiki',
        action: 'POWER_ON',
        title: 'Bật điều hòa âm trần 22°C',
        power: true,
        temp: 22,
        mode: 'cool',
        fan: 'high',
        protocol: 'DAIKIN64',
        forceToggle: true
      });

      expect(res.success).toBe(true);
      expect(sentBroadcast).not.toBeNull();
      expect(sentBroadcast.payload.params).toMatchObject({
        power: true,
        temp: 22,
        protocol: 'DAIKIN64',
        forceToggle: true
      });
      // Đảm bảo đã đồng bộ trạng thái điều hòa xuống bảng device_state
      expect(mockSupabase.from).toHaveBeenCalledWith('device_state');
    });
  });
});
