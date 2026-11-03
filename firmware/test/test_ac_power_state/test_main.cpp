#include <AcPowerState.h>
#include <unity.h>

void test_first_set_turns_on_then_subsequent_set_does_not_toggle() {
    AcPowerState state;

    // Lần đầu sau khi cấp điện: nói "trời nóng quá" / "bật điều hòa 22 độ" (SET, power=true) -> phải bật cờ toggle
    const AcPowerDecision first = state.evaluate("SET", true, true);
    TEST_ASSERT_FALSE(first.syncOnly);
    TEST_ASSERT_TRUE(first.power);
    TEST_ASSERT_TRUE(first.powerToggle);
    TEST_ASSERT_FALSE(first.skipToggleIr);
    state.commit("SET", first.power);

    // Lần 2 khi máy đang chạy: nói "26 độ" (SET, power=true) -> tuyệt đối KHÔNG toggle để tránh tắt máy âm trần
    const AcPowerDecision second = state.evaluate("SET", true, true);
    TEST_ASSERT_TRUE(second.power);
    TEST_ASSERT_FALSE(second.powerToggle);
    TEST_ASSERT_FALSE(second.skipToggleIr);
    state.commit("SET", second.power);
}

void test_power_off_on_boot_toggles_once_and_second_off_is_skipped() {
    AcPowerState state;

    // Máy âm trần đang bật sẵn bằng remote thật, mạch vừa cấp điện (known=false) -> nói "tắt điều hòa" vẫn tắt được
    const AcPowerDecision firstOff = state.evaluate("POWER_OFF", false, false);
    TEST_ASSERT_FALSE(firstOff.power);
    TEST_ASSERT_TRUE(firstOff.powerToggle);
    TEST_ASSERT_FALSE(firstOff.skipToggleIr);
    state.commit("POWER_OFF", firstOff.power);

    // Nói "tắt điều hòa" lặp lại khi máy đã tắt -> bỏ qua toggle để không bật nhầm máy lên
    const AcPowerDecision secondOff = state.evaluate("POWER_OFF", false, false);
    TEST_ASSERT_FALSE(secondOff.power);
    TEST_ASSERT_FALSE(secondOff.powerToggle);
    TEST_ASSERT_TRUE(secondOff.skipToggleIr);
}

void test_force_toggle_and_direct_power_always_toggle() {
    AcPowerState state;
    state.commit("SET", true);  // Mạch tưởng máy đang Bật (nhưng thực tế bị tắt bằng remote tay)

    // Bấm nút Bật trên giao diện kèm forceToggle -> vẫn phát PowerToggle = 1 để bật máy
    const AcPowerDecision forcedOn = state.evaluate("POWER_ON", true, true, true);
    TEST_ASSERT_TRUE(forcedOn.power);
    TEST_ASSERT_TRUE(forcedOn.powerToggle);
    TEST_ASSERT_FALSE(forcedOn.skipToggleIr);

    // Lệnh POWER trực tiếp đảo trạng thái hiện tại
    const AcPowerDecision directToggle = state.evaluate("POWER", false, false);
    TEST_ASSERT_FALSE(directToggle.power);
    TEST_ASSERT_TRUE(directToggle.powerToggle);
}

void test_keep_power_prevents_toggle_even_after_mcu_reboot() {
    AcPowerState state;  // Mạch vừa reboot nên known=false, nhưng trên App máy vẫn đang Bật (keepPower=true)

    const AcPowerDecision adjustTemp = state.evaluate("SET", true, true, false, true);
    TEST_ASSERT_TRUE(adjustTemp.power);
    TEST_ASSERT_FALSE(adjustTemp.powerToggle);
    state.commit("SET", adjustTemp.power);

    TEST_ASSERT_TRUE(state.isKnown());
    TEST_ASSERT_TRUE(state.isOn());
}

void test_sync_power_and_test_mode() {
    AcPowerState state;

    // TEST phát thử giao thức không làm thay đổi trạng thái lưu
    const AcPowerDecision testDec = state.evaluate("TEST", true, true);
    TEST_ASSERT_TRUE(testDec.powerToggle);
    state.commit("TEST", testDec.power);
    TEST_ASSERT_FALSE(state.isKnown());

    // SYNC_POWER chỉ cập nhật RAM, không phát IR
    const AcPowerDecision syncDec = state.evaluate("SYNC_POWER", true, true);
    TEST_ASSERT_TRUE(syncDec.syncOnly);
    TEST_ASSERT_FALSE(syncDec.powerToggle);
    TEST_ASSERT_TRUE(syncDec.skipToggleIr);
    state.commit("SYNC_POWER", syncDec.power);
    TEST_ASSERT_TRUE(state.isKnown());
    TEST_ASSERT_TRUE(state.isOn());
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_first_set_turns_on_then_subsequent_set_does_not_toggle);
    RUN_TEST(test_power_off_on_boot_toggles_once_and_second_off_is_skipped);
    RUN_TEST(test_force_toggle_and_direct_power_always_toggle);
    RUN_TEST(test_keep_power_prevents_toggle_even_after_mcu_reboot);
    RUN_TEST(test_sync_power_and_test_mode);
    return UNITY_END();
}

