#pragma once
#include <ArduinoJson.h>
#include <stdint.h>

struct AcRequest {
    const char* protocol;  // Tên protocol IRac, VD "DAIKIN64", "DAIKIN176", "PANASONIC_AC"
    bool power = true;
    float temperatureC = 24.0f;
    const char* mode = "cool";     // "cool" | "heat" | "dry" | "fan" | "auto"
    const char* fan = "auto";      // "auto" | "low" | "medium" | "high"
    const char* action = nullptr;  // "POWER", "POWER_ON", "POWER_OFF", "SET", "TEST"
    bool powerToggle = false;      // Cờ đảo nguồn (1 = đảo bật/tắt) cho giao thức Toggle như DAIKIN64, DAIKIN128
    bool skipToggleIr = false;     // true: máy Toggle đã tắt sẵn mà nhận POWER_OFF -> không phát IR để tránh bật nhầm
};

// Phát IR: mã theo protocol, raw, hoặc trạng thái điều hòa (IRac).
class IrSender {
public:
    void begin();
    // protocol: tên theo IRremoteESP8266, VD "NEC", "SAMSUNG"
    bool sendCode(const char* protocol, uint64_t value, uint16_t bits);
    bool sendRaw(const uint16_t* durations, uint16_t length, uint16_t khz);
    bool sendAc(const AcRequest& request);

    // Giao thức điều hòa gửi được qua IRac (VD "DAIKIN64", "MIDEA")
    static bool isAcProtocolSupported(const char* protocol);
    // Giao thức điều hòa dùng bit đảo nguồn (Power Toggle) thay vì trạng thái nguồn rời
    static bool isTogglePowerProtocol(const char* protocol);
    // Thêm tên mọi giao thức điều hòa IRac hỗ trợ vào out
    static void listAcProtocols(JsonArray out);
};
