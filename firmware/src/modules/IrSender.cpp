#include "IrSender.h"

#include <IRac.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRutils.h>
#include <ir_Daikin.h>

#include "config.h"
#include "modules/IrCpuBoost.h"

namespace {
IRsend irSend(PIN_IR_TX);
IRac irAc(PIN_IR_TX);

bool isToggleDecodeType(decode_type_t type) {
    switch (type) {
        case decode_type_t::DAIKIN64:
        case decode_type_t::DAIKIN128:
        case decode_type_t::PANASONIC_AC32:
        case decode_type_t::AIRWELL:
        case decode_type_t::KELON:
        case decode_type_t::WHIRLPOOL_AC:
            return true;
        default:
            return false;
    }
}
}  // namespace

void IrSender::begin() { irSend.begin(); }

bool IrSender::sendCode(const char* protocol, uint64_t value, uint16_t bits) {
    const decode_type_t type = strToDecodeType(protocol);
    if (type == decode_type_t::UNKNOWN) {
        return false;
    }
    IrCpuBoost cpuBoost;
    return irSend.send(type, value, bits);
}

bool IrSender::sendRaw(const uint16_t* durations, uint16_t length, uint16_t khz) {
    if (durations == nullptr || length == 0) {
        return false;
    }
    IrCpuBoost cpuBoost;
    irSend.sendRaw(durations, length, khz);
    return true;
}

bool IrSender::isAcProtocolSupported(const char* protocol) {
    return protocol != nullptr && IRac::isProtocolSupported(strToDecodeType(protocol));
}

bool IrSender::isTogglePowerProtocol(const char* protocol) {
    return protocol != nullptr && isToggleDecodeType(strToDecodeType(protocol));
}

void IrSender::listAcProtocols(JsonArray out) {
    for (int i = 0; i <= kLastDecodeType; i++) {
        const decode_type_t type = static_cast<decode_type_t>(i);
        if (IRac::isProtocolSupported(type)) {
            out.add(typeToString(type));
        }
    }
}

bool IrSender::sendAc(const AcRequest& request) {
    if (!isAcProtocolSupported(request.protocol)) {
        return false;
    }
    const decode_type_t type = strToDecodeType(request.protocol);
    const bool usesTogglePower = isToggleDecodeType(type);

    if (usesTogglePower && request.skipToggleIr) {
        return true;  // Đã ở đúng trạng thái Tắt, không phát cờ đảo nguồn để tránh bật nhầm máy
    }

    IrCpuBoost cpuBoost;

    // Xử lý tối ưu riêng cho DAIKIN64 (Remote BRC52A62 / R04089036296A / DGS01 điều hòa âm trần Daikin Cassette)
    if (type == decode_type_t::DAIKIN64) {
        IRDaikin64 daikin64(PIN_IR_TX);
        daikin64.begin();

        const stdAc::opmode_t opmode = IRac::strToOpmode(request.mode, stdAc::opmode_t::kCool);
        daikin64.setMode(IRDaikin64::convertMode(opmode));

        uint8_t temp = static_cast<uint8_t>(request.temperatureC);
        if (temp < kDaikin64MinTemp) temp = kDaikin64MinTemp;
        if (temp > kDaikin64MaxTemp) temp = kDaikin64MaxTemp;
        daikin64.setTemp(temp);

        const stdAc::fanspeed_t fanspeed = IRac::strToFanspeed(request.fan, stdAc::fanspeed_t::kAuto);
        daikin64.setFan(IRDaikin64::convertFan(fanspeed));
        daikin64.setSwingVertical(true);
        daikin64.setPowerToggle(request.powerToggle);

        // QUAN TRỌNG:
        // - Khi powerToggle = true (Bật/Tắt nguồn): bắt buộc phát ĐÚNG 1 KHUNG (repeat = 0, chuẩn kNoRepeat).
        //   Nếu repeat = 1 sẽ phát 2 khung PowerToggle=1 cách nhau 100ms làm máy âm trần bật lên rồi tắt ngay.
        // - Khi powerToggle = false (Chỉ đổi nhiệt độ/chế độ/quạt): phát lặp 2 khung (repeat = 1) hoàn toàn an toàn,
        //   giúp tăng độ nhạy thu cho mắt nhận âm trần ở độ cao ~3.5m.
        daikin64.send(request.powerToggle ? 0 : 1);
        return true;
    }

    stdAc::state_t state;
    IRac::initState(&state);
    state.protocol = type;
    // Với các giao thức Toggle khác (VD DAIKIN128 BRC52B63, PANASONIC_AC32), IRac truyền thẳng state.power vào setPowerToggle()
    state.power = usesTogglePower ? request.powerToggle : request.power;
    state.degrees = request.temperatureC;
    state.celsius = true;
    state.mode = IRac::strToOpmode(request.mode, stdAc::opmode_t::kCool);
    state.fanspeed = IRac::strToFanspeed(request.fan, stdAc::fanspeed_t::kAuto);
    return irAc.sendAc(state, nullptr);
}
