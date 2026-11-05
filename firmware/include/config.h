#pragma once
// =============================================================================
// config.h – NƠI DUY NHẤT đặt thông số và chân GPIO.
// Không viết số "magic" (chân, thời gian, ngưỡng) trong module; thêm vào đây.
// =============================================================================

#include <stddef.h>
#include <stdint.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define USING_EXAMPLE_SECRETS 1  // main.cpp sẽ cảnh báo
#include "secrets.example.h"
#endif

#define FIRMWARE_VERSION "0.1.0"

// -----------------------------------------------------------------------------
// Chân GPIO theo board (chọn bằng -DBOARD_xxx trong platformio.ini)
// -----------------------------------------------------------------------------
#if defined(BOARD_ESP32_DEVKIT)

// DevKit 30 chân. Chia theo cạnh board để dây gọn (xem docs/specs.md mục 3.3):
//   Cạnh phải: OLED (trên), mắt thu IR, DFPlayer – các module đặt bên phải
//   Cạnh trái: đo pin/sạc (trên, gần TP4056), LED RGB, LED IR, nút (cạnh chân GND)
// Tránh chân strapping 0, 2, 5, 12, 15 và chân flash 6–11.

// --- Cạnh phải ---
constexpr uint8_t PIN_OLED_SCL = 22;
constexpr uint8_t PIN_OLED_SDA = 21;
constexpr int8_t PIN_IR_RX_POWER = -1;     // Chân cấp nguồn mắt thu; -1 = VCC mắt thu nối thẳng 3V3
constexpr uint8_t PIN_IR_RX = 18;          // OUT mắt thu
constexpr uint8_t PIN_AUDIO_TX = 17;       // TX2 -> DFPlayer RX (cùng mức 3.3V, nối thẳng)
constexpr uint8_t PIN_AUDIO_RX = 16;       // RX2 <- DFPlayer TX
constexpr uint8_t PIN_IR_TX = 14;          // Trở 330Ω -> chân B của S8050

// --- Cạnh trái ---
constexpr uint8_t PIN_BATTERY_ADC = 36;    // VP: cầu chia 100k/100k từ B+ (ADC1, chỉ vào)
constexpr uint8_t PIN_USB_SENSE = 39;      // VN: cầu chia 100k/100k từ IN+ của TP4056
constexpr uint8_t PIN_LED_RED = 27;        // LED RGB cathode chung: kéo lên = sáng
constexpr uint8_t PIN_LED_GREEN = 26;
constexpr uint8_t PIN_LED_BLUE = 25;
constexpr uint8_t PIN_BUTTON = 15;         // Nút -> chân GND ngay bên dưới

constexpr uint8_t AUDIO_UART_NUM = 2;      // UART phần cứng nối DFPlayer

#else
#error "Chua chon board: them -DBOARD_xxx vao build_flags va khai bao chan o day"
#endif

// Mức tích cực của phần cứng
constexpr bool BUTTON_ACTIVE_LOW = true;       // Nút nối GND, dùng pull-up trong
constexpr bool STATUS_LED_ACTIVE_HIGH = true;   // LED RGB cathode chung (chân chung về GND)
constexpr uint8_t STATUS_LED_BRIGHTNESS = 40;   // Độ sáng PWM 0..255 (255 = sáng hết cỡ, chói)
constexpr bool IR_RX_POWER_ACTIVE_HIGH = true;

// -----------------------------------------------------------------------------
// Pin / nguồn
// -----------------------------------------------------------------------------
constexpr float BATTERY_DIVIDER_RATIO = 2.010f;  // Cầu chia đo thực tế: (100.8k + 99.8k) / 99.8k
constexpr uint16_t USB_SENSE_MIN_MV = 1500;     // Đo ở chân VN: >= ngưỡng = đang cắm USB (5V/2 = 2.5V)
// Module TP4056 không đưa chân CHRG ra: cắm USB mà pin dưới ngưỡng này thì coi là đang sạc.
// Khi đang sạc, điện áp đo được cao hơn điện áp nghỉ của pin -> % hiển thị lúc sạc chỉ tương đối.
constexpr uint16_t BATTERY_FULL_MV = 4150;
constexpr uint8_t BATTERY_SAMPLES = 16;         // Số mẫu ADC mỗi lần đo, lấy trung vị (bỏ mẫu lệch khi WiFi phát)
constexpr uint32_t BATTERY_SAMPLE_INTERVAL_MS = 5UL * 1000;
constexpr uint8_t BATTERY_FILTER_SHIFT = 4;      // Làm mượt 1/16 mỗi lần đo (~80s): pin sụt ~90mV mỗi lần WiFi phát
constexpr uint8_t BATTERY_LOW_PERCENT = 20;      // Báo chủ nhà
constexpr uint8_t BATTERY_CRITICAL_PERCENT = 10; // Tắt OLED/loa
constexpr uint8_t BATTERY_EMPTY_PERCENT = 5;     // Báo "sắp hết pin", chỉ giữ chức năng cơ bản
constexpr uint8_t BATTERY_HYSTERESIS_PERCENT = 2;

