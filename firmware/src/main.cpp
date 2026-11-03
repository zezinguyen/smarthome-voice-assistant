// SmartHome Voice Assistant – firmware mạch IR chạy pin.
// main chỉ khởi tạo và nối các module; logic nằm trong src/modules, src/app, lib/core.

// Khi chạy test trên mạch (pio test -e esp32dev), file test tự có setup()/loop()
#ifndef PIO_UNIT_TESTING

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ProfileEdit.h>

#include "app/CommandHandler.h"
#include "app/Feedback.h"
#include "app/Outbox.h"
#include "app/ProfileSetup.h"
#include "app/SerialBridge.h"
#include "config.h"
#include "modules/AudioPlayer.h"
#include "modules/Board.h"
#include "modules/DeviceStore.h"
#include "modules/DisplayOled.h"
#include "modules/ErrorReporter.h"
#include "modules/IrLearner.h"
#include "modules/IrSender.h"
#include "modules/PowerManager.h"
#include "modules/Provisioning.h"
#include "modules/RealtimeClient.h"
#include "modules/SecureStore.h"
#include "modules/StatusLed.h"
#include "modules/SupabaseRest.h"
#include "modules/TimeSync.h"
#include "modules/UserButton.h"
#include "modules/WifiManager.h"

#ifdef USING_EXAMPLE_SECRETS
#warning "Chua co include/secrets.h - dang dung secrets.example.h (copy file mau roi dien gia tri that)"
#endif

