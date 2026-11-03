#include "AcPowerState.h"

#include <string.h>

namespace {
bool equalsStr(const char* a, const char* b) { return a != nullptr && b != nullptr && strcmp(a, b) == 0; }
}  // namespace

AcPowerDecision AcPowerState::evaluate(const char* action, bool hasPowerParam, bool powerParam, bool forceToggle,
                                       bool keepPower) const {
    AcPowerDecision out;

    // 1. Chỉ đồng bộ trạng thái giữa App và mạch (khi người dùng vừa bấm remote vật lý)
    if (equalsStr(action, "SYNC_POWER")) {
        out.syncOnly = true;
        out.power = hasPowerParam ? powerParam : !power_;
        out.powerToggle = false;
        out.skipToggleIr = true;
        return out;
    }

    // 2. Phát thử giao thức trong hộp thoại cài đặt: luôn bật cờ toggle để máy kêu bíp, không lưu trạng thái
    if (equalsStr(action, "TEST")) {
        out.power = hasPowerParam ? powerParam : true;
        out.powerToggle = true;
        return out;
    }

    // 3. Nút Đảo nguồn trực tiếp (giống phím ON/OFF trên remote BRC52A62)
    if (equalsStr(action, "POWER")) {
        out.power = hasPowerParam ? powerParam : !power_;
        out.powerToggle = true;
        return out;
    }

    // 4. Lệnh Tắt nguồn (POWER_OFF hoặc SET kèm power=false từ trang web cục bộ)
    const bool isOffRequest = equalsStr(action, "POWER_OFF") || (hasPowerParam && !powerParam);
    if (isOffRequest) {
        out.power = false;
        if (forceToggle || !known_ || power_) {
            out.powerToggle = true;
            out.skipToggleIr = false;
        } else {
            // Đã biết chắc máy đang Tắt và không ép toggle (VD nói "tắt điều hòa" lần 2) -> tránh bật nhầm máy
            out.powerToggle = false;
            out.skipToggleIr = true;
        }
        return out;
    }

    // 5. Lệnh Bật nguồn tường minh (POWER_ON) hoặc chỉnh thông số (SET với power=true)
    out.power = true;
    if (forceToggle) {
        out.powerToggle = true;
    } else if (keepPower && !equalsStr(action, "POWER_ON")) {
        // Người dùng bấm +/- nhiệt độ hoặc đổi chế độ khi App biết máy đang chạy -> không đảo nguồn
        out.powerToggle = false;
    } else {
        // Chưa biết trạng thái sau khi cấp điện hoặc máy đang Tắt -> bật máy; đang Bật rồi -> chỉ cập nhật nhiệt độ
        out.powerToggle = (!known_ || !power_);
    }
    return out;
}

void AcPowerState::commit(const char* action, bool targetPower) {
    if (equalsStr(action, "TEST")) {
        return;
    }
    known_ = true;
    power_ = targetPower;
}

