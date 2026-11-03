#pragma once
#include <AcPowerState.h>
#include <ArduinoJson.h>
#include <CommandGuard.h>
#include <stdint.h>

#include "app/Outbox.h"
#include "modules/DeviceStore.h"
#include "modules/ErrorReporter.h"
#include "modules/IrLearner.h"
#include "modules/IrSender.h"
#include "modules/RealtimeClient.h"
#include "modules/TimeSync.h"

// Gọi sau mỗi lệnh đã thực thi (không gọi cho lệnh quá hạn / trùng). error = nullptr: thành công.
using CommandResultHandler = void (*)(const char* commandId, const char* error);

enum class LearnSource : uint8_t {
    App,     // App gửi learn_start khi gán phím cho remote ảo -> trả learn_result qua Realtime
    Button,  // Giữ nút 5s -> mã đi vào Outbox thành "mã chờ gán"
};

// Nhận broadcast từ app (command, learn_start), kiểm tra lệnh, phát IR, gửi ACK (spec 4.1, 7);
// điều phối việc học lệnh từ app hoặc từ nút.
class CommandHandler {
public:
    CommandHandler(DeviceStore& store, IrSender& sender, IrLearner& learner, ErrorReporter& errors,
                   TimeSync& clock, RealtimeClient& realtime, Outbox& outbox);

    void onBroadcast(const char* event, JsonObjectConst payload);
    void setResultHandler(CommandResultHandler handler) { resultHandler_ = handler; }
    // Trả về sự kiện học lệnh (nếu có) để main báo ra OLED/loa
    LearnEvent update(uint32_t nowMs);

    void startLearning(LearnSource source, uint32_t nowMs);
    bool isLearning() const { return learner_.isActive(); }
    LearnSource learnSource() const { return learnSource_; }

    // Chạy một hành động trên thiết bị. Trả về nullptr nếu thành công, ngược lại là mã lỗi.
    const char* runAction(const char* deviceId, const char* action, JsonObjectConst params);
    // Phát một IrCode ({protocol, code, bits} hoặc {raw, freq}). nullptr = thành công.
    const char* sendIrCode(JsonObjectConst command);
    // Đặt lại trạng thái nguồn điều hòa trong RAM khi đổi giao thức điều hòa mới.
    void resetAcPower() { acPower_.reset(); }

private:
    void handleCommand(JsonObjectConst command);
    void sendAck(const char* commandId, const char* error, bool duplicate = false);
    void sendLearnEvent(const char* event, const char* status);
    void finishLearning();
    const char* sendDeviceCommand(JsonObjectConst device, const char* action, JsonObjectConst params);
    const char* sendAcCommand(const char* acProtocol, int16_t tempMin, int16_t tempMax, const char* action,
                              JsonObjectConst params);

    DeviceStore& store_;
    IrSender& sender_;
    IrLearner& learner_;
    ErrorReporter& errors_;
    TimeSync& clock_;
    RealtimeClient& realtime_;
    Outbox& outbox_;
    CommandGuard guard_;
    LearnSource learnSource_ = LearnSource::App;
    String learnRequestId_;
    CommandResultHandler resultHandler_ = nullptr;
    AcPowerState acPower_;
};