constexpr uint32_t CPU_FREQ_BATTERY_MHZ = 80;   // Không hạ dưới 80 khi còn dùng WiFi
constexpr uint32_t CPU_FREQ_USB_MHZ = 240;
constexpr uint32_t IR_TX_CPU_FREQ_MHZ = 240;    // Lúc phát IR: sóng mang tạo bằng phần mềm, CPU chậm làm sai 38kHz
constexpr bool WIFI_USE_MAX_MODEM_SLEEP = false; // true = WIFI_PS_MAX_MODEM khi chạy pin

// -----------------------------------------------------------------------------
// WiFi / kết nối lại
// -----------------------------------------------------------------------------
constexpr uint8_t WIFI_MAX_NETWORKS = 3;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15UL * 1000;
constexpr uint32_t WIFI_SETUP_AP_AFTER_MS = 5UL * 60 * 1000; // Mất WiFi lâu -> bật AP cài đặt
constexpr const char* WIFI_SETUP_AP_PREFIX = "SmartHome-";
constexpr uint8_t WIFI_SETUP_AP_PASSWORD_LENGTH = 10; // Sinh ngẫu nhiên mỗi lần, hiện trên OLED
// Trang cài WiFi trên WiFi riêng (captive portal): chỉ để nhập WiFi nhà (spec 9.2 D)
constexpr uint16_t WEB_PORT = 80;
constexpr uint16_t DNS_PORT = 53;
constexpr uint8_t WIFI_SCAN_MAX_RESULTS = 15;
constexpr uint32_t WIFI_SETUP_LINGER_MS = 30UL * 1000;     // Vào được WiFi nhà rồi giữ WiFi riêng thêm để trang kịp hiện IP
constexpr uint32_t WIFI_SETUP_IDLE_MS = 10UL * 60 * 1000;  // Đang có WiFi nhà mà không ai nhập WiFi mới -> tắt WiFi riêng
constexpr size_t WEB_MAX_BODY = 2048;                     // Request JSON lớn nhất nhận qua web

constexpr uint32_t RECONNECT_BASE_MS = 2000;   // 2s -> 4s -> 8s ... -> 60s
constexpr uint32_t RECONNECT_MAX_MS = 60UL * 1000;
constexpr uint8_t RECONNECT_JITTER_PERCENT = 20;

// -----------------------------------------------------------------------------
// Supabase Realtime
// -----------------------------------------------------------------------------
constexpr uint16_t SUPABASE_PORT = 443;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 25UL * 1000;
constexpr uint32_t HEARTBEAT_TIMEOUT_MS = 10UL * 1000;
constexpr uint32_t STATUS_REPORT_INTERVAL_MS = 5UL * 60 * 1000; // Gửi pin/RSSI lên Presence
constexpr uint32_t REST_TIMEOUT_MS = 8000;                       // Ghi bảng qua REST (HTTPS)
constexpr uint32_t OUTBOX_RETRY_MS = 30UL * 1000;                // Gửi lỗi -> chờ rồi thử lại
constexpr const char* TABLE_LEARNED_CODES = "learned_codes";
constexpr const char* TABLE_ERROR_REPORTS = "error_reports";

// -----------------------------------------------------------------------------
// Lệnh
// -----------------------------------------------------------------------------
constexpr uint8_t COMMAND_RATE_MAX = 5;          // Tối đa N lệnh ...
constexpr uint32_t COMMAND_RATE_WINDOW_MS = 1000; // ... trong cửa sổ này

