#include "LocalWebServer.h"

#include <Arduino.h>
#include <ESPmDNS.h>
#include <ErrorCodes.h>
#include <ProfileEdit.h>
#include <WebServer.h>
#include <string.h>

#include "LocalWebPage.h"
#include "config.h"

namespace {
constexpr const char* kErrBadRequest = "E_BAD_REQUEST";
constexpr const char* kErrBusy = "E_BUSY";
constexpr const char* kErrNoCapture = "E_NO_CAPTURE";      // Chưa học được mã nào để lưu
constexpr const char* kErrProtocol = "E_PROTOCOL";        // Giao thức điều hòa IRac không hỗ trợ
constexpr const char* kErrSaveFailed = "E_SAVE_FAILED";   // Ghi LittleFS lỗi / profile quá lớn

WebServer server(WEB_PORT);
}  // namespace

LocalWebServer::LocalWebServer(DeviceStore& store, CommandHandler& commands, IrSender& sender, IrLearner& learner,
                               PowerManager& power, WifiManager& wifi, Feedback& feedback)
    : store_(store),
      commands_(commands),
      sender_(sender),
      learner_(learner),
      power_(power),
      wifi_(wifi),
      feedback_(feedback) {}

void LocalWebServer::ensureDefaultProfile() {
    JsonDocument doc = store_.document();
    if (profileEnsureAc(doc, LOCAL_AC_DEVICE_ID, LOCAL_AC_DEVICE_NAME, LOCAL_AC_DEFAULT_PROTOCOL) && !saveProfile(doc)) {
        log_w("Khong ghi duoc profile mac dinh");
    }
}

void LocalWebServer::begin() {
    if (running_) {
        return;
    }
    if (!routesAdded_) {  // WebServer không gỡ route được: chỉ đăng ký một lần
        server.on("/", HTTP_GET, [] { server.send(200, "text/html; charset=utf-8", kLocalWebPage); });
        server.on("/api/state", HTTP_GET, [this] { handleState(); });
        server.on("/api/profile", HTTP_GET, [this] { handleProfile(); });
        server.on("/api/protocols", HTTP_GET, [this] { handleProtocols(); });
        server.on("/api/command", HTTP_POST, [this] { handleCommand(); });
        server.on("/api/ac/try", HTTP_POST, [this] { handleAcTry(); });
        server.on("/api/ac/protocol", HTTP_POST, [this] { handleAcProtocol(); });
        server.on("/api/learn", HTTP_POST, [this] { handleLearnStart(); });
        server.on("/api/learn/cancel", HTTP_POST, [this] { handleLearnCancel(); });
        server.on("/api/learn/save", HTTP_POST, [this] { handleLearnSave(); });
        server.on("/api/button/delete", HTTP_POST, [this] { handleButtonDelete(); });
        server.onNotFound([] {
            log_i("Web 404: %s", server.uri().c_str());
            server.send(404, "text/plain", "Not found");
        });
        routesAdded_ = true;
    }
    server.begin();
    if (MDNS.begin(LOCAL_MDNS_HOSTNAME)) {
        MDNS.addService("http", "tcp", WEB_PORT);
    }
    running_ = true;
    char ip[16];
    wifi_.localIp(ip, sizeof(ip));
    log_i("Web dieu khien: http://%s.local hoac http://%s", LOCAL_MDNS_HOSTNAME, ip);
}

void LocalWebServer::end() {
    if (!running_) {
        return;
    }
    MDNS.end();
    server.stop();
    running_ = false;
}

void LocalWebServer::update() {
    if (running_) {
        server.handleClient();
    }
}

void LocalWebServer::startLearning(uint32_t nowMs) {
    if (commands_.isLearning()) {
        return;
    }
    lastCapture_.clear();
    detected_[0] = '\0';
    learnStatus_ = "waiting";
    commands_.startLearning(LearnSource::App, nowMs);
    feedback_.onLearnStart();
}

