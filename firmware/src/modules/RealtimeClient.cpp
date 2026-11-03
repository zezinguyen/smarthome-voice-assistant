#include "RealtimeClient.h"

#include <Arduino.h>

#include "Board.h"
#include "config.h"

namespace {
constexpr const char* kPhoenixTopic = "phoenix";
}

RealtimeClient::RealtimeClient() : backoff_(RECONNECT_BASE_MS, RECONNECT_MAX_MS, RECONNECT_JITTER_PERCENT) {}

void RealtimeClient::begin(const char* accessToken, const char* channelName, const char* presenceKey,
                           BroadcastHandler handler) {
    accessToken_ = accessToken;
    topic_ = String("realtime:") + channelName;
    presenceKey_ = presenceKey;
    handler_ = handler;

    const String path = String("/realtime/v1/websocket?apikey=") + SUPABASE_ANON_KEY + "&vsn=1.0.0";
    socket_.onEvent([this](WStype_t type, uint8_t* payload, size_t length) { onSocketEvent(type, payload, length); });
    // Heartbeat ở tầng Phoenix là bắt buộc; ping/pong của WebSocket để tắt (spec 5.1)
    socket_.beginSSL(SUPABASE_HOST, SUPABASE_PORT, path.c_str());
    socket_.setReconnectInterval(backoff_.nextDelayMs(boardRandom()));
    started_ = true;
}

void RealtimeClient::end() {
    if (!started_) {
        return;
    }
    socket_.disconnect();
    started_ = false;
    joined_ = false;
    heartbeatPending_ = false;
}

void RealtimeClient::update(uint32_t nowMs) {
    if (!started_) {
        return;
    }
    socket_.loop();
    if (!socket_.isConnected()) {
        return;
    }

    if (heartbeatPending_ && nowMs - lastHeartbeatMs_ >= HEARTBEAT_TIMEOUT_MS) {
        log_w("Heartbeat khong co tra loi -> ket noi lai");
        heartbeatPending_ = false;
        socket_.disconnect();
        return;
    }
    if (!heartbeatPending_ && nowMs - lastHeartbeatMs_ >= HEARTBEAT_INTERVAL_MS) {
        sendHeartbeat(nowMs);
    }
}

bool RealtimeClient::broadcast(const char* event, const JsonDocument& payload) {
    if (!joined_) {
        return false;
    }
    JsonDocument message;
    message["type"] = "broadcast";
    message["event"] = event;
    message["payload"] = payload;
    return send(topic_.c_str(), "broadcast", message);
}

bool RealtimeClient::trackPresence(const JsonDocument& state) {
    if (!joined_) {
        return false;
    }
    JsonDocument message;
    message["type"] = "presence";
    message["event"] = "track";
    message["payload"] = state;
    return send(topic_.c_str(), "presence", message);
}

void RealtimeClient::onSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            log_i("Realtime da ket noi");
            backoff_.reset();
            heartbeatPending_ = false;
            lastHeartbeatMs_ = millis();
            sendJoin();
            break;
        case WStype_DISCONNECTED:
            joined_ = false;
            socket_.setReconnectInterval(backoff_.nextDelayMs(boardRandom()));
            break;
        case WStype_TEXT:
            onMessage(reinterpret_cast<const char*>(payload), length);
            break;
        default:
            break;
    }
}

void RealtimeClient::onMessage(const char* text, size_t length) {
    JsonDocument doc;
    if (deserializeJson(doc, text, length) != DeserializationError::Ok) {
        return;
    }
    const char* topic = doc["topic"] | "";
    const char* event = doc["event"] | "";
    const uint32_t ref = strtoul(doc["ref"] | "0", nullptr, 10);
    JsonObjectConst payload = doc["payload"];

    if (strcmp(event, "phx_reply") == 0) {
        const bool ok = strcmp(payload["status"] | "", "ok") == 0;
        if (heartbeatPending_ && ref == heartbeatRef_) {
            heartbeatPending_ = false;
        } else if (ref == joinRef_) {
            joined_ = ok;
            if (!ok) {
                log_e("Khong vao duoc kenh (sai token / RLS?)");
            }
        }
        return;
    }
    if (topic_ != topic) {
        return;
    }
    if (strcmp(event, "broadcast") == 0 && handler_ != nullptr) {
        handler_(payload["event"] | "", payload["payload"].as<JsonObjectConst>());
    } else if (strcmp(event, "phx_error") == 0 || strcmp(event, "phx_close") == 0) {
        joined_ = false;
        socket_.disconnect();  // Kết nối lại rồi vào lại kênh
    }
    // TODO: event "access_token" để làm mới token khi gần hết hạn
}

void RealtimeClient::sendJoin() {
    JsonDocument payload;
    JsonObject config = payload["config"].to<JsonObject>();
    config["broadcast"]["self"] = false;
    config["presence"]["key"] = presenceKey_;
    config["private"] = false;  // TẠM: Supabase chưa có RLS cho kênh private (docs/todo.md mục 2)
    payload["access_token"] = accessToken_;
    send(topic_.c_str(), "phx_join", payload, &joinRef_);
}

void RealtimeClient::sendHeartbeat(uint32_t nowMs) {
    JsonDocument payload;
    payload.to<JsonObject>();
    if (send(kPhoenixTopic, "heartbeat", payload, &heartbeatRef_)) {
        heartbeatPending_ = true;
    }
    lastHeartbeatMs_ = nowMs;
}

bool RealtimeClient::send(const char* topic, const char* event, const JsonDocument& payload, uint32_t* refOut) {
    const uint32_t ref = nextRef_++;
    JsonDocument message;
    message["topic"] = topic;
    message["event"] = event;
    message["payload"] = payload;
    message["ref"] = String(ref);

    String text;
    serializeJson(message, text);
    if (!socket_.sendTXT(text)) {
        return false;
    }
    if (refOut != nullptr) {
        *refOut = ref;
    }
    return true;
}
