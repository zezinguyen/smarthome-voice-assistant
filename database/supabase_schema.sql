-- ====================================================================
-- SMART HOME DATABASE SCHEMA & RPC FUNCTIONS FOR SUPABASE
-- Tuân thủ chặt chẽ theo specs.md và contracts.md v3
-- Hỗ trợ: Đa mạch (multi-board), đa người dùng (multi-user), 
--         kênh Realtime private, xác thực bảo mật RLS, 
--         chống lệnh trùng (dedup), timeout lệnh, trạng thái điều hòa đầy đủ.
-- Hướng dẫn: Mở Supabase Console -> SQL Editor -> Dán toàn bộ file này và bấm RUN
-- ====================================================================

-- Bật extension tạo UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 1. BẢNG NHÀ VÀ THÀNH VIÊN (HOMES & HOME_MEMBERS)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.homes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Nhà của tôi',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.home_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    display_name TEXT DEFAULT 'Thành viên',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (home_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.home_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_by UUID,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    used_count INT DEFAULT 0,
    max_uses INT DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 2. BẢNG MẠCH ĐIỀU KHIỂN (BOARDS)
-- Mỗi phòng có thể có 1 mạch ESP32 riêng
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.boards (
    id TEXT PRIMARY KEY,                            -- Ví dụ: 'board_living_01', 'board_bedroom_01'
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Mạch IR ESP32',
    room TEXT DEFAULT 'Phòng khách',
    firmware TEXT DEFAULT '0.1.0',
    profile_version INT DEFAULT 1 NOT NULL,         -- Tăng khi thiết bị của mạch đổi
    pairing_status TEXT DEFAULT 'paired' CHECK (pairing_status IN ('pending', 'paired', 'blocked')),
    pairing_code_hash TEXT,                         -- Hash mã 6 số lúc ghép đôi
    pairing_expires_at TIMESTAMPTZ,                 -- Hết hạn mã 6 số (10 phút)
    battery INT DEFAULT 100,                        -- % pin 0 - 100
    charging BOOLEAN DEFAULT FALSE,
    usb BOOLEAN DEFAULT FALSE,
    rssi INT DEFAULT -60,                           -- dBm sóng WiFi
    last_seq BIGINT DEFAULT 0 NOT NULL,             -- Bộ đếm seq chống gửi lệnh trễ/lặp
    last_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 3. BẢNG DANH MỤC THIẾT BỊ HỒNG NGOẠI MỞ RỘNG (IR_CATALOG)
-- Danh mục chung cho toàn bộ hệ thống
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.ir_catalog (
    id TEXT PRIMARY KEY,                            -- Ví dụ: 'tv_lg_generic', 'ac_panasonic_generic'
    type TEXT NOT NULL,                             -- 'tv', 'ac', 'fan', 'speaker', 'custom'
    brand TEXT NOT NULL,                            -- 'LG', 'Samsung', 'Panasonic', 'Daikin'...
    model TEXT DEFAULT 'Generic',
    protocol TEXT DEFAULT 'NEC',                    -- Protocol IRremoteESP8266
    commands JSONB DEFAULT '{}'::jsonb,             -- Map { "POWER": { "protocol": "NEC", "code": "0x20DF10EF", "bits": 32 } }
    irac_protocol TEXT,                             -- Ví dụ: 'PANASONIC_AC', 'DAIKIN'
    limits JSONB DEFAULT '{"temp_min": 16, "temp_max": 30}'::jsonb,
    source TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 4. BẢNG THIẾT BỊ TRONG NHÀ (HOME_DEVICES)
-- Gắn thiết bị với mạch điều khiển tương ứng
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.home_devices (
    id TEXT PRIMARY KEY,                            -- Ví dụ: 'tv_living', 'ac_living'
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                             -- 'Tivi phòng khách', 'Điều hòa phòng ngủ'
    room TEXT DEFAULT 'Phòng khách',
    type TEXT NOT NULL DEFAULT 'tv',                -- 'tv', 'ac', 'fan', 'custom'
    brand TEXT DEFAULT 'LG',
    model TEXT DEFAULT 'Generic',
    catalog_id TEXT REFERENCES public.ir_catalog(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 5. BẢNG REMOTE ẢO TỰ TẠO (CUSTOM_REMOTES)
-- Phím tùy biến do người dùng gán từ remote gốc
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.custom_remotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES public.home_devices(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    buttons JSONB NOT NULL DEFAULT '[]'::jsonb,     -- Mảng nút: [{ label, action, voiceAliases, ir }]
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 6. BẢNG LỆNH ĐIỀU KHIỂN & LỊCH SỬ (COMMANDS)
-- Server ghi, gửi xuống mạch; mạch trả ACK cập nhật kết quả
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.commands (
    id TEXT PRIMARY KEY,                            -- commandId (UUID do server sinh)
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    user_id UUID,                                   -- Người ra lệnh (để audit và trả kết quả)
    client_request_id TEXT,                         -- Chống gửi lặp từ app khi timeout 3s
    action TEXT NOT NULL,                           -- 'POWER', 'VOL_UP', 'SET' (AC)...
    params JSONB DEFAULT '{}'::jsonb,               -- Params (temp, mode, fan...)
    seq BIGINT NOT NULL,                            -- Bộ đếm thứ tự tăng dần từ boards.last_seq
    expires_at BIGINT NOT NULL,                     -- Epoch milliseconds (now + 10s)
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'ok', 'error', 'expired')),
    error TEXT,                                     -- 'E_CMD_NOT_FOUND', 'E_IR_SEND_FAIL', 'E_BUSY'...
    duplicate BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    acked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commands_client_req ON public.commands(board_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_commands_expires ON public.commands(expires_at);

-- ====================================================================
-- 7. BẢNG TRẠNG THÁI THIẾT BỊ GẦN NHẤT (DEVICE_STATE)
-- Lưu trạng thái đầy đủ của điều hòa (nhiệt độ, chế độ, quạt, nguồn)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.device_state (
    device_id TEXT PRIMARY KEY REFERENCES public.home_devices(id) ON DELETE CASCADE,
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    power BOOLEAN DEFAULT TRUE NOT NULL,
    temp INT DEFAULT 24 NOT NULL CHECK (temp BETWEEN 16 AND 30),
    mode TEXT DEFAULT 'cool' NOT NULL CHECK (mode IN ('auto', 'cool', 'heat', 'dry', 'fan')),
    fan TEXT DEFAULT 'auto' NOT NULL CHECK (fan IN ('auto', 'min', 'low', 'medium', 'high', 'max')),
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 8. BẢNG PHIÊN HỌC LỆNH TỪ APP (LEARN_SESSIONS)
-- Mỗi mạch chỉ 1 phiên học một lúc
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.learn_sessions (
    id TEXT PRIMARY KEY,                            -- requestId
    board_id TEXT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    user_id UUID,
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'first_captured', 'mismatch', 'completed', 'failed', 'timeout', 'cancelled')),
    ir JSONB,                                       -- Kết quả IrCode sau khi học thành công
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 9. BẢNG MÃ HỌC TỪ NÚT BẤM TRÊN MẠCH (LEARNED_CODES)
-- Người dùng giữ nút 5s trên ESP32 để học, lưu mã chờ gán trong app
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.learned_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    ir JSONB NOT NULL,                              -- { protocol, code, bits } hoặc { raw, freq }
    learned_at_epoch BIGINT,                        -- Epoch giây
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'discarded')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 10. BẢNG BÁO CÁO LỖI (ERROR_REPORTS)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.error_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    device_id TEXT,
    code TEXT NOT NULL,                             -- 'E_CMD_NOT_FOUND', 'E_IR_SEND_FAIL', 'E_LOW_BATTERY'...
    occurred_at_epoch BIGINT,
    firmware TEXT DEFAULT '0.1.0',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- 11. BẢNG YÊU CẦU THIẾT BỊ CHƯA HỖ TRỢ (UNSUPPORTED_REQUESTS)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.unsupported_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID REFERENCES public.homes(id) ON DELETE SET NULL,
    user_id UUID,
    brand TEXT NOT NULL,
    model TEXT,
    device_type TEXT DEFAULT 'tv',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ====================================================================
-- CÁC HÀM STORED PROCEDURE / RPC CHO ESP32 & APP (RPC FUNCTIONS)
-- ====================================================================

-- 1. Hàm mạch gửi ACK sau khi phát IR (board_ack)
CREATE OR REPLACE FUNCTION public.board_ack(
    "commandId" TEXT,
    ok BOOLEAN,
    error TEXT DEFAULT NULL,
    duplicate BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_board_id TEXT;
    v_device_id TEXT;
    v_action TEXT;
    v_params JSONB;
BEGIN
    SELECT board_id, device_id, action, params 
    INTO v_board_id, v_device_id, v_action, v_params
    FROM public.commands 
    WHERE id = "commandId";

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Command not found');
    END IF;

    -- Cập nhật lệnh
    UPDATE public.commands
    SET status = CASE WHEN ok THEN 'ok' ELSE 'error' END,
        error = board_ack.error,
        duplicate = board_ack.duplicate,
        acked_at = timezone('utc'::text, now())
    WHERE id = "commandId";

    -- Cập nhật last_seen_at của mạch
    UPDATE public.boards
    SET last_seen_at = timezone('utc'::text, now())
    WHERE id = v_board_id;

    -- Nếu là lệnh điều hòa và ok, cập nhật bảng device_state
    IF ok AND v_params IS NOT NULL AND jsonb_typeof(v_params) = 'object' THEN
        INSERT INTO public.device_state (device_id, home_id, power, temp, mode, fan, updated_at)
        SELECT 
            d.id, 
            d.home_id, 
            COALESCE((v_params->>'power')::boolean, true),
            COALESCE((v_params->>'temp')::integer, 24),
            COALESCE(v_params->>'mode', 'cool'),
            COALESCE(v_params->>'fan', 'auto'),
            timezone('utc'::text, now())
        FROM public.home_devices d
        WHERE d.id = v_device_id
        ON CONFLICT (device_id) DO UPDATE SET
            power = COALESCE((v_params->>'power')::boolean, public.device_state.power),
            temp = COALESCE((v_params->>'temp')::integer, public.device_state.temp),
            mode = COALESCE(v_params->>'mode', public.device_state.mode),
            fan = COALESCE(v_params->>'fan', public.device_state.fan),
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Hàm mạch báo sự kiện học lệnh (board_learn_event)
CREATE OR REPLACE FUNCTION public.board_learn_event(
    event TEXT,
    "requestId" TEXT,
    status TEXT,
    ir JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.learn_sessions
    SET status = board_learn_event.status,
        ir = COALESCE(board_learn_event.ir, public.learn_sessions.ir),
        updated_at = timezone('utc'::text, now())
    WHERE id = "requestId";

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Hàm mạch báo trạng thái pin, wifi, rssi định kỳ (board_status)
CREATE OR REPLACE FUNCTION public.board_status(
    battery INT,
    charging BOOLEAN,
    usb BOOLEAN,
    rssi INT,
    firmware TEXT,
    "profileVersion" INT,
    "pendingLearnedCodes" INT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_board_id TEXT;
BEGIN
    -- Mạch truyền ID của nó hoặc lấy từ claim
    -- Tạm thời cập nhật theo mạch đang kết nối
    UPDATE public.boards
    SET battery = board_status.battery,
        charging = board_status.charging,
        usb = board_status.usb,
        rssi = board_status.rssi,
        firmware = COALESCE(board_status.firmware, public.boards.firmware),
        profile_version = COALESCE(board_status."profileVersion", public.boards.profile_version),
        last_seen_at = timezone('utc'::text, now())
    WHERE id = (SELECT id FROM public.boards ORDER BY last_seen_at DESC LIMIT 1);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Hàm App gửi lệnh điều khiển (send_command)
-- Thay thế hoàn toàn việc gọi HTTP trực tiếp vào mạch!
CREATE OR REPLACE FUNCTION public.send_command(
    p_device_id TEXT,
    p_action TEXT,
    p_params JSONB DEFAULT '{}'::jsonb,
    p_client_request_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_device RECORD;
    v_board RECORD;
    v_state RECORD;
    v_command_id TEXT;
    v_seq BIGINT;
    v_expires_at BIGINT;
    v_full_params JSONB := COALESCE(p_params, '{}'::jsonb);
    v_existing_cmd RECORD;
BEGIN
    -- 1. Tìm thông tin thiết bị
    SELECT id, home_id, board_id, type 
    INTO v_device
    FROM public.home_devices 
    WHERE id = p_device_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'E_DEVICE_NOT_FOUND', 'message', 'Không tìm thấy thiết bị');
    END IF;

    -- 2. Kiểm tra mạch phụ trách
    SELECT id, last_seq, last_seen_at, profile_version
    INTO v_board
    FROM public.boards
    WHERE id = v_device.board_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'E_BOARD_NOT_FOUND', 'message', 'Mạch điều khiển không tồn tại');
    END IF;

    -- Kiểm tra mạch online (last_seen_at trong vòng 6 phút)
    IF v_board.last_seen_at < (timezone('utc'::text, now()) - INTERVAL '6 minutes') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'E_BOARD_OFFLINE', 
            'message', 'Mạch điều khiển đang ngoại tuyến (offline)'
        );
    END IF;

    -- 3. Xử lý thử lại an toàn (Idempotency với client_request_id)
    IF p_client_request_id IS NOT NULL THEN
        SELECT id, status, error, seq, expires_at INTO v_existing_cmd
        FROM public.commands
        WHERE board_id = v_device.board_id AND client_request_id = p_client_request_id
        ORDER BY sent_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'commandId', v_existing_cmd.id,
                'status', v_existing_cmd.status,
                'isRetry', true,
                'boardId', v_device.board_id,
                'seq', v_existing_cmd.seq,
                'expiresAt', v_existing_cmd.expires_at
            );
        END IF;
    END IF;

    -- 4. Nếu là điều hòa, ghép trạng thái đầy đủ
    IF v_device.type = 'ac' THEN
        SELECT power, temp, mode, fan INTO v_state
        FROM public.device_state
        WHERE device_id = p_device_id;

        -- Giữ nguyên các tham số mở rộng (protocol, forceToggle, keepPower) cho điều hòa âm trần
        v_full_params := COALESCE(p_params, '{}'::jsonb) || jsonb_build_object(
            'power', COALESCE((p_params->>'power')::boolean, v_state.power, true),
            'temp', COALESCE((p_params->>'temp')::integer, v_state.temp, 24),
            'mode', COALESCE(p_params->>'mode', v_state.mode, 'cool'),
            'fan', COALESCE(p_params->>'fan', v_state.fan, 'auto')
        );
        IF p_action = 'POWER_OFF' THEN
            v_full_params := jsonb_set(v_full_params, '{power}', 'false'::jsonb);
        END IF;
    END IF;

    -- 5. Tăng seq và tạo commandId
    v_seq := v_board.last_seq + 1;
    UPDATE public.boards SET last_seq = v_seq WHERE id = v_board.id;

    v_command_id := gen_random_uuid()::text;
    v_expires_at := (extract(epoch from now()) * 1000 + 10000)::bigint; -- Epoch ms + 10s

    -- 6. Ghi vào bảng commands
    INSERT INTO public.commands (
        id, home_id, board_id, device_id, client_request_id,
        action, params, seq, expires_at, status
    ) VALUES (
        v_command_id, v_device.home_id, v_board.id, p_device_id, p_client_request_id,
        p_action, v_full_params, v_seq, v_expires_at, 'sent'
    );

    RETURN jsonb_build_object(
        'success', true,
        'commandId', v_command_id,
        'boardId', v_board.id,
        'deviceId', p_device_id,
        'action', p_action,
        'params', v_full_params,
        'seq', v_seq,
        'expiresAt', v_expires_at,
        'status', 'sent'
    );
END;
$$;

-- 5. Hàm ghép đôi mạch mới bằng mã 6 số (pair_board)
CREATE OR REPLACE FUNCTION public.pair_board(
    p_pairing_code TEXT,
    p_board_name TEXT DEFAULT 'Mạch IR ESP32',
    p_room TEXT DEFAULT 'Phòng khách',
    p_home_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_home_id UUID := p_home_id;
    v_board RECORD;
BEGIN
    -- Nếu chưa chọn home, lấy home đầu tiên
    IF v_home_id IS NULL THEN
        SELECT id INTO v_home_id FROM public.homes LIMIT 1;
    END IF;

    IF v_home_id IS NULL THEN
        INSERT INTO public.homes (name) VALUES ('Nhà của tôi') RETURNING id INTO v_home_id;
    END IF;

    -- Tìm mạch có mã pairing khớp và chưa hết hạn
    SELECT id, pairing_status INTO v_board
    FROM public.boards
    WHERE pairing_code_hash = p_pairing_code
      AND pairing_expires_at > timezone('utc'::text, now())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã ghép đôi không đúng hoặc đã hết hạn 10 phút.');
    END IF;

    -- Hoàn tất ghép đôi
    UPDATE public.boards
    SET home_id = v_home_id,
        name = COALESCE(p_board_name, name),
        room = COALESCE(p_room, room),
        pairing_status = 'paired',
        pairing_code_hash = NULL,
        pairing_expires_at = NULL,
        last_seen_at = timezone('utc'::text, now())
    WHERE id = v_board.id;

    RETURN jsonb_build_object(
        'success', true,
        'boardId', v_board.id,
        'homeId', v_home_id,
        'message', 'Ghép đôi mạch ESP32 thành công!'
    );
END;
$$;

-- 6. Hàm gán mã IR học được từ nút bấm (assign_learned_code)
CREATE OR REPLACE FUNCTION public.assign_learned_code(
    p_code_id UUID,
    p_device_id TEXT,
    p_action TEXT,
    p_label TEXT DEFAULT 'Nút bấm mới',
    p_voice_aliases TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_code RECORD;
    v_device RECORD;
    v_remote RECORD;
    v_new_button JSONB;
BEGIN
    SELECT * INTO v_code FROM public.learned_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã IR không tồn tại');
    END IF;

    SELECT * INTO v_device FROM public.home_devices WHERE id = p_device_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Thiết bị không tồn tại');
    END IF;

    v_new_button := jsonb_build_object(
        'label', p_label,
        'action', p_action,
        'voiceAliases', to_jsonb(p_voice_aliases),
        'ir', v_code.ir
    );

    -- Tìm hoặc tạo remote ảo
    SELECT * INTO v_remote FROM public.custom_remotes WHERE device_id = p_device_id LIMIT 1;
    IF FOUND THEN
        UPDATE public.custom_remotes
        SET buttons = buttons || v_new_button
        WHERE id = v_remote.id;
    ELSE
        INSERT INTO public.custom_remotes (home_id, device_id, name, buttons)
        VALUES (v_device.home_id, p_device_id, 'Remote ' || v_device.name, jsonb_build_array(v_new_button));
    END IF;

    -- Đánh dấu mã đã gán
    UPDATE public.learned_codes SET status = 'assigned' WHERE id = p_code_id;

    -- Tăng profile_version của mạch để mạch tải lại profile mới
    UPDATE public.boards SET profile_version = profile_version + 1 WHERE id = v_device.board_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã gán mã IR vào thiết bị thành công');
END;
$$;

-- ====================================================================
-- 7. RPC: TẠO MÃ MỜI THÀNH VIÊN VÀO NHÀ (CREATE_HOME_INVITE)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.create_home_invite(
    p_home_id UUID,
    p_role TEXT DEFAULT 'member',
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code TEXT;
    v_invite public.home_invites;
    v_home_name TEXT;
BEGIN
    SELECT name INTO v_home_name FROM public.homes WHERE id = p_home_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'E_HOME_NOT_FOUND', 'message', 'Không tìm thấy thông tin nhà');
    END IF;

    -- Vô hiệu hóa các mã mời cũ đang mở của nhà này
    UPDATE public.home_invites
    SET is_active = FALSE
    WHERE home_id = p_home_id AND is_active = TRUE;

    -- Sinh mã 6 ký tự ngẫu nhiên chữ hoa và số
    v_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT), 1, 6));

    INSERT INTO public.home_invites (home_id, invite_code, role, created_by, expires_at)
    VALUES (p_home_id, v_code, p_role, p_created_by, now() + interval '24 hours')
    RETURNING * INTO v_invite;

    RETURN jsonb_build_object(
        'success', true,
        'inviteCode', v_code,
        'expiresAt', v_invite.expires_at,
        'homeId', p_home_id,
        'homeName', v_home_name,
        'message', 'Đã tạo mã mời gia đình thành công'
    );
END;
$$;

-- ====================================================================
-- 8. RPC: THAM GIA NHÀ BẰNG MÃ MỜI (JOIN_HOME_WITH_INVITE)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.join_home_with_invite(
    p_invite_code TEXT,
    p_user_id UUID,
    p_display_name TEXT DEFAULT 'Thành viên mới'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invite public.home_invites;
    v_home public.homes;
BEGIN
    -- Tìm mã mời hợp lệ
    SELECT * INTO v_invite
    FROM public.home_invites
    WHERE invite_code = UPPER(TRIM(p_invite_code))
      AND is_active = TRUE
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'E_INVALID_INVITE', 'message', 'Mã mời không tồn tại hoặc đã hết hạn');
    END IF;

    IF v_invite.used_count >= v_invite.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'E_INVITE_MAXED', 'message', 'Mã mời đã đạt số lượng thành viên tối đa');
    END IF;

    SELECT * INTO v_home FROM public.homes WHERE id = v_invite.home_id;

    -- Thêm hoặc cập nhật vai trò của thành viên trong nhà
    INSERT INTO public.home_members (home_id, user_id, role, display_name)
    VALUES (v_invite.home_id, p_user_id, v_invite.role, p_display_name)
    ON CONFLICT (home_id, user_id) DO UPDATE
    SET role = v_invite.role, display_name = EXCLUDED.display_name;

    -- Tăng số lần dùng
    UPDATE public.home_invites
    SET used_count = used_count + 1
    WHERE id = v_invite.id;

    RETURN jsonb_build_object(
        'success', true,
        'homeId', v_home.id,
        'homeName', v_home.name,
        'role', v_invite.role,
        'message', 'Chào mừng bạn đã gia nhập nhà ' || v_home.name
    );
END;
$$;

-- ====================================================================
-- 9. RPC: XÓA THÀNH VIÊN KHỎI NHÀ (REMOVE_HOME_MEMBER)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.remove_home_member(
    p_home_id UUID,
    p_member_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_role TEXT;
    v_owner_count INT;
BEGIN
    -- Kiểm tra người bị xóa
    SELECT role INTO v_target_role
    FROM public.home_members
    WHERE home_id = p_home_id AND user_id = p_member_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'E_NOT_FOUND', 'message', 'Thành viên không thuộc nhà này');
    END IF;

    -- Nếu là chủ nhà, kiểm tra xem có phải chủ nhà duy nhất không
    IF v_target_role = 'owner' THEN
        SELECT COUNT(*) INTO v_owner_count
        FROM public.home_members
        WHERE home_id = p_home_id AND role = 'owner';

        IF v_owner_count <= 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'E_LAST_OWNER', 'message', 'Không thể xóa chủ nhà duy nhất');
        END IF;
    END IF;

    DELETE FROM public.home_members
    WHERE home_id = p_home_id AND user_id = p_member_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã gỡ thành viên khỏi nhà thành công');
END;
$$;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) & PHÂN QUYỀN TRUY CẬP
-- ====================================================================
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ir_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_remotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsupported_requests ENABLE ROW LEVEL SECURITY;