// -----------------------------------------------------------------------------
// IR
// -----------------------------------------------------------------------------
constexpr uint16_t IR_RX_BUFFER_SIZE = 2048;          // Remote điều hòa: gói dài + lặp lại, 1024 dễ tràn
constexpr uint8_t IR_RX_TIMEOUT_MS = 60;          // 60ms để bao trọn khoảng lặng giữa các gói của điều hòa Daikin (thường 29-35ms)
constexpr uint16_t IR_RAW_MAX_LENGTH = 1024;
constexpr uint16_t IR_DEFAULT_KHZ = 38;
constexpr uint32_t IR_LEARN_TIMEOUT_MS = 15UL * 1000;
constexpr uint8_t IR_MATCH_TOLERANCE_PERCENT = 25;
constexpr uint16_t IR_MATCH_MIN_TOLERANCE_US = 150;
constexpr int16_t AC_TEMP_MIN_DEFAULT = 16;        // Khi profile không có limits
constexpr int16_t AC_TEMP_MAX_DEFAULT = 30;
// Giao thức điều hòa gợi ý khi chọn/dò trên app hoặc web bản thử. Ưu tiên điều hòa âm trần Cassette
// (Daikin BRC52A62 -> DAIKIN64, BRC4C151/153 -> DAIKIN176, BRC52B63 -> DAIKIN128, BRC4M150 -> DAIKIN200,
// Panasonic/Mitsubishi/Toshiba/Carrier âm trần) cùng các dòng treo tường và máy OEM (Funiki -> COOLIX).
constexpr const char* AC_PROTOCOL_CANDIDATES[] = {
    "DAIKIN64", "DAIKIN176", "DAIKIN128", "DAIKIN200", "DAIKIN", "DAIKIN2", "DAIKIN216", "DAIKIN160", "DAIKIN152",
    "PANASONIC_AC", "PANASONIC_AC32", "MITSUBISHI_AC", "MITSUBISHI112", "MITSUBISHI136",
    "MITSUBISHI_HEAVY_152", "MITSUBISHI_HEAVY_88", "TOSHIBA_AC", "CARRIER_AC64",
    "LG", "LG2", "SAMSUNG_AC", "FUJITSU_AC", "SHARP_AC", "HITACHI_AC",
    "COOLIX", "MIDEA", "GREE", "KELVINATOR", "TCL112AC", "HAIER_AC_YRW02", "HAIER_AC", "ELECTRA_AC",
    "AIRWELL", "KELON", "MIRAGE", "TECO", "VESTEL_AC", "TECHNIBEL_AC",
};
constexpr const char* DEFAULT_AC_DEVICE_ID = "ac_funiki";
constexpr const char* DEFAULT_AC_ALT_DEVICE_ID = "ac_living";
constexpr const char* DEFAULT_AC_DEVICE_NAME = "Điều hòa âm trần Daikin";
constexpr const char* DEFAULT_AC_PROTOCOL = "DAIKIN64";
constexpr uint8_t IR_LEARN_MAX_FAILS = 3;          // Quá số lần -> E_LEARN_FAIL
constexpr uint8_t LEARNED_CODE_QUEUE_SIZE = 4;     // Mã học từ nút chờ gửi khi mất mạng

// -----------------------------------------------------------------------------
// Giao diện: OLED, nút, LED
// -----------------------------------------------------------------------------
constexpr uint8_t OLED_I2C_ADDRESS = 0x3C;
constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;
constexpr uint32_t OLED_TIMEOUT_MS = 10UL * 1000;
// Mã QR WiFi cài đặt trên OLED: version 3 = 29x29 ô, 2px/ô = 58px + viền trắng 2px = 62px (vừa cao 64px)
constexpr int OLED_QR_MAX_VERSION = 3;
constexpr uint8_t OLED_QR_SCALE = 2;
constexpr uint8_t OLED_QR_QUIET_PX = 2;

// Nút: bấm ngắn = sáng OLED; giữ rồi thả ở mốc nào thì chạy chức năng mốc đó
constexpr uint16_t BUTTON_DEBOUNCE_MS = 30;
constexpr uint32_t BUTTON_LEARN_HOLD_MS = 5UL * 1000;   // Học lệnh IR
constexpr uint32_t BUTTON_SETUP_HOLD_MS = 10UL * 1000;  // Cài đặt: WiFi riêng + mã ghép đôi
constexpr uint32_t BUTTON_RESET_HOLD_MS = 20UL * 1000;  // Khôi phục gốc: xoá token + WiFi

