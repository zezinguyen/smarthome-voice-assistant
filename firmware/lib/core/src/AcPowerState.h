#pragma once

// Máy trạng thái nguồn cho điều hòa dùng cờ đảo nguồn (Power Toggle, VD DAIKIN64, DAIKIN128).
// Tách thuần C++ trong lib/core để kiểm thử độc lập phần cứng.

struct AcPowerDecision {
    bool syncOnly = false;      // true: chỉ đồng bộ trạng thái trong RAM, không phát tia IR
    bool power = true;          // Trạng thái nguồn đích cho điều hòa mã nguồn rời (Discrete ON/OFF)
    bool powerToggle = false;   // Cờ đảo nguồn (1 = đảo bật/tắt, 0 = giữ nguyên nguồn) cho DAIKIN64/DAIKIN128
    bool skipToggleIr = false;  // true: máy Toggle đã biết chắc đang Tắt mà nhận POWER_OFF -> không phát IR
};

class AcPowerState {
public:
    AcPowerDecision evaluate(const char* action, bool hasPowerParam, bool powerParam, bool forceToggle = false,
                             bool keepPower = false) const;

    // Gọi sau khi phát IR thành công (hoặc khi syncOnly = true) để ghi nhận trạng thái mới
    void commit(const char* action, bool targetPower);

    bool isKnown() const { return known_; }
    bool isOn() const { return power_; }
    void reset() {
        known_ = false;
        power_ = false;
    }

private:
    bool known_ = false;
    bool power_ = false;
};

