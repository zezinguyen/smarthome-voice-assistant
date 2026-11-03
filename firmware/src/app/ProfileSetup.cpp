#include "ProfileSetup.h"

#include <Arduino.h>
#include <ErrorCodes.h>
#include <ProfileEdit.h>

#include "config.h"

namespace {
constexpr const char* kErrBusy = "E_BUSY";
constexpr const char* kErrBadRequest = "E_BAD_REQUEST";
constexpr const char* kErrProtocol = "E_PROTOCOL";       // Giao thức điều hòa IRac không hỗ trợ
constexpr const char* kErrSaveFailed = "E_SAVE_FAILED";  // Không ghi được profile
}  // namespace

ProfileSetup::ProfileSetup(DeviceStore& store, IrSender& sender, CommandHandler& commands, RealtimeClient& realtime)
    : store_(store), sender_(sender), commands_(commands), realtime_(realtime) {}

bool ProfileSetup::onBroadcast(const char* event, JsonObjectConst payload) {
    const char* requestId = payload["requestId"] | "";
    if (strcmp(event, "profile_get") == 0) {
        sendProfileInfo(requestId);
    } else if (strcmp(event, "ac_try") == 0) {
        sendResult(requestId, tryProtocol(payload));
    } else if (strcmp(event, "ir_try") == 0) {
        sendResult(requestId, tryIrCode(payload));
    } else if (strcmp(event, "ac_set_protocol") == 0) {
        sendResult(requestId, setProtocol(payload));
    } else if (strcmp(event, "profile_put_command") == 0) {
        sendResult(requestId, putCommand(payload));
    } else {
        return false;
    }
    return true;
}

void ProfileSetup::sendProfileInfo(const char* requestId) {
    JsonDocument info;
    info["requestId"] = requestId;
    info["profileVersion"] = store_.profileVersion();
    JsonArray devices = info["devices"].to<JsonArray>();
    for (JsonPairConst entry : store_.document()["devices"].as<JsonObjectConst>()) {
        JsonObjectConst device = entry.value();
        JsonObject out = devices.add<JsonObject>();
        out["id"] = entry.key().c_str();
        out["type"] = device["type"];
        out["name"] = device["name"];
        if (device["irac_protocol"].is<const char*>()) {
            out["acProtocol"] = device["irac_protocol"];
        }
        JsonArray actions = out["commands"].to<JsonArray>();
        for (JsonPairConst command : device["commands"].as<JsonObjectConst>()) {
            actions.add(command.key().c_str());
        }
    }
    JsonArray candidates = info["acProtocols"].to<JsonArray>();
    for (const char* protocol : AC_PROTOCOL_CANDIDATES) {
        if (IrSender::isAcProtocolSupported(protocol)) {
            candidates.add(protocol);
        }
    }
    realtime_.broadcast("profile_info", info);
}

// {requestId, protocol, power, temp, mode, fan}
const char* ProfileSetup::tryProtocol(JsonObjectConst payload) {
    if (commands_.isLearning()) {
        return kErrBusy;
    }
    AcRequest request;
    request.protocol = payload["protocol"] | "";
    if (!IrSender::isAcProtocolSupported(request.protocol)) {
        return kErrProtocol;
    }
    request.power = payload["power"] | true;
    request.temperatureC = constrain(payload["temp"] | 25, AC_TEMP_MIN_DEFAULT, AC_TEMP_MAX_DEFAULT);
    request.mode = payload["mode"] | "cool";
    request.fan = payload["fan"] | "auto";
    request.action = "TEST";
    request.powerToggle = true;
    const char* error = sender_.sendAc(request) ? nullptr : errorCodeName(ErrorCode::IrSendFail);
    log_i("App: thu giao thuc %s -> %s", request.protocol, error != nullptr ? error : "ok");
    return error;
}