-- Cho phép đọc/ghi công khai qua anon key trong môi trường phát triển & Mini App
DROP POLICY IF EXISTS "Public access homes" ON public.homes;
CREATE POLICY "Public access homes" ON public.homes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access home_members" ON public.home_members;
CREATE POLICY "Public access home_members" ON public.home_members FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access home_invites" ON public.home_invites;
CREATE POLICY "Public access home_invites" ON public.home_invites FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access boards" ON public.boards;
CREATE POLICY "Public access boards" ON public.boards FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access catalog" ON public.ir_catalog;
CREATE POLICY "Public access catalog" ON public.ir_catalog FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access home_devices" ON public.home_devices;
CREATE POLICY "Public access home_devices" ON public.home_devices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access custom_remotes" ON public.custom_remotes;
CREATE POLICY "Public access custom_remotes" ON public.custom_remotes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access commands" ON public.commands;
CREATE POLICY "Public access commands" ON public.commands FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access device_state" ON public.device_state;
CREATE POLICY "Public access device_state" ON public.device_state FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access learn_sessions" ON public.learn_sessions;
CREATE POLICY "Public access learn_sessions" ON public.learn_sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access learned_codes" ON public.learned_codes;
CREATE POLICY "Public access learned_codes" ON public.learned_codes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access error_reports" ON public.error_reports;
CREATE POLICY "Public access error_reports" ON public.error_reports FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- KÍCH HOẠT SUPABASE REALTIME CHO CÁC BẢNG QUAN TRỌNG
-- ====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'commands') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.commands;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'device_state') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.device_state;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'boards') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.boards;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'learn_sessions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.learn_sessions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'learned_codes') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.learned_codes;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'home_devices') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.home_devices;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'home_members') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.home_members;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'home_invites') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.home_invites;
    END IF;