void LocalWebServer::onLearnEvent(LearnEvent event) {
    switch (event) {
        case LearnEvent::None:
            return;
        case LearnEvent::FirstCaptured:
            learnStatus_ = "first";
            break;
        case LearnEvent::Mismatch:
            learnStatus_ = "mismatch";
            return;
        case LearnEvent::Failed:
            learnStatus_ = "failed";
            return;
        case LearnEvent::Timeout:
            learnStatus_ = "timeout";
            return;
        case LearnEvent::Success:
            learnStatus_ = "ok";
            lastCapture_.clear();
            irCaptureToJson(learner_.result(), lastCapture_.to<JsonObject>());
            break;
    }
    // Giao thức đã nhận ra ngay từ lần bấm đầu: đủ để dò điều hòa dù 2 lần bấm không khớp
    strncpy(detected_, learner_.result().detected, sizeof(detected_) - 1);
}

void LocalWebServer::handleState() {
    JsonDocument doc;
    doc["firmware"] = FIRMWARE_VERSION;
    char ip[16];
    wifi_.localIp(ip, sizeof(ip));
    doc["ip"] = ip;
    doc["host"] = String(LOCAL_MDNS_HOSTNAME) + ".local";
    doc["rssi"] = wifi_.rssi();
    doc["battery"] = power_.batteryPercent();
    doc["batteryMv"] = power_.batteryMillivolts();
    doc["batteryRawMv"] = power_.batteryRawMillivolts();
    doc["charging"] = power_.isCharging();
    doc["usb"] = power_.source() == PowerSource::Usb;
    doc["profileVersion"] = store_.profileVersion();

    JsonObject learn = doc["learn"].to<JsonObject>();
    learn["active"] = commands_.isLearning();
    learn["status"] = learnStatus_;
    if (detected_[0] != '\0') {
        learn["detected"] = detected_;
        learn["acSupported"] = IrSender::isAcProtocolSupported(detected_);
    }
    if (!lastCapture_.isNull()) {
        learn["protocol"] = lastCapture_["protocol"];
        learn["code"] = lastCapture_["code"];
        learn["bits"] = lastCapture_["bits"];
        learn["rawLength"] = lastCapture_["raw"].size();
    }
    sendJson(200, doc);
}

void LocalWebServer::handleProfile() {
    String body;
    serializeJson(store_.document(), body);
    server.send(200, "application/json", body);
}

void LocalWebServer::handleProtocols() {
    JsonDocument doc;
    JsonArray candidates = doc["candidates"].to<JsonArray>();
    for (const char* protocol : AC_PROTOCOL_CANDIDATES) {
        if (IrSender::isAcProtocolSupported(protocol)) {
            candidates.add(protocol);
        }
    }
    IrSender::listAcProtocols(doc["all"].to<JsonArray>());
    sendJson(200, doc);
}

// {deviceId, action, params?} -> giống lệnh từ server, VD điều hòa: action "SET", params {power, temp, mode, fan}
void LocalWebServer::handleCommand() {
    JsonDocument body;
    if (!readBody(body)) {
        return;
    }
    const char* deviceId = body["deviceId"];
    const char* action = body["action"];
    if (deviceId == nullptr || action == nullptr) {
        sendResult(kErrBadRequest);
        return;
    }
    const char* error = commands_.runAction(deviceId, action, body["params"].as<JsonObjectConst>());
    log_i("Web: %s/%s -> %s", deviceId, action, error != nullptr ? error : "ok");
    feedback_.onCommandResult(error);
    sendResult(error);
}

// Thử giao thức điều hòa chưa lưu: {protocol, power, temp, mode, fan}
void LocalWebServer::handleAcTry() {
    JsonDocument body;
    if (!readBody(body)) {
        return;
    }
    if (commands_.isLearning()) {
        sendResult(kErrBusy);
        return;
    }
    AcRequest request;
    request.protocol = body["protocol"] | "";
    if (!IrSender::isAcProtocolSupported(request.protocol)) {
        sendResult(kErrProtocol);
        return;
    }
    request.power = body["power"] | true;
    request.temperatureC = constrain(body["temp"] | 25, AC_TEMP_MIN_DEFAULT, AC_TEMP_MAX_DEFAULT);
    request.mode = body["mode"] | "cool";
    request.fan = body["fan"] | "auto";
    request.action = "TEST";
    request.powerToggle = true;
    const char* error = sender_.sendAc(request) ? nullptr : errorCodeName(ErrorCode::IrSendFail);
    log_i("Web: thu %s -> %s", request.protocol, error != nullptr ? error : "ok");
    sendResult(error);
}