// {requestId, ir: IrCode}
const char* ProfileSetup::tryIrCode(JsonObjectConst payload) {
    if (commands_.isLearning()) {
        return kErrBusy;
    }
    JsonObjectConst ir = payload["ir"];
    if (ir.isNull()) {
        return kErrBadRequest;
    }
    const char* error = commands_.sendIrCode(ir);
    log_i("App: thu ma %s %s -> %s", ir["protocol"] | "raw", ir["code"] | "", error != nullptr ? error : "ok");
    return error;
}

// {requestId, deviceId, protocol, name?}
const char* ProfileSetup::setProtocol(JsonObjectConst payload) {
    const char* deviceId = payload["deviceId"];
    const char* protocol = payload["protocol"];
    if (deviceId == nullptr || !isValidProfileName(deviceId, PROFILE_NAME_MAX_BYTES)) {
        return kErrBadRequest;
    }
    if (!IrSender::isAcProtocolSupported(protocol)) {
        return kErrProtocol;
    }
    JsonObjectConst existing = store_.findDevice(deviceId);
    if (!existing.isNull() && existing["irac_protocol"].isNull()) {
        return kErrBadRequest;  // Thiết bị bấm nút, không phải điều hòa
    }
    if (!existing.isNull() && existing["irac_protocol"] == protocol) {
        return nullptr;  // Đã đúng giao thức
    }

    JsonDocument doc = store_.document();
    const char* name = payload["name"] | deviceId;
    const bool changed = existing.isNull() ? profileEnsureAc(doc, deviceId, name, protocol)
                                           : profileSetAcProtocol(doc, deviceId, protocol);
    if (!changed) {
        return kErrBadRequest;
    }
    // Đồng bộ luôn alias mặc định (ac_funiki <-> ac_living) nếu cả hai cùng có trong profile
    if (strcmp(deviceId, DEFAULT_AC_DEVICE_ID) == 0 || strcmp(deviceId, DEFAULT_AC_ALT_DEVICE_ID) == 0) {
        const char* siblingId =
            strcmp(deviceId, DEFAULT_AC_DEVICE_ID) == 0 ? DEFAULT_AC_ALT_DEVICE_ID : DEFAULT_AC_DEVICE_ID;
        if (!store_.findDevice(siblingId).isNull()) {
            profileSetAcProtocol(doc, siblingId, protocol);
        }
    }
    if (!store_.save(doc)) {
        return kErrSaveFailed;
    }
    commands_.resetAcPower();
    log_i("App: luu %s = %s (profile v%u)", deviceId, protocol, store_.profileVersion());
    return nullptr;
}

// {requestId, deviceId, deviceName?, action, ir: IrCode}
const char* ProfileSetup::putCommand(JsonObjectConst payload) {
    const char* deviceId = payload["deviceId"];
    const char* action = payload["action"];
    if (deviceId == nullptr || !isValidProfileName(deviceId, PROFILE_NAME_MAX_BYTES) || action == nullptr ||
        !isValidProfileName(action, PROFILE_NAME_MAX_BYTES)) {
        return kErrBadRequest;
    }
    JsonDocument doc = store_.document();
    const char* name = payload["deviceName"] | deviceId;
    // false: mã IR sai định dạng hoặc thiết bị là điều hòa (điều hòa gửi cả trạng thái qua IRac)
    if (!profilePutCommand(doc, deviceId, name, action, payload["ir"])) {
        return kErrBadRequest;
    }
    if (!store_.save(doc)) {
        return kErrSaveFailed;
    }
    log_i("App: luu phim %s/%s (profile v%u)", deviceId, action, store_.profileVersion());
    return nullptr;
}

void ProfileSetup::sendResult(const char* requestId, const char* error) {
    JsonDocument result;
    result["requestId"] = requestId;
    result["ok"] = error == nullptr;
    if (error != nullptr) {
        result["error"] = error;
    }
    result["profileVersion"] = store_.profileVersion();
    realtime_.broadcast("setup_result", result);
}