END $$;

-- ====================================================================
-- DỮ LIỆU KHỞI TẠO MẶC ĐỊNH (SEED DATA)
-- ====================================================================
INSERT INTO public.homes (id, name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Nhà thông minh của tôi')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.home_members (home_id, user_id, role, display_name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-0000000000aa'::uuid, 'owner', 'Chủ nhà (Mặc định)')
ON CONFLICT (home_id, user_id) DO NOTHING;

INSERT INTO public.boards (id, home_id, name, room, firmware, profile_version, pairing_status, battery, charging, usb, rssi, last_seen_at)
VALUES (
    'board_living_01', 
    '00000000-0000-0000-0000-000000000001'::uuid, 
    'Mạch IR Phòng Khách', 
    'Phòng khách', 
    '0.1.0', 
    1, 
    'paired', 
    85, 
    false, 
    true, 
    -58,
    timezone('utc'::text, now())
)
ON CONFLICT (id) DO UPDATE SET
    last_seen_at = timezone('utc'::text, now());

-- Danh mục mẫu: TV LG & Điều hòa Panasonic
INSERT INTO public.ir_catalog (id, type, brand, model, protocol, commands, irac_protocol, limits)
VALUES 
(
    'tv_lg_generic',
    'tv',
    'LG',
    'Smart TV Generic',
    'NEC',
    '{
        "POWER": {"protocol": "NEC", "code": "0x20DF10EF", "bits": 32},
        "TV_POWER_ON": {"protocol": "NEC", "code": "0x20DF10EF", "bits": 32},
        "TV_POWER_OFF": {"protocol": "NEC", "code": "0x20DF10EF", "bits": 32},
        "VOL_UP": {"protocol": "NEC", "code": "0x20DF40BF", "bits": 32},
        "VOL_DOWN": {"protocol": "NEC", "code": "0x20DFC03F", "bits": 32},
        "MUTE": {"protocol": "NEC", "code": "0x20DF906F", "bits": 32},
        "CH_VTV1": {"protocol": "NEC", "code": "0x20DF00FF", "bits": 32},
        "CH_VTV3": {"protocol": "NEC", "code": "0x20DF08F7", "bits": 32},
        "APP_YOUTUBE": {"protocol": "NEC", "code": "0x20DF58A7", "bits": 32}
    }'::jsonb,
    NULL,
    '{}'::jsonb
),
(
    'ac_panasonic_generic',
    'ac',
    'Panasonic',
    'Inverter AC Generic',
    NULL,
    '{}'::jsonb,
    'PANASONIC_AC',
    '{"temp_min": 16, "temp_max": 30, "modes": ["auto", "cool", "heat", "dry", "fan"]}'::jsonb
),
(
    'ac_daikin_ceiling_brc52a62',
    'ac',
    'Daikin',
    'Ceiling Cassette BRC52A62',
    NULL,
    '{}'::jsonb,
    'DAIKIN64',
    '{"temp_min": 16, "temp_max": 30, "modes": ["cool", "heat", "dry", "fan", "auto"]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Thiết bị trong nhà
INSERT INTO public.home_devices (id, home_id, board_id, name, room, type, brand, catalog_id)
VALUES 
    ('tv_living', '00000000-0000-0000-0000-000000000001'::uuid, 'board_living_01', 'Tivi LG Phòng Khách', 'Phòng khách', 'tv', 'LG', 'tv_lg_generic'),
    ('ac_living', '00000000-0000-0000-0000-000000000001'::uuid, 'board_living_01', 'Điều hòa Âm trần Daikin', 'Phòng khách', 'ac', 'Daikin', 'ac_daikin_ceiling_brc52a62'),
    ('ac_funiki', '00000000-0000-0000-0000-000000000001'::uuid, 'board_living_01', 'Điều hòa Âm trần Daikin', 'Phòng khách', 'ac', 'Daikin', 'ac_daikin_ceiling_brc52a62')
ON CONFLICT (id) DO NOTHING;

-- Khởi tạo trạng thái điều hòa ban đầu
INSERT INTO public.device_state (device_id, home_id, power, temp, mode, fan)
VALUES
    ('ac_living', '00000000-0000-0000-0000-000000000001'::uuid, false, 24, 'cool', 'auto'),
    ('ac_funiki', '00000000-0000-0000-0000-000000000001'::uuid, false, 24, 'cool', 'auto')
ON CONFLICT (device_id) DO NOTHING;