namespace {
constexpr uint32_t kMessageShowMs = 5000;

SecureStore secureStore;
PowerManager power;
StatusLed statusLed;
DisplayOled display;
UserButton button;
AudioPlayer audio;
IrSender irSender;
IrLearner irLearner;
DeviceStore deviceStore;
ErrorReporter errorReporter;
Provisioning provisioning;
WifiManager wifi;
TimeSync timeSync;
RealtimeClient realtime;
SupabaseRest rest;
Outbox outbox(rest, errorReporter);
CommandHandler commandHandler(deviceStore, irSender, irLearner, errorReporter, timeSync, realtime, outbox);
ProfileSetup profileSetup(deviceStore, irSender, commandHandler, realtime);
Feedback feedback(audio);
SerialBridge serialBridge;

ConnectionState connection = ConnectionState::NoWifi;
uint32_t lastPresenceMs = 0;
uint32_t lastDisplayMs = 0;
bool setupShowQr = true;  // Chế độ cài đặt: QR WiFi trước, bấm nút ngắn để đổi sang chữ to
bool lowBatteryReported = false;
bool lowBatteryAnnounced = false;
bool wifiWasConnected = false;
bool realtimeWasJoined = false;
const char* message = nullptr;  // Thông báo tạm trên OLED
uint32_t messageUntilMs = 0;

void showMessage(const char* text, uint32_t nowMs) {
    message = text;
    messageUntilMs = nowMs + kMessageShowMs;
    display.wake(nowMs);
}

void onBroadcast(const char* event, JsonObjectConst payload) {
    if (!profileSetup.onBroadcast(event, payload)) {
        commandHandler.onBroadcast(event, payload);
    }
}

void onCommandResult(const char* /*commandId*/, const char* error) { feedback.onCommandResult(error); }

void enterSetupMode(uint32_t nowMs) {
    setupShowQr = true;
    provisioning.startPairing(nowMs);
    wifi.startSetupPortal(nowMs);
    feedback.onSetupMode();
}

void onButtonAction(ButtonAction action) {
    const uint32_t nowMs = millis();
    display.wake(nowMs);

    switch (action) {
        case ButtonAction::None:
            break;
        case ButtonAction::ShowStatus:
            // Đang hiện WiFi cài đặt (màn hình luôn sáng): bấm ngắn đổi QR <-> chữ to, vẽ lại ngay
            if (wifi.setupSsid() != nullptr) {
                setupShowQr = !setupShowQr;
                lastDisplayMs = nowMs - DISPLAY_REFRESH_MS;
            }
            break;
        case ButtonAction::LearnCommand:
            if (!commandHandler.isLearning()) {
                commandHandler.startLearning(LearnSource::Button, nowMs);
                feedback.onLearnStart();
            }
            break;
        case ButtonAction::SetupMode:
            enterSetupMode(nowMs);
            break;
        case ButtonAction::FactoryReset:
            log_w("Khoi phuc goc");
            provisioning.factoryReset();
            feedback.onFactoryReset();
            // Chờ phát xong câu thông báo rồi mới khởi động lại
            for (uint32_t start = millis(); millis() - start < AUDIO_MAX_PLAY_MS && audio.isBusy();) {
                audio.update(millis());
                delay(LOOP_IDLE_MS);
            }
            boardRestart();
            break;
    }
}

void onLearnEvent(LearnEvent event, uint32_t nowMs) {
    const bool fromButton = commandHandler.learnSource() == LearnSource::Button;
    switch (event) {
        case LearnEvent::None:
            break;
        case LearnEvent::FirstCaptured:
            showMessage("Bam lai lan 2", nowMs);
            break;
        case LearnEvent::Mismatch:
            showMessage("Khong khop, bam lai", nowMs);
            break;
        case LearnEvent::Success:
            showMessage(fromButton ? "Da hoc, gan trong app" : "Da hoc xong", nowMs);
            break;
        case LearnEvent::Failed:
        case LearnEvent::Timeout:
            showMessage("Hoc lenh that bai", nowMs);
            break;
    }
    feedback.onLearnEvent(event);
}

void startCloudIfReady() {
    if (realtime.isStarted() || !wifi.isConnected() || !provisioning.isPaired()) {
        return;
    }
    char token[512];
    char homeId[64];
    char boardId[64];
    if (!secureStore.loadBoardToken(token, sizeof(token)) || !secureStore.loadHomeId(homeId, sizeof(homeId)) ||
        !secureStore.loadBoardId(boardId, sizeof(boardId))) {
        return;
    }
    char channel[80];
    snprintf(channel, sizeof(channel), "home:%s", homeId);
    realtime.begin(token, channel, boardId, onBroadcast);
    rest.begin(token, homeId, boardId);
}

void updateCloud(uint32_t nowMs) {
    if (!wifi.isConnected()) {
        realtime.end();
        return;
    }
    startCloudIfReady();
    realtime.update(nowMs);
    outbox.update(nowMs, realtime.isJoined());
}

void reportPresence(uint32_t nowMs) {
    // Vừa vào kênh (kể cả sau khi kết nối lại) thì gửi ngay, sau đó mỗi STATUS_REPORT_INTERVAL_MS
    const bool justJoined = realtime.isJoined() && !realtimeWasJoined;
    realtimeWasJoined = realtime.isJoined();
    const bool due = justJoined || nowMs - lastPresenceMs >= STATUS_REPORT_INTERVAL_MS || power.changed();
    if (!realtime.isJoined() || !due) {
        return;
    }
    JsonDocument state;
    state["battery"] = power.batteryPercent();
    state["charging"] = power.isCharging();
    state["usb"] = power.source() == PowerSource::Usb;
    state["rssi"] = wifi.rssi();
    state["firmware"] = FIRMWARE_VERSION;
    state["profileVersion"] = deviceStore.profileVersion();
    state["pendingLearnedCodes"] = outbox.pendingLearnedCodes();
    if (realtime.trackPresence(state)) {
        lastPresenceMs = nowMs;
    }
}

void applyBatteryPolicy() {
    const BatteryLevel level = power.batteryLevel();
    const bool onBattery = power.source() == PowerSource::Battery;
    const bool saveMode = onBattery && level >= BatteryLevel::Critical;
    display.setDisabled(saveMode);

    // Báo "pin yếu" một lần khi xuống mức Low, trước khi tắt loa ở mức Critical
    if (onBattery && level >= BatteryLevel::Low) {
        if (!lowBatteryAnnounced) {
            feedback.onLowBattery();
            lowBatteryAnnounced = true;
        }
    } else {
        lowBatteryAnnounced = false;
    }
    audio.setDisabled(saveMode);

    if (onBattery && level == BatteryLevel::Empty) {
        if (!lowBatteryReported) {
            errorReporter.report(ErrorCode::LowBattery, nullptr, timeSync.nowEpochSec(), true);
            lowBatteryReported = true;
        }
    } else {
        lowBatteryReported = false;
    }
}

// Dòng phụ trên OLED, theo thứ tự ưu tiên
const char* currentMessage(uint32_t nowMs) {
    static char holdHint[32];
    const ButtonAction pending = button.actionIfReleased(nowMs);
    if (pending != ButtonAction::None && pending != ButtonAction::ShowStatus) {
        snprintf(holdHint, sizeof(holdHint), "Tha: %s", buttonActionText(pending));
        return holdHint;
    }
    if (message != nullptr && static_cast<int32_t>(nowMs - messageUntilMs) < 0) {
        return message;
    }
    if (commandHandler.isLearning()) {
        return "Bam phim tren remote";
    }
    return nullptr;
}

LedPattern currentLedPattern() {
    if (connection == ConnectionState::SetupMode) {
        return LedPattern::SetupMode;
    }
    if (commandHandler.isLearning()) {
        return LedPattern::Learning;
    }
    switch (connection) {
        case ConnectionState::NoWifi: return LedPattern::NoWifi;
        case ConnectionState::NoInternet: return LedPattern::NoInternet;
        default: break;
    }
    const bool lowBattery = power.source() == PowerSource::Battery && power.batteryLevel() >= BatteryLevel::Low;
    return lowBattery ? LedPattern::LowBattery : LedPattern::Online;
}

void updateIndicators(uint32_t nowMs) {
    if (wifi.isSetupPortalActive()) {
        connection = ConnectionState::SetupMode;
    } else if (!wifi.isConnected()) {
        connection = ConnectionState::NoWifi;
    } else if (!realtime.isJoined()) {
        connection = ConnectionState::NoInternet;
    } else {
        connection = ConnectionState::Online;
    }

    statusLed.setPattern(currentLedPattern());
    statusLed.update(nowMs);

    // Giữ màn hình sáng khi người dùng cần đọc: đang giữ nút, cài đặt, học lệnh
    if (button.isPressed() || connection == ConnectionState::SetupMode || provisioning.isPairing() ||
        commandHandler.isLearning()) {
        display.wake(nowMs);
    }
    display.update(nowMs);
    if (display.isAwake() && nowMs - lastDisplayMs >= DISPLAY_REFRESH_MS) {
        lastDisplayMs = nowMs;
        DisplayStatus status = {};
        status.connection = connection;
        status.batteryPercent = power.batteryPercent();
        status.charging = power.isCharging();
        status.setupSsid = wifi.setupSsid();
        status.setupPassword = wifi.setupPassword();
        status.setupShowQr = setupShowQr;
        status.pairingCode = provisioning.pairingCode();
        status.message = currentMessage(nowMs);
        display.show(status);
    }
}
}  // namespace

