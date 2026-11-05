#include "modules/IrCpuBoost.h"

#include <Arduino.h>

#include "config.h"

IrCpuBoost::IrCpuBoost() : previousMhz_(getCpuFrequencyMhz()) {
    if (previousMhz_ != IR_TX_CPU_FREQ_MHZ) {
        log_i("Phat IR: CPU %lu -> %lu MHz", previousMhz_, IR_TX_CPU_FREQ_MHZ);
        setCpuFrequencyMhz(IR_TX_CPU_FREQ_MHZ);
    }
}

IrCpuBoost::~IrCpuBoost() {
    if (previousMhz_ != IR_TX_CPU_FREQ_MHZ) {
        setCpuFrequencyMhz(previousMhz_);
    }
}
