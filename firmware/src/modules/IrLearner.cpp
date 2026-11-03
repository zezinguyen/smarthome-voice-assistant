#include "IrLearner.h"

#include <Arduino.h>
#include <IRrecv.h>
#include <IRremoteESP8266.h>
#include <IRutils.h>
#include <Elapsed.h>
#include <IrCompare.h>
#include <string.h>

#include "modules/IrSender.h"

namespace {
IRrecv irRecv(PIN_IR_RX, IR_RX_BUFFER_SIZE, IR_RX_TIMEOUT_MS, true);
decode_results decodeResults;
}  // namespace

void irCaptureToJson(const IrCapture& capture, JsonObject out) {
    out["protocol"] = capture.protocol;
    if (strcmp(capture.protocol, "UNKNOWN") == 0) {
        JsonArray raw = out["raw"].to<JsonArray>();
        for (uint16_t i = 0; i < capture.rawLength; i++) {
            raw.add(capture.raw[i]);
        }
        out["freq"] = IR_DEFAULT_KHZ;
        return;
    }
    char code[24];
    snprintf(code, sizeof(code), "0x%llX", static_cast<unsigned long long>(capture.value));
    out["code"] = code;
    out["bits"] = capture.bits;
}

void IrLearner::begin() {
    if (PIN_IR_RX_POWER >= 0) {
        pinMode(PIN_IR_RX_POWER, OUTPUT);
    }
    setPower(false);
}

void IrLearner::start(uint32_t nowMs) {
    log_i("Bat dau hoc lenh, cho %lus", IR_LEARN_TIMEOUT_MS / 1000);
    setPower(true);
    irRecv.enableIRIn();
    captureCount_ = 0;
    mismatches_ = 0;
    startMs_ = nowMs;
    active_ = true;
}

void IrLearner::stop() {
    if (active_) {
        irRecv.disableIRIn();
    }
    setPower(false);
    active_ = false;
}

LearnEvent IrLearner::update(uint32_t nowMs) {
    if (!active_) {
        return LearnEvent::None;
    }
    if (elapsedMs(nowMs, startMs_) >= IR_LEARN_TIMEOUT_MS) {
        log_w("Hoc lenh het gio, da thu %u goi", captureCount_);
        stop();
        return LearnEvent::Timeout;
    }
    if (!irRecv.decode(&decodeResults)) {
        return LearnEvent::None;
    }

    const bool ok = readCapture(captures_[captureCount_]);
    irRecv.resume();
    if (!ok) {
        return LearnEvent::None;  // Gói lỗi/tràn bộ đệm -> chờ lần bấm sau
    }

    if (captureCount_ == 0) {
        // Nếu lần thu đầu tiên đã nhận dạng được giao thức điều hòa hỗ trợ IRac
        // (VD "DAIKIN", "DAIKIN2", "DAIKIN128", "PANASONIC_AC"... theo spec mục 7.5: chủ nhà chỉ cần bấm 1 phím)
        // thì thành công ngay!
        if (IrSender::isAcProtocolSupported(captures_[0].detected)) {
            log_i("Da nhan dien giao thuc dieu hoa ngay lan 1: %s", captures_[0].detected);
            stop();
            return LearnEvent::Success;
        }
        captureCount_ = 1;
        return LearnEvent::FirstCaptured;
    }
    if (!capturesMatch()) {
        log_w("2 lan bam khong khop (%u)", mismatches_ + 1);
        captureCount_ = 0;
        if (++mismatches_ >= IR_LEARN_MAX_FAILS) {
            stop();
            return LearnEvent::Failed;
        }
        return LearnEvent::Mismatch;
    }
    stop();
    return LearnEvent::Success;
}

bool IrLearner::readCapture(IrCapture& out) {
    if (decodeResults.overflow) {
        log_w("Goi IR qua dai, tran bo dem (tang IR_RX_BUFFER_SIZE)");
        return false;
    }
    const String detected = typeToString(decodeResults.decode_type);
    strncpy(out.detected, detected.c_str(), sizeof(out.detected) - 1);
    out.detected[sizeof(out.detected) - 1] = '\0';
    // Mã điều hòa nằm trong decodeResults.state (không vừa uint64 value) -> lưu raw để phát lại
    const bool fitsValue = decodeResults.decode_type != decode_type_t::UNKNOWN && !hasACState(decodeResults.decode_type);
    strncpy(out.protocol, fitsValue ? out.detected : "UNKNOWN", sizeof(out.protocol) - 1);
    out.protocol[sizeof(out.protocol) - 1] = '\0';
    out.value = fitsValue ? decodeResults.value : 0;
    out.bits = fitsValue ? decodeResults.bits : 0;

    uint16_t* raw = resultToRawArray(&decodeResults);
    const uint16_t length = getCorrectedRawLength(&decodeResults);
    out.rawLength = length > IR_RAW_MAX_LENGTH ? IR_RAW_MAX_LENGTH : length;
    log_i("Thu IR: %s, %u bit, %u xung%s", out.detected, decodeResults.bits, length,
          length > IR_RAW_MAX_LENGTH ? " (bi cat, tang IR_RAW_MAX_LENGTH)" : "");
    memcpy(out.raw, raw, out.rawLength * sizeof(uint16_t));
    delete[] raw;
    return out.rawLength > 0;
}

bool IrLearner::capturesMatch() const {
    const IrCapture& a = captures_[0];
    const IrCapture& b = captures_[1];
    const bool decoded = strcmp(a.protocol, "UNKNOWN") != 0;
    if (decoded) {
        return strcmp(a.protocol, b.protocol) == 0 && a.value == b.value && a.bits == b.bits;
    }
    // Nếu cả 2 lần thu đều nhận diện được cùng một giao thức (kể cả điều hòa có AC state)
    if (strcmp(a.detected, "UNKNOWN") != 0 && strcmp(a.detected, b.detected) == 0) {
        return true;
    }
    return rawCapturesMatch(a.raw, a.rawLength, b.raw, b.rawLength, IR_MATCH_TOLERANCE_PERCENT,
                            IR_MATCH_MIN_TOLERANCE_US);
}

void IrLearner::setPower(bool on) {
    if (PIN_IR_RX_POWER < 0) {
        return;  // Mắt thu cấp nguồn thường trực từ 3V3
    }
    digitalWrite(PIN_IR_RX_POWER, on == IR_RX_POWER_ACTIVE_HIGH ? HIGH : LOW);
}
