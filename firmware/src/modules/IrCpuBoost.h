#pragma once
#include <stdint.h>

// Giữ CPU ở tốc độ cao trong lúc phát IR, ra khỏi phạm vi thì trả về mức cũ.
// Thư viện IR tạo sóng mang bằng cách bật/tắt GPIO trong vòng lặp, CPU chậm (chạy pin) làm sai tần số.
class IrCpuBoost {
public:
    IrCpuBoost();
    ~IrCpuBoost();
    IrCpuBoost(const IrCpuBoost&) = delete;
    IrCpuBoost& operator=(const IrCpuBoost&) = delete;

private:
    uint32_t previousMhz_;
};