// {deviceId, protocol}
void LocalWebServer::handleAcProtocol() {
    JsonDocument body;
    if (!readBody(body)) {
        return;
    }
    const char* protocol = body["protocol"];
    if (!IrSender::isAcProtocolSupported(protocol)) {
        sendResult(kErrProtocol);
        return;
    }
    const char* deviceId = body["deviceId"];
    JsonDocument doc = store_.document();
    if (!profileSetAcProtocol(doc, deviceId, protocol)) {
        // Đã đúng giao thức thì coi như xong; sai deviceId thì báo lỗi
        const bool same = store_.findDevice(deviceId)["irac_protocol"] == protocol;
        sendResult(same ? nullptr : kErrBadRequest);
        return;
    }
    if (deviceId != nullptr &&
        (strcmp(deviceId, DEFAULT_AC_DEVICE_ID) == 0 || strcmp(deviceId, DEFAULT_AC_ALT_DEVICE_ID) == 0)) {
        const char* siblingId =
            strcmp(deviceId, DEFAULT_AC_DEVICE_ID) == 0 ? DEFAULT_AC_ALT_DEVICE_ID : DEFAULT_AC_DEVICE_ID;
        if (!store_.findDevice(siblingId).isNull()) {
            profileSetAcProtocol(doc, siblingId, protocol);
        }
    }
    if (!saveProfile(doc)) {
        sendResult(kErrSaveFailed);
        return;
    }
    commands_.resetAcPower();
    sendResult(nullptr);
}

void LocalWebServer::handleLearnStart() {
    if (commands_.isLearning()) {
        sendResult(kErrBusy);
        return;
    }
    startLearning(millis());
    sendResult(nullptr);
}

void LocalWebServer::handleLearnCancel() {
    learner_.stop();
    learnStatus_ = "idle";
    sendResult(nullptr);
}

// {deviceId, name}: lưu mã vừa học thành phím `name`
void LocalWebServer::handleLearnSave() {
    JsonDocument body;
    if (!readBody(body)) {
        return;
    }
    if (lastCapture_.isNull()) {
        sendResult(kErrNoCapture);
        return;
    }
    const char* deviceId = body["deviceId"] | LOCAL_LEARN_DEVICE_ID;
    const char* name = body["name"];
    if (!isValidProfileName(deviceId, LOCAL_NAME_MAX_BYTES) || !isValidProfileName(name, LOCAL_NAME_MAX_BYTES)) {
        sendResult(kErrBadRequest);
        return;
    }
    const char* deviceName = strcmp(deviceId, LOCAL_LEARN_DEVICE_ID) == 0 ? LOCAL_LEARN_DEVICE_NAME : deviceId;
    JsonDocument doc = store_.document();
    if (!profilePutCommand(doc, deviceId, deviceName, name, lastCapture_.as<JsonObjectConst>())) {
        sendResult(kErrBadRequest);
        return;
    }
    if (!saveProfile(doc)) {
        sendResult(kErrSaveFailed);
        return;
    }
    lastCapture_.clear();
    learnStatus_ = "idle";
    detected_[0] = '\0';
    sendResult(nullptr);
}

// {deviceId, name}
void LocalWebServer::handleButtonDelete() {
    JsonDocument body;
    if (!readBody(body)) {
        return;
    }
    JsonDocument doc = store_.document();
    if (!profileRemoveCommand(doc, body["deviceId"], body["name"])) {
        sendResult(kErrBadRequest);
        return;
    }
    sendResult(saveProfile(doc) ? nullptr : kErrSaveFailed);
}

bool LocalWebServer::readBody(JsonDocument& out) {
    const String& body = server.arg("plain");
    if (body.length() > WEB_MAX_BODY || deserializeJson(out, body) != DeserializationError::Ok ||
        !out.is<JsonObject>()) {
        sendResult(kErrBadRequest);
        return false;
    }
    return true;
}

void LocalWebServer::sendJson(int code, const JsonDocument& doc) {
    String body;
    serializeJson(doc, body);
    server.send(code, "application/json", body);
}

void LocalWebServer::sendResult(const char* error) {
    JsonDocument doc;
    doc["ok"] = error == nullptr;
    if (error != nullptr) {
        doc["error"] = error;
    }
    sendJson(error == nullptr ? 200 : 400, doc);
}

bool LocalWebServer::saveProfile(const JsonDocument& doc) {
    if (!store_.save(doc)) {
        log_w("Khong ghi duoc profile (%u byte)", measureJson(doc));
        return false;
    }
    return true;
}