void setup() {
    boardBegin();
    log_i("SmartHome IR firmware %s", FIRMWARE_VERSION);

    secureStore.begin();
    power.begin();
    statusLed.begin();
    button.begin(onButtonAction);
    audio.begin();
    irSender.begin();
    irLearner.begin();
    if (display.begin()) {
        display.wake(millis());
    }
    const bool fsMounted = deviceStore.begin();
    if (!fsMounted || !deviceStore.load()) {
        log_w("Chua co profile thiet bi, tao profile dieu hoa am tran mac dinh (%s)", DEFAULT_AC_PROTOCOL);
        JsonDocument defaultDoc;
        profileEnsureAc(defaultDoc, DEFAULT_AC_DEVICE_ID, DEFAULT_AC_DEVICE_NAME, DEFAULT_AC_PROTOCOL);
        profileEnsureAc(defaultDoc, DEFAULT_AC_ALT_DEVICE_ID, DEFAULT_AC_DEVICE_NAME, DEFAULT_AC_PROTOCOL);
        if (!fsMounted || !deviceStore.save(defaultDoc)) {
            String defaultJson;
            serializeJson(defaultDoc, defaultJson);
            deviceStore.loadFromJson(defaultJson.c_str(), defaultJson.length());
        }
        // Đã nạp profile mặc định vào bộ nhớ
    }
    commandHandler.setResultHandler(onCommandResult);
    if (SERIAL_BRIDGE_ENABLED) {
        serialBridge.begin(onBroadcast);
    }
    provisioning.begin(secureStore);
    wifi.begin(secureStore);
    timeSync.begin();

#if defined(DEFAULT_WIFI_SSID) && defined(DEFAULT_WIFI_PASS)
    if (secureStore.wifiCount() == 0 && strlen(DEFAULT_WIFI_SSID) > 0) {
        WifiCredential cred = {};
        strncpy(cred.ssid, DEFAULT_WIFI_SSID, sizeof(cred.ssid) - 1);
        strncpy(cred.password, DEFAULT_WIFI_PASS, sizeof(cred.password) - 1);
        secureStore.addWifi(cred);
        log_i("Da nap WiFi mac dinh tu secrets.h: %s", cred.ssid);
    }
#endif
#if defined(DEFAULT_BOARD_ID) && defined(DEFAULT_HOME_ID)
    if (strlen(DEFAULT_BOARD_ID) > 0) {
#if defined(DEFAULT_BOARD_TOKEN)
        const char* token = DEFAULT_BOARD_TOKEN;
#else
        const char* token = SUPABASE_ANON_KEY;
#endif
        provisioning.completePairing(token, DEFAULT_BOARD_ID, DEFAULT_HOME_ID);
        log_i("Da nap Board mac dinh: %s (Home: %s)", DEFAULT_BOARD_ID, DEFAULT_HOME_ID);
    }
#endif

    // Mạch mới / đã reset: tự vào chế độ cài đặt, không cần giữ nút
    if (!provisioning.isPaired() || secureStore.wifiCount() == 0) {
        enterSetupMode(millis());
    }
}

void loop() {
    const uint32_t nowMs = millis();

    power.update(nowMs);
    applyBatteryPolicy();
    wifi.update(nowMs);
    if (wifi.isConnected() != wifiWasConnected) {
        wifiWasConnected = wifi.isConnected();
        power.applyPowerProfile();  // Modem-Sleep chỉ áp dụng được khi WiFi đang chạy
    }
    provisioning.update(nowMs);
    updateCloud(nowMs);
    button.update(nowMs);
    if (SERIAL_BRIDGE_ENABLED) {
        serialBridge.update();
    }
    onLearnEvent(commandHandler.update(nowMs), nowMs);
    audio.update(nowMs);
    reportPresence(nowMs);
    updateIndicators(nowMs);

    delay(LOOP_IDLE_MS);
}

#endif  // PIO_UNIT_TESTING