// -----------------------------------------------------------------------------
// Âm thanh (DFPlayer)
// -----------------------------------------------------------------------------
constexpr uint32_t AUDIO_BAUD = 9600;
constexpr uint8_t AUDIO_VOLUME = 28;               // 0..30. PAM8403 khuếch đại ~24dB: để cao dễ rè
constexpr uint32_t AUDIO_BOOT_DELAY_MS = 1500;      // DFPlayer cần ~1.5s sau khi cấp điện để đọc thẻ
constexpr uint32_t AUDIO_MAX_PLAY_MS = 5UL * 1000;  // Không nhận được "phát xong" thì coi như xong

// -----------------------------------------------------------------------------
// Lỗi / log
// -----------------------------------------------------------------------------
constexpr uint8_t ERROR_REPEAT_THRESHOLD = 3;              // Lặp >= 3 lần ...
constexpr uint32_t ERROR_REPEAT_WINDOW_SEC = 24UL * 3600;  // ... trong 24h thì báo
constexpr uint32_t ERROR_MIN_RESEND_SEC = 3600;            // Cùng lỗi + thiết bị: 1 lần/giờ
constexpr size_t ERROR_LOG_CAPACITY = 50;                  // Hàng đợi gửi bù khi mất mạng

// -----------------------------------------------------------------------------
// Lưu trữ
// -----------------------------------------------------------------------------
constexpr const char* PROFILE_PATH = "/profile.json";
constexpr const char* PROFILE_BACKUP_PATH = "/profile.bak.json";
constexpr const char* PROFILE_TEMP_PATH = "/profile.tmp.json";
constexpr size_t PROFILE_MAX_BYTES = 32UL * 1024;  // Giữ toàn bộ trong RAM (contracts.md mục 5)
constexpr size_t PROFILE_NAME_MAX_BYTES = 32;      // deviceId / tên thiết bị do app gửi (UTF-8)

// -----------------------------------------------------------------------------
// Thời gian / ghép đôi
// -----------------------------------------------------------------------------
constexpr const char* NTP_SERVER_1 = "pool.ntp.org";
constexpr const char* NTP_SERVER_2 = "time.google.com";
constexpr const char* TIMEZONE = "ICT-7";
constexpr uint32_t PAIRING_CODE_TTL_MS = 10UL * 60 * 1000;

// -----------------------------------------------------------------------------
// Vòng lặp chính
// -----------------------------------------------------------------------------
constexpr uint32_t LOOP_IDLE_MS = 10;              // Nhường CPU cho tác vụ nền / tiết kiệm điện
constexpr uint32_t DISPLAY_REFRESH_MS = 1000;

// Nhận request JSON qua Serial để thử khi chưa có app/Supabase (xem src/app/SerialBridge.h).
// Tắt khi phát hành: ai cắm USB vào mạch cũng gửi lệnh được.
constexpr bool SERIAL_BRIDGE_ENABLED = true;
constexpr size_t SERIAL_BRIDGE_MAX_LINE = 1024;

// -----------------------------------------------------------------------------
// Bản thử không cần server (env esp32dev_local, src/local/)
// -----------------------------------------------------------------------------
constexpr const char* LOCAL_MDNS_HOSTNAME = "smarthome";  // -> http://smarthome.local
constexpr const char* LOCAL_AC_DEVICE_ID = "ac_funiki";
constexpr const char* LOCAL_AC_DEVICE_NAME = "Điều hòa âm trần Daikin";
constexpr const char* LOCAL_AC_DEFAULT_PROTOCOL = "DAIKIN64";  // Mặc định âm trần Daikin Cassette (Funiki R32 dùng COOLIX)
constexpr const char* LOCAL_LEARN_DEVICE_ID = "remote_hoc";    // Phím học bằng mắt thu lưu vào đây
constexpr const char* LOCAL_LEARN_DEVICE_NAME = "Phím đã học";
constexpr size_t LOCAL_NAME_MAX_BYTES = 32;                    // Tên phím / thiết bị (UTF-8)
