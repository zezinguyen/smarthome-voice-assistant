# 📟 SPEC PHẦN IoT – SMARTHOME VOICE ASSISTANT (v3)

> Phạm vi: ESP32 (chạy pin) + đường kết nối với Zalo Mini App **thông qua Supabase**.
> Phần NLP/Gemini và giao diện nằm ngoài tài liệu này.

## 0. Thay đổi so với v2

| # | Thay đổi | Xem mục |
|---|---|---|
| 1 | Xác nhận dùng **DFPlayer Mini** | 3 |
| 2 | **ESP32 chỉ nói chuyện với Supabase.** Bỏ API cục bộ, mDNS, trang web cục bộ, đường LAN dự phòng. WiFi riêng của mạch chỉ còn dùng để **cài WiFi lần đầu** | 4, 9 |
| 3 | Thêm mục **Bảo mật**, chia rõ "làm ngay" và "để đợt sau" | 10 |
| 4 | Giải thích **heartbeat** và chia tiết kiệm pin thành **2 giai đoạn** (dễ làm trước, nâng cao sau) | 5 |
| 5 | Mạch chỉ còn **1 nút**: bấm ngắn sáng OLED, giữ 5s **học lệnh** (mã gửi lên làm "mã chờ gán"), giữ 10s cài đặt WiFi/ghép đôi, giữ 20s khôi phục gốc. Bỏ nút nhanh bật/tắt thiết bị: mất Internet thì không điều khiển được | 3, 7, 9 |
| 6 | **App và mạch chỉ giao tiếp qua server.** App gọi Edge Function, server gửi xuống kênh riêng của từng mạch, mạch trả kết quả lên server. App không vào kênh của mạch | 4 |
| 7 | Thiết kế phải hỗ trợ **nhiều mạch trong một nhà** và **nhiều người dùng một mạch** | 4.4 |

---

## 1. Vai trò

| Vai trò | Là ai | Làm gì |
|---|---|---|
| Người dùng | Người trong nhà | Ra lệnh bằng giọng nói |
| Chủ nhà | Người sở hữu mạch | Cài mạch, mời thành viên, thêm thiết bị, tạo remote ảo |
| Thành viên | Người được chủ nhà mời | Điều khiển thiết bị trong nhà |
| Quản trị hệ thống (chủ trang web) | Nhóm phát triển | Quản lý danh mục chung, nhận báo lỗi |

## 2. Mục tiêu

1. Điều khiển Tivi, Điều hòa bằng hồng ngoại (IR) qua lệnh từ app.
2. Hỗ trợ sẵn **danh mục thiết bị lớn** (lấy từ dữ liệu mở).
3. Thiết bị chưa hỗ trợ → chủ nhà **tự tạo remote ảo** bằng mắt thu IR.
4. Thiết bị nào có vấn đề → **báo cho Quản trị hệ thống**.
5. **Chạy pin nhiều ngày**, nhận lệnh trong khoảng 1–2 giây.
6. **Người lạ không điều khiển được** thiết bị của nhà khác.

---

## 3. Phần cứng và nguồn pin

### 3.1 Danh sách linh kiện

| Linh kiện | Vai trò | Ghi chú |
|---|---|---|
| ESP32 DevKit (30 chân, ESP-WROOM-32) | Vi điều khiển, WiFi | Nhận 5V vào chân VIN, ổn áp AMS1117 trên kit hạ xuống 3.3V |
| **Pin LiPo 3.7V 1100mAh** | Nguồn | |
| **TP4056 (loại có bảo vệ DW01)** | Sạc pin qua USB, bảo vệ pin | Pin vào B+/B−, tải lấy ở OUT+/OUT− |
| **Module boost lên 5V** | Pin 3.0–4.2V → 5V cho VIN, LED IR, PAM8403 | Loại chỉnh được (MT3608) phải **vặn đúng 5.0V trước khi nối ESP32** |
| Tụ hoá 1000µF | Chống sụt áp khi WiFi phát / LED IR nháy | Đặt sát đầu ra boost |
| LED IR 940nm + trở 22Ω | **Mắt phát** | ~150mA mỗi xung từ 5V |
| **S8050** (NPN) + trở 330Ω (B) + 10k (B–E) | Khoá đóng/ngắt LED IR | 1 LED IR: S8050 đủ. Muốn phát xa hơn (2 LED nối tiếp hoặc giảm trở → dòng > 300mA) thì dùng **SS8050** |
| VS1838B / TSOP38238 | **Mắt thu** | Prototype: VCC nối 3V3 (ăn ~1mA thường trực). Muốn tiết kiệm: cấp VCC từ GPIO, chỉ bật khi học lệnh (`PIN_IR_RX_POWER`) |
| OLED 0.96" SSD1306 (I2C) | Hiện trạng thái, pin, mật khẩu WiFi cài đặt, mã ghép đôi | Tự tắt khi không dùng |
| **DFPlayer Mini + thẻ microSD** | Phát file âm thanh xác nhận | Nguồn 3V3 **thường trực** (bật lại mất ~1.5s đọc thẻ). Lấy tín hiệu ở DAC_L/DAC_R, không dùng SPK1/SPK2 |
| **PAM8403** (module khuếch đại) | Khuếch đại DAC → loa | Nguồn 5V từ boost. Dùng 1 kênh, đầu ra cầu (BTL) |
| Loa 3W 4Ω | Phát tiếng | |
| **LED RGB cathode chung** + 3 trở | LED trạng thái nhiều màu (mục 9.3) | Chân chung nối GND, GPIO kéo lên thì sáng |
| Nút nhấn × 1 | Học lệnh / cài đặt / reset | Xem bảng dưới |
| Trở 100k × 4 | Cầu chia đo pin, đo USB | |

**Thẻ nhớ DFPlayer**: file phải nằm trong thư mục `mp3` và đặt tên 4 chữ số (`/mp3/0001.mp3`). Nếu đặt tên kiểu `1.mp3` ở thư mục gốc, DFPlayer phát theo thứ tự chép file chứ không theo số. Danh sách (khớp `AudioTrack` trong `firmware/lib/core/src/AudioTracks.h`):

| File | Nội dung | Khi nào phát |
|---|---|---|
| 0001.mp3 | "Đã nhận lệnh" | Lệnh từ app thực hiện xong |
| 0002.mp3 | "Không tìm thấy lệnh" | Thiết bị/nút không có trong profile (`E_CMD_NOT_FOUND`) |
| 0003.mp3 | "Đang vào chế độ thiết lập" | Bật WiFi riêng + mã ghép đôi |
| 0004.mp3 | "Mời bấm phím trên remote" | Bắt đầu học lệnh |
| 0005.mp3 | "Đã học lệnh" | Học lệnh thành công |
| 0006.mp3 | "Học lệnh thất bại" | Hết 15s hoặc lệch quá 3 lần |
| 0007.mp3 | "Không thực hiện được lệnh" | Lỗi phát IR, đang học lệnh, gửi quá nhiều lệnh |
| 0008.mp3 | "Pin yếu" | Pin xuống ≤20% khi chạy pin |
| 0009.mp3 | "Khôi phục cài đặt gốc" | Giữ nút 20 giây |

> 🔊 DFPlayer chỉ **phát file có sẵn** trên thẻ nhớ (VD "Đã bật", "Mất kết nối"), không đọc chữ thành tiếng. Câu đầy đủ ("Đã bật điều hòa 24 độ") vẫn do **điện thoại** phát.

### 3.2 Lưu ý khi dùng pin (dễ sai)

| Vấn đề | Cách xử lý |
|---|---|
| Đường nguồn pin → boost 5V → AMS1117 3.3V tốn điện hơn dùng LDO rớt áp thấp từ pin (AMS1117 bỏ phí ~1/3 năng lượng thành nhiệt, boost có dòng tĩnh vài mA) | Chấp nhận ở giai đoạn đầu, **đo dòng thực tế**. Không đạt mục tiêu pin thì cấp 3V3 bằng LDO HT7333/ME6211 từ pin, chỉ giữ boost cho LED IR + DFPlayer |
| Pin đầy 4.2V **cao hơn** mức tối đa của ESP32 (3.6V) | Không nối pin thẳng vào chân 3V3 |
| DevKit có chip USB-UART và ổn áp ăn điện thường trực | Nếu pin không đạt mục tiêu, chuyển sang module ESP32 trần/board tiết kiệm điện |
| WiFi phát / LED IR gây sụt áp (dòng đỉnh vài trăm mA) | Tụ 1000µF sát đầu ra boost |
| DFPlayer (~20mA) + PAM8403 (~10mA ở 5V) ăn điện thường trực | Chấp nhận để phát tiếng ngay, không chờ DFPlayer khởi động. Đổi lại pin giảm đáng kể (mục 5.4). Nếu cần tiết kiệm: nối chân **SHDN** của chip PAM8403 vào một GPIO (mức thấp = tắt ampli, bật lại gần như tức thì) |
| DFPlayer cấp 3V3 mà đẩy loa trực tiếp: tối đa ~0.9W vào 4Ω và dòng đỉnh ~0.7A kéo trên đường 3V3 chung với ESP32 → dễ sụt áp, reset | Loa đi qua **PAM8403 cấp 5V** |
| Mắt thu ăn điện liên tục (~0.5–1.5mA) | Nhỏ so với tổng ~75mA hiện tại nên prototype nối thẳng 3V3. Khi tối ưu pin (giai đoạn 2): cấp nguồn qua GPIO (đặt `PIN_IR_RX_POWER`), thêm tụ 100nF sát chân VCC |
| TP4056 vừa sạc vừa chạy tải có thể không ngắt sạc đúng | Dùng mạch ưu tiên nguồn (PMOS + diode) hoặc module có load sharing |
| ADC2 không dùng được khi bật WiFi | Đo pin, đo USB bằng chân ADC1 (GPIO32–39) |
| Chân strapping (0, 2, 5, 12, 15) ảnh hưởng lúc khởi động | Không dùng cho ngoại vi |

### 3.3 Sơ đồ nối chân (ESP32 DevKit 30 chân)

Chia theo **cạnh board** để dây không bắt chéo: module đặt bên phải nối chân cạnh phải, phần nguồn và LED/nút bên trái nối chân cạnh trái. Giá trị chân nằm trong `firmware/include/config.h`.

```
                     ┌──────────────┐
                  EN │●            ●│ D23
    Đo pin (B+) ── VP│●            ●│ D22 ── OLED SCL
   Đo USB (IN+) ── VN│●            ●│ TX0    (USB nạp code)
                  D34│●            ●│ RX0    (USB nạp code)
                  D35│●            ●│ D21 ── OLED SDA
                  D32│●   ESP32    ●│ D19
                  D33│●  DevKit    ●│ D18 ── Mắt thu OUT
     RGB  R  ──── D25│●            ●│ D5
     RGB  G  ──── D26│●            ●│ TX2 ── DFPlayer RX
     RGB  B  ──── D27│●            ●│ RX2 ── DFPlayer TX
S8050 B ← 330Ω ── D14│●            ●│ D4
                  D12│●            ●│ D2
     Nút ──────── D13│●            ●│ D15
Nút, chung RGB ── GND│●            ●│ GND ── GND chung
   Boost 5V ───── VIN│●            ●│ 3V3 ── OLED, DFPlayer, VCC mắt thu
                     └──────────────┘
```

**Nguồn**

| Từ | Đến | Ghi chú |
|---|---|---|
| Pin + / − | TP4056 B+ / B− | |
| TP4056 OUT+ / OUT− | Boost IN+ / IN− | |
| Boost OUT+ (5V) | ESP32 VIN, nguồn LED IR, VCC của PAM8403 | Tụ 1000µF giữa OUT+ và GND, đặt sát boost |
| Boost OUT− | GND chung | Mọi GND nối chung một điểm |

**Đo pin / sạc** (cạnh trái, trên – gần TP4056)

| Tín hiệu | Nối |
|---|---|
| VP (GPIO36) | Giữa cầu chia: TP4056 **B+** – 100k – VP – 100k – GND |
| VN (GPIO39) | Giữa cầu chia: TP4056 **IN+** (5V cổng sạc) – 100k – VN – 100k – GND |

Module TP4056 không đưa chân CHRG ra nên firmware suy ra trạng thái: có USB + pin < 4.15V = đang sạc; có USB + pin ≥ 4.15V = đầy. Lúc đang sạc, % pin hiển thị cao hơn thực tế (điện áp sạc cao hơn điện áp nghỉ).

**LED RGB cathode chung + nút** (cạnh trái, dưới)

| Tín hiệu | Nối |
|---|---|
| Chân chung (cathode, chân dài nhất) | GND |
| D25 / D26 / D27 | Trở → chân R / G / B. Đỏ 220Ω; xanh lá và xanh dương dùng ~47Ω vì sáng ở ~3V, gần sát 3.3V (330Ω sẽ gần như không thấy sáng) |
| D13 | Một chân nút; chân còn lại vào **GND ngay cạnh** (dùng pull-up trong) |

**OLED** (cạnh phải, trên – OLED đặt phía trên board)

| OLED | ESP32 |
|---|---|
| VCC / GND | 3V3 / GND |
| SCL / SDA | D22 / D21 |

**Mắt thu IR** (VS1838B, nhìn mặt có vòm: OUT – GND – VCC)

| Mắt thu | ESP32 |
|---|---|
| VCC | 3V3 |
| OUT | D18 |
| GND | GND |

**DFPlayer Mini** (cạnh phải, giữa)

| DFPlayer | Nối |
|---|---|
| VCC / GND | 3V3 / GND |
| RX | TX2 (GPIO17), nối thẳng – cùng mức 3.3V nên không cần trở 1k |
| TX | RX2 (GPIO16), nối thẳng |
| DAC_R (hoặc DAC_L) | Đầu vào R (hoặc L) của PAM8403 |
| SPK1 / SPK2 | Để trống |

**PAM8403 + loa** (đặt cạnh DFPlayer)

| PAM8403 | Nối |
|---|---|
| 5V / GND | Boost 5V / GND chung |
| Đầu vào R (hoặc L), GND đầu vào | DAC của DFPlayer, GND của DFPlayer (dây GND đi sát dây tín hiệu để bớt ù) |
| R+ / R− (hoặc L+ / L−) | Hai dây loa. **Không** nối R− xuống GND: đầu ra dạng cầu, nối là chập mạch |

**LED IR** (cạnh trái, dưới)

| Linh kiện | Nối |
|---|---|
| Boost 5V → 22Ω → anode LED IR | |
| Cathode LED IR → C của S8050 | |
| E của S8050 → GND | |
| B của S8050 ← 330Ω ← **D14**; 10k từ B xuống GND | Giữ LED tắt lúc khởi động |

Chân trống còn lại (D23, D34, D32, D33, D35, D19, D4) để dự phòng; D23 có thể dùng cho chân SHDN của PAM8403 nếu muốn tắt ampli khi im lặng. Không dùng D2, D5, D12, D15 (chân strapping).

Nút duy nhất: giữ rồi **thả tay** ở mốc nào thì chạy chức năng của mốc đó. Trong lúc giữ, OLED hiện "Tha: <chức năng>" để biết lúc nào thả.

| Thao tác | Chức năng |
|---|---|
| Bấm ngắn | Sáng OLED (xem trạng thái, pin) |
| Giữ 5 giây | **Học lệnh**: bật mắt thu, chĩa remote gốc bấm 2 lần → mã gửi lên Supabase làm "mã chờ gán" (mục 7.1) |
| Giữ 10 giây | **Cài đặt**: bật WiFi riêng + mã ghép đôi (mục 10.2). Mạch chưa ghép đôi / chưa có WiFi thì tự vào chế độ này khi bật nguồn |
| Giữ 20 giây | **Khôi phục gốc**: xoá token + WiFi rồi khởi động lại |

### 3.4 Hai chế độ nguồn

| Chế độ | Khi nào | Hành vi |
|---|---|---|
| 🔌 Cắm sạc | Có USB | Tắt Light Sleep, phản hồi nhanh nhất |
| 🔋 Chạy pin | Không có USB | Bật tiết kiệm pin (mục 5) |

Pin ≤20% → báo chủ nhà; ≤10% → tắt OLED/loa; ≤5% → báo "sắp hết pin" lên Supabase rồi chỉ giữ chức năng cơ bản.

---

## 4. Kiến trúc kết nối

```
 Zalo Mini App ──HTTPS (Edge Functions)──►  SERVER (Supabase)  ──WSS kênh riêng của mạch──► ESP32
               ◄──Realtime (kênh của nhà)──  DB + Edge Functions  ◄──HTTPS (REST/RPC)────────
```

**App và mạch không nói chuyện trực tiếp với nhau, kể cả qua Realtime.** Mọi yêu cầu đi qua server:

- **App → Server**: gọi Edge Function (`send-command`, `learn-start`…) bằng JWT người dùng. App không biết định dạng lệnh của mạch, không vào được kênh của mạch.
- **Server → Mạch**: server (quyền `service_role`, chỉ nằm ở Edge Function) gửi broadcast vào kênh **riêng của từng mạch** `board:<boardId>`. Mạch chỉ được nghe kênh của chính nó.
- **Mạch → Server**: ACK, kết quả học lệnh, trạng thái pin/RSSI, mã học, báo lỗi đều gửi qua **REST/RPC** (token của mạch). Server ghi vào DB.
- **Server → App**: app nghe kênh của nhà `home:<homeId>` (chỉ đọc) hoặc thay đổi của bảng `commands`; server/trigger DB đẩy kết quả vào đó.

**ESP32 chỉ kết nối ra Supabase, không mở cổng nào lắng nghe trong nhà.** Ưu điểm:

- Không còn vấn đề đổi IP, mDNS, hay Zalo (HTTPS) bị chặn khi gọi HTTP vào mạch.
- Điều khiển được từ xa (khi mạch online).
- **Bớt rủi ro bảo mật**: không có cổng nào để người trong mạng nhà dò vào.
- Code firmware gọn hơn.

**Vì sao mọi thứ phải qua server** (thay vì app broadcast thẳng vào kênh mạch đang nghe):

- **Phân quyền ở một chỗ**: server kiểm tra người dùng có quyền với thiết bị đó không, có bị gỡ khỏi nhà chưa. Gửi thẳng vào kênh thì người đã bị gỡ vẫn gửi được tới khi JWT hết hạn, và không thể chặn theo từng thiết bị.
- **Một nguồn sinh `commandId`, `seq`, `expiresAt`**: nhiều điện thoại có đồng hồ lệch nhau sẽ sinh `seq`/`expiresAt` sai (mạch bỏ lệnh). Server sinh theo đồng hồ và bộ đếm của chính nó.
- **Định tuyến**: server biết thiết bị thuộc mạch nào (mục 4.4), app chỉ cần nói "điều hòa phòng ngủ".
- **Lưu lại**: mọi lệnh, kết quả, lần học lệnh nằm trong DB → có lịch sử "ai điều khiển gì", app đóng giữa chừng không mất kết quả.
- **Đổi firmware/giao thức mạch không phải cập nhật app**.

**Đánh đổi:**

- Mất Internet hoặc Supabase lỗi → không điều khiển được từ app. Chấp nhận được vì nhận diện giọng nói (Web Speech/Gemini) vốn cũng cần Internet. Lúc đó mạch chỉ báo trạng thái trên OLED/LED (mục 9).
- Thêm một chặng (Edge Function) và ACK đi bằng HTTPS: chậm hơn broadcast thẳng cỡ vài trăm ms. Mạch giữ kết nối HTTPS (keep-alive) để không bắt tay TLS lại mỗi lần ACK. Phải đo lại tiêu chí nghiệm thu 1.
- Online/offline không còn tự có từ Presence: mạch tự báo trạng thái định kỳ (mục 4.2), server coi quá hạn là offline.

### 4.1 Luồng một lệnh

```
1. App gọi Edge Function send-command { deviceId, action, params, clientRequestId }
2. Server: xác thực người dùng → kiểm tra quyền với thiết bị → tìm mạch phụ trách thiết bị
   → mạch offline thì trả lỗi ngay → ghi dòng vào bảng commands (status = sent)
   → sinh commandId, seq (bộ đếm riêng của mạch), expiresAt (= giờ server + 10 giây)
   → broadcast "command" vào kênh board:<boardId>
3. ESP32 nhận qua WebSocket
4. Quá hạn (expiresAt) → bỏ qua. Trùng commandId đã xử lý → không phát lại.
5. ESP32 tra mã IR trong bộ nhớ của chính nó (không hỏi cloud)
6. ESP32 phát IR → gửi ACK {commandId, ok/error} lên server (RPC)
7. Server cập nhật commands (status = ok / lỗi) → đẩy kết quả cho app
8. App nhận kết quả → điện thoại đọc "Đã bật điều hòa 24 độ"
   Không có kết quả sau 3 giây → app gọi lại send-command với cùng clientRequestId
   (server gửi lại đúng commandId cũ) rồi mới báo lỗi
```

- Lệnh có **hạn dùng** để lệnh cũ không bắn ra sau khi mạng có lại.
- ESP32 cần **giờ chính xác (NTP)** để kiểm tra hạn dùng. Chưa đồng bộ giờ được thì chỉ nhận lệnh có số thứ tự lớn hơn lệnh gần nhất.
- Gán phím cho remote ảo cũng đi qua server: app gọi `learn-start`, server gửi `learn_start` cho mạch, mạch gửi tiến trình/kết quả lên server, server chuyển cho **đúng người đã yêu cầu**.

### 4.2 Dữ liệu nào để ở đâu

| Dữ liệu | Lưu ở | Lý do |
|---|---|---|
| Danh mục thiết bị chung | Supabase | Lớn, Quản trị cập nhật |
| Thiết bị + remote ảo của từng nhà | Supabase (bản gốc) **và ESP32 (bản sao, chỉ phần thiết bị của mạch đó)** | Phát IR nhanh, không cần tải mỗi lệnh |
| Lệnh và kết quả | Bảng `commands` (server ghi) | Lịch sử, nhiều người cùng thấy, thử lại an toàn |
| Server → mạch | Kênh Realtime riêng của mạch (Broadcast) | Nhẹ, nhanh |
| Online/offline, pin, RSSI, firmware | Bảng `boards` (mạch tự gửi định kỳ + khi thay đổi) | Server cần biết để định tuyến và báo app |
| Trạng thái điều hòa gần nhất | Bảng `device_state` (server) + NVS của mạch | Người dùng chỉ đổi 1 thông số, server ghép thành trạng thái đầy đủ |
| Báo lỗi | Bảng `error_reports` | Quản trị xem sau |

Đồng bộ: **mỗi mạch** có `profile_version` riêng. Server tăng số này khi thiết bị của mạch thay đổi và báo cho mạch; mạch thấy số phiên bản khác thì tải bản mới (HTTPS, một lần) rồi lưu vào LittleFS.

### 4.3 Bảng Supabase gợi ý

| Bảng | Nội dung chính |
|---|---|
| `homes` | id, tên |
| `home_members` | home_id, user_id, vai trò (`owner` / `member`) |
| `boards` | id mạch, home_id, tên/phòng, firmware, `profile_version`, trạng thái ghép đôi, pin, RSSI, `last_seen_at` |
| `ir_catalog` | Danh mục chung: loại, hãng, model, protocol, mã lệnh, nguồn |
| `home_devices` | Thiết bị của nhà (tham chiếu catalog hoặc `custom`), **`board_id` = mạch phát IR cho thiết bị**, phòng, tên |
| `custom_remotes` | Nút đã tạo: tên, icon, action, `voiceAliases`, mã IR |
| `commands` | id (= `commandId`), home_id, board_id, device_id, **user_id**, action, params, seq, expires_at, status, error, thời điểm gửi/ACK |
| `device_state` | Trạng thái gần nhất của thiết bị (điều hòa: power/temp/mode/fan), ai đổi, lúc nào |
| `learn_sessions` | Phiên học lệnh từ app: board_id, user_id, trạng thái, kết quả |
| `error_reports` | Lỗi từng thiết bị |
| `unsupported_requests` | Hãng/model chủ nhà tìm mà chưa có |
| `learned_codes` | Mã học từ nút trên mạch, **chờ chủ nhà gán**: home_id, board_id, ir (protocol/code/bits hoặc raw/freq), thời điểm học, trạng thái (chờ gán / đã gán / bỏ) |

Gói miễn phí Supabase có giới hạn kết nối đồng thời, số message, số lần gọi Edge Function, và có thể **tự tạm dừng project khi lâu không hoạt động**. Kiểm tra trước khi demo. Mỗi mạch giữ 1 kết nối WSS; mỗi app đang mở giữ 1 kết nối.

### 4.4 Ghi chú bắt buộc: nhiều mạch trong một nhà, nhiều người dùng một mạch

> Thiết kế bảng, RLS và API **ngay từ đầu** phải chạy đúng với hai tình huống dưới đây. Không làm theo giả định "1 nhà = 1 mạch = 1 người" rồi sửa sau: sửa sau phải đổi cấu trúc bảng, kênh Realtime và định dạng profile của mọi mạch đang chạy.

**A. Một nhà có nhiều mạch** (VD mỗi phòng một mạch, IR không xuyên tường)

| Vấn đề | Cách giải quyết |
|---|---|
| Lệnh phải tới đúng mạch | Mỗi thiết bị có `board_id` (mạch nhìn thấy thiết bị đó). Server tra `board_id` rồi gửi vào kênh `board:<boardId>`. **Không** dùng kênh chung của nhà để gửi lệnh (mọi mạch trong nhà sẽ cùng nhận) |
| Profile | Mỗi mạch có profile + `profile_version` **riêng**, chỉ chứa thiết bị của nó. Sửa thiết bị phòng khách không bắt mạch phòng ngủ tải lại |
| `deviceId` | Khoá trong profile chỉ cần duy nhất **trong một mạch**; server giữ ánh xạ `home_devices.id` ↔ (`board_id`, khoá trong profile) |
| Giọng nói mơ hồ ("bật điều hòa" khi nhà có 2 cái) | NLP/server dùng phòng, tên thiết bị, hoặc thiết bị dùng gần nhất; vẫn không rõ thì app hỏi lại. Không gửi cho tất cả |
| Một thiết bị mà 2 mạch đều phát tới | Chỉ gán **một** `board_id` chính (tránh phát 2 lần, VD lệnh POWER dạng bật/tắt luân phiên sẽ bật rồi tắt) |
| Đổi mạch / chuyển thiết bị sang phòng khác | Đổi `board_id` → tăng `profile_version` của **cả mạch cũ và mạch mới** |
| Mã học, báo lỗi, trạng thái pin | Luôn kèm `board_id`; app hiện theo từng mạch ("Mạch phòng khách pin 15%") |
| Ghép đôi | Ghép thêm mạch vào nhà **đã có** (không tạo nhà mới mỗi lần). Một mạch vẫn chỉ thuộc một nhà |
| Giới hạn | Đặt giới hạn số mạch/nhà (cả để tính quota Realtime) |

**B. Một mạch có nhiều người dùng** (cả gia đình cùng điều khiển, có thể cùng lúc)

| Vấn đề | Cách giải quyết |
|---|---|
| Quyền | Quyền gắn với **nhà** (`home_members`), không gắn với mạch. Server kiểm tra mỗi lệnh. Sau này mở rộng quyền theo từng thiết bị (VD trẻ em không được bật điều hòa) mà không đụng tới firmware |
| Gỡ thành viên | Có hiệu lực **ngay** ở lệnh tiếp theo vì server kiểm tra mỗi lần (không phụ thuộc thời hạn JWT) |
| Hai người cùng ra lệnh một lúc | Mạch xử lý theo thứ tự nhận; `seq` do server cấp theo bộ đếm của mạch nên luôn tăng. Server giới hạn tốc độ theo người và theo mạch, mạch vẫn giữ giới hạn của nó |
| Trạng thái điều hòa | Người A đặt 24°C, người B bảo "giảm 1 độ" → server lấy `device_state` hiện tại, ghép thay đổi, gửi **trạng thái đầy đủ** xuống mạch, rồi lưu lại. App không tự giữ trạng thái (sẽ lệch giữa các điện thoại) |
| Kết quả lệnh | Gửi về cho **người ra lệnh**; những người khác trong nhà thấy trạng thái thiết bị đổi qua kênh của nhà |
| Học lệnh | Mỗi mạch chỉ **một phiên học** một lúc. Người thứ hai bấm "gán phím" khi đang có phiên → server báo "Người khác đang gán phím" thay vì gửi xuống mạch. Tiến trình/kết quả chỉ gửi cho người mở phiên |
| `commandId` trùng | Do server sinh (UUID), không phụ thuộc điện thoại. App thử lại bằng `clientRequestId` của chính nó |
| Lịch sử | `commands.user_id` → xem được "ai bật gì, lúc nào" |
| Thông báo (pin yếu, mạch offline, lỗi thiết bị) | Gửi cho chủ nhà; thành viên chỉ thấy trong app khi mở |
| Một người thuộc nhiều nhà | App phải có "nhà hiện tại"; mọi API nhận `homeId` hoặc suy ra từ thiết bị, server kiểm tra người đó thuộc nhà ấy |

---

## 5. Tiết kiệm pin

### 5.1 Heartbeat là gì? (giải thích dễ hiểu)

Kết nối WebSocket giống như **cuộc gọi đang giữ máy**. Nếu hai bên im lặng quá lâu, **server hoặc router tưởng đã cúp máy** và tự cắt. Heartbeat là một tin nhắn rất nhỏ gửi định kỳ, kiểu "Tôi vẫn đây", để giữ cuộc gọi sống.

```
ESP32 ngủ ... (25 giây) ... thức dậy, gửi "heartbeat" → Supabase trả lời "ok" → ESP32 ngủ tiếp
```

Có **hai lớp** dễ nhầm:

| Lớp | Là gì | Ai yêu cầu |
|---|---|---|
| **Heartbeat của Supabase Realtime** | Tin nhắn JSON `heartbeat` gửi lên topic `phoenix`, server trả lời lại | **Bắt buộc**: Supabase Realtime đóng kết nối nếu không có. Chu kỳ thư viện chính thức dùng cỡ 25–30 giây, cần đối chiếu tài liệu hiện hành |
| WebSocket Ping/Pong | Gói kiểm tra ở mức giao thức WebSocket | Tuỳ chọn. Nếu đã có lớp trên thì có thể tắt hoặc đặt thưa (≥30 giây) |

Chu kỳ ảnh hưởng thế nào:

| Chu kỳ | Tốt | Xấu |
|---|---|---|
| Ngắn (1–5 giây) | Phát hiện đứt kết nối nhanh | **Đánh thức radio liên tục, tốn pin**, phá hiệu quả tiết kiệm điện |
| **Khoảng 25 giây (đề xuất khởi điểm)** | Cân bằng | Phát hiện đứt kết nối chậm tối đa khoảng 25–35 giây |
| Dài (>60 giây) | Rất tiết kiệm | Dễ bị server/router cắt vì tưởng đã chết |

Đặt thêm **thời gian chờ trả lời** (VD 10 giây). Heartbeat gửi đi mà không có trả lời thì coi như đứt, kết nối lại (xem 9).

### 5.2 Hai giai đoạn tiết kiệm pin

> Nguyên tắc: **làm cách dễ trước, đo, đạt mục tiêu thì dừng.** Chưa đạt mới làm cách nâng cao.

**Giai đoạn 1: dễ làm, ít rủi ro (làm ngay)**

| Biện pháp | Chi tiết |
|---|---|
| Wi-Fi Power Save (Modem-Sleep) | `esp_wifi_set_ps(WIFI_PS_MIN_MODEM)`, thử `WIFI_PS_MAX_MODEM` nếu cần tiết kiệm hơn. Radio tắt giữa các nhịp beacon của router, router giữ gói đến rồi giao ở nhịp sau |
| Hạ xung CPU | `setCpuFrequencyMhz(80)` (đừng hạ thấp hơn 80MHz khi chưa dùng Light Sleep tự động) |
| Heartbeat | Khoảng 25 giây, đúng như 5.1 |
| Tắt ngoại vi | Xem 5.3 |

Kỳ vọng: dòng trung bình **khoảng 15–25mA** (theo tài liệu tham khảo, cần đo thực tế) → pin 1000mAh dùng được **khoảng 1.5–2 ngày**.

**Giai đoạn 2: nâng cao (làm nếu pin chưa đạt mục tiêu)**

| Biện pháp | Chi tiết |
|---|---|
| Automatic Light Sleep | `esp_pm_configure` với `light_sleep_enable = true`: cả CPU và radio ngủ khi rảnh, tự thức khi có gói đến |
| Tăng listen interval / DTIM | Thức thưa hơn, tiết kiệm hơn, trễ nhận lệnh tăng |

Kỳ vọng: dòng trung bình **vài mA** (cần đo), pin có thể dùng **vài ngày**.

> ⚠️ **Rủi ro giai đoạn 2:** Automatic Light Sleep cần bật `CONFIG_PM_ENABLE` (và một số tuỳ chọn liên quan) trong sdkconfig. Thư viện Arduino-ESP32 biên dịch sẵn có thể **không bật**, nên có thể phải dùng **ESP-IDF** hoặc PlatformIO có tuỳ chỉnh. Một số router (nhất là đời cũ) có thể làm kết nối kém ổn định, độ trễ nhận lệnh tăng (tuỳ DTIM). Cần thử trên router thật.
>
> Không dùng **Deep Sleep**: nó ngắt hoàn toàn WiFi và đứt WebSocket.

### 5.3 Tắt ngoại vi khi không dùng

| Ngoại vi | Quy tắc |
|---|---|
| OLED | Tắt sau 10 giây, bấm nút để sáng. Luôn sáng khi đang cài đặt / học lệnh |
| DFPlayer + PAM8403 | Cấp điện thường trực để phát ngay (đánh đổi ~30mA, xem 3.2) |
| Mắt thu IR | Chỉ bật bộ thu (ngắt) khi gán phím; cấp điện qua GPIO nếu đặt `PIN_IR_RX_POWER` |
| LED trạng thái | Chỉ nháy ngắn |
| Gửi trạng thái (pin, RSSI) | Gom lại, mỗi 5–10 phút hoặc khi đổi đáng kể |

### 5.4 Ước tính thời lượng pin (ví dụ minh hoạ, **bắt buộc đo thực tế**)

Công thức: `giờ ≈ 1000mAh × 80% ÷ dòng trung bình (mA)`

| Dòng trung bình giả định | Thời lượng |
|---|---|
| 5 mA (Giai đoạn 2 chạy tốt) | ~160 giờ (khoảng 6–7 ngày) |
| 10 mA | ~80 giờ (khoảng 3 ngày) |
| 20 mA (Giai đoạn 1) | ~40 giờ (khoảng 1.7 ngày) |

**Với phần cứng hiện tại** (pin 1100mAh → boost 5V → AMS1117 3.3V, DFPlayer + PAM8403 bật thường trực): đường boost + ổn áp tuyến tính làm dòng rút từ pin ≈ 1.5 × dòng ở 3V3. Ước tính thô: ESP32 ~20mA + DFPlayer ~20mA (ở 3V3) → ~60mA từ pin, cộng PAM8403 ~10mA ở 5V → ~15mA từ pin, tổng **~75mA → khoảng 12 giờ**. Muốn chạy nhiều ngày phải giảm phần âm thanh thường trực (SHDN của PAM8403, hoặc ngắt nguồn DFPlayer và chấp nhận chờ ~1.5s) và cấp 3V3 bằng LDO từ pin (mục 3.2).

---

## 6. Dữ liệu thiết bị và danh mục

### 6.1 Danh mục lớn ở Supabase, ESP32 chỉ giữ cái nhà đang dùng

```
[ir_catalog trên Supabase] ──(chủ nhà chọn hãng/model)──► [home_devices]
                                                              │ đồng bộ
                                                              ▼
                                                   [ESP32 lưu bản sao nhỏ]
```

**Nguồn dữ liệu gợi ý** (kiểm tra giấy phép): IRremoteESP8266 (nhiều hãng điều hòa qua `IRac`), IRDB, Flipper-IRDB, SmartIR (Home Assistant), và mã chủ nhà đóng góp (đã duyệt).

### 6.2 Hai loại thiết bị

| | Tivi và thiết bị "bấm nút" | Điều hòa |
|---|---|---|
| Cách điều khiển | Mỗi nút = 1 mã IR | Mỗi lần gửi **cả trạng thái** (nhiệt độ, chế độ, quạt…) |
| Dữ liệu lưu | Bảng `nút → mã` | `hãng/protocol` của IRac + giới hạn nhiệt độ |
| Thiết bị lạ | Remote ảo, gán từng nút | Remote ảo theo "trạng thái" (7.5) |

### 6.3 Ví dụ dữ liệu

```json
// Tivi trong catalog
{ "id": "tv_samsung_generic_01", "type": "tv", "brand": "Samsung", "model": "Generic",
  "source": "irdb",
  "commands": {
    "POWER":  { "protocol": "SAMSUNG", "code": "0xE0E040BF", "bits": 32 },
    "VOL_UP": { "protocol": "SAMSUNG", "code": "0xE0E0E01F", "bits": 32 } } }

// Điều hòa trong catalog (chỉ cần hãng)
{ "id": "ac_panasonic_01", "type": "ac", "brand": "Panasonic", "irac_protocol": "PANASONIC_AC",
  "limits": { "temp_min": 16, "temp_max": 30, "modes": ["cool","heat","dry","fan","auto"] } }

// Remote ảo do chủ nhà tạo
{ "remoteId": "custom_001", "name": "Tivi phòng ngủ", "origin": "custom",
  "buttons": [
    { "label": "Nguồn", "action": "POWER", "voiceAliases": ["bật tivi","tắt tivi"],
      "ir": { "protocol": "NEC", "code": "0x20DF10EF", "bits": 32 } },
    { "label": "Chế độ phim", "action": "CUSTOM", "voiceAliases": ["chế độ phim"],
      "ir": { "protocol": "UNKNOWN", "raw": [9000,4500,560,560,560,1690], "freq": 38 } } ] }
```

---

## 7. Thiết bị chưa hỗ trợ → Remote ảo tự tạo

**Mục đích:** mua thiết bị mà hệ thống chưa có vẫn dùng được, không phải chờ cập nhật.

### 7.1 Luồng cho chủ nhà

```
Thêm thiết bị
  → Tìm hãng/model trong danh mục
       ├─ Có  → dùng luôn
       └─ Không có → "Tự tạo remote" (ghi 1 dòng vào unsupported_requests
                      để Quản trị biết cần bổ sung)

Tự tạo remote (Cách 1: bắt đầu từ app)
  1. Chọn loại: Tivi / Điều hòa / Quạt / Loa / Đầu thu / Máy chiếu / Khác
  2. App hiện sẵn bộ nút gợi ý theo loại; chủ nhà thêm/xoá/đổi tên nút, chọn icon
  3. GÁN PHÍM, làm lần lượt từng nút:
       a. Chủ nhà bấm vào nút trên màn hình app (nút nhấp nháy "Đang chờ…")
       b. App gọi server (learn-start) → server gửi learn_start cho mạch → mạch bật mắt thu
       c. Chủ nhà chĩa remote gốc vào mắt thu, bấm phím tương ứng
       d. Mạch gửi kết quả lên server → server chuyển về app → nút chuyển "✓ Đã gán"
  4. Thử: bấm nút ảo → mạch phát IR → chủ nhà xác nhận thiết bị có phản ứng không
  5. Đặt tên và từ khoá giọng nói cho nút → Lưu
```

**Cách 2: học từ nút trên mạch** (không cần mở app trước)

```
1. Giữ nút 5 giây rồi thả → mạch bật mắt thu, OLED "Bam phim tren remote"
2. Chĩa remote gốc, bấm phím 2 lần (so khớp như 7.2)
3. Mạch ghi mã vào bảng learned_codes (REST, token của mạch) → OLED "Da hoc, gan trong app"
   Mất mạng thì giữ trong hàng đợi (tối đa 4 mã), có mạng gửi bù
4. App hiện danh sách "mã chờ gán" → chủ nhà chọn thiết bị/nút, đặt tên, từ khoá giọng nói
5. Gán xong → cập nhật profile_version → mạch tải profile mới
```

Muốn học nhiều phím thì lặp lại bước 1. Cách 1 (bắt đầu từ app, qua server) vẫn giữ để gán từng nút khi đang tạo remote ảo.

### 7.2 Quy tắc gán phím

- Chờ tối đa **15 giây**, quá hạn tự thoát và tắt mắt thu.
- Mỗi phím thu **2 lần** và so sánh; khác nhau nhiều thì yêu cầu bấm lại (chống nhiễu).
- Giải mã được protocol → lưu `protocol + code`; không giải mã được → lưu **raw**.
- Đang gán phím thì không phát IR, và ngược lại.
- Chủ nhà có thể sửa/gán lại từng phím sau này.

### 7.3 Để điều khiển bằng giọng nói

Mỗi nút có `action` chuẩn (POWER, VOL_UP, VOL_DOWN, MUTE, CH_UP…) để NLP hiểu. Nút tuỳ ý ("Chế độ phim") thì chủ nhà đặt **từ khoá giọng nói** (`voiceAliases`). NLP tra bảng này theo từng nhà.

### 7.4 Nhiều bước (tuỳ chọn)

Ghép nhiều nút thành một lệnh (macro) có độ trễ giữa các bước. VD "Mở YouTube" = Home → … → OK.

### 7.5 Điều hòa chưa hỗ trợ

Điều hòa gửi **cả trạng thái** mỗi lần bấm nên không gán "từng nút" như Tivi được:

1. Ưu tiên **tự nhận hãng**: chủ nhà bấm 1 phím trên remote gốc → mạch thử giải mã bằng các protocol của IRac → khớp thì chuyển sang hỗ trợ đầy đủ.
2. Không khớp → remote ảo theo **"trạng thái"**: mỗi nút = 1 gói đã thu (VD "Bật 24°C lạnh", "Tắt", "25°C").
3. App báo rõ hạn chế: chỉ dùng được các trạng thái đã gán.

### 7.6 Chia sẻ về hệ thống (tuỳ chọn)

Hỏi *"Chia sẻ remote này để giúp nhà khác?"*, chỉ gửi khi chủ nhà đồng ý, Quản trị duyệt rồi mới đưa vào `ir_catalog`.

### 7.7 Khi không còn remote gốc (tuỳ chọn)

Thử mã tuần tự: app gửi lần lượt các mã phổ biến của hãng, chủ nhà bấm "Chạy rồi" khi thiết bị phản ứng.

---

## 8. Lỗi thiết bị và báo cho Quản trị

> IR chỉ truyền **một chiều**: ESP32 không biết thiết bị có nghe lệnh hay không. Nên lỗi do (1) mạch tự phát hiện, hoặc (2) **người dùng báo**.

| Mã lỗi | Tình huống | Cách phát hiện |
|---|---|---|
| `E_PROFILE_INVALID` | Dữ liệu thiết bị hỏng | Mạch kiểm tra khi lưu/nạp |
| `E_CMD_NOT_FOUND` | Thiết bị chưa có lệnh được yêu cầu | Tra bảng lệnh |
| `E_IR_SEND_FAIL` | Lỗi khi phát | Thư viện báo lỗi |
| `E_USER_REPORTED` | Người dùng bấm "Thiết bị không phản hồi" | Nút trong app |
| `E_LEARN_FAIL` | Gán phím thất bại nhiều lần | Bộ đếm |
| `E_LOW_BATTERY` | Pin yếu ảnh hưởng hoạt động | Đo pin |

```
Phát sinh lỗi ở thiết bị X
  → Mạch ghi log (giờ, mã lỗi, thiết bị, firmware)
  → Lặp lại ≥ 3 lần trong 24h, hoặc người dùng báo:
       • Đánh dấu thiết bị X "Có vấn đề" trên app chủ nhà
       • Gửi vào bảng error_reports (Supabase)
  → Supabase thông báo Quản trị (Database Webhook / Edge Function)
  → Quản trị sửa danh mục → cập nhật cho mọi nhà
```

- Lỗi một thiết bị **không ảnh hưởng thiết bị khác**.
- Mất mạng: lưu tối đa 50 bản ghi (ghi vòng), **gửi bù** khi có mạng.
- Chống spam: cùng lỗi + cùng thiết bị chỉ gửi 1 lần/giờ.
- Báo cáo **không chứa** tên WiFi, mật khẩu, thông tin cá nhân.
- Thông báo chủ nhà dễ hiểu, VD: *"Tivi phòng khách có thể chưa đúng mã. Thử mã khác hoặc tạo remote ảo bằng remote gốc?"*

---

## 9. Mạng nhà lỗi

### 9.1 Khi mất kết nối thì làm được gì

| Tình huống | Điều khiển bằng app | Mạch |
|---|---|---|
| Bình thường | ✅ | Online |
| Mất Internet / Supabase lỗi (còn WiFi nhà) | ❌ | Báo "Mất Internet"; học lệnh bằng nút vẫn được, mã giữ lại gửi bù |
| Mất WiFi hoàn toàn | ❌ | Báo "Mất WiFi", tự nối lại |

Mạch không có nút điều khiển thiết bị, nên mất Internet thì không điều khiển được. Mạch hiện trạng thái trên OLED/LED để chủ nhà biết đang mất kết nối.

### 9.2 Các sự cố và cách xử lý

| # | Sự cố | Xử lý |
|---|---|---|
| A | **Mất Internet, còn WiFi** | Mạch giữ kết nối WiFi, thử nối lại Supabase theo kiểu tăng dần khoảng chờ. App báo "Mạch đang offline" (server thấy `boards.last_seen_at` quá hạn). Lỗi ghi tạm, gửi bù khi có lại |
| B | **Mất WiFi hoàn toàn** | Thử nối lại tăng dần (2s→4s→8s…→60s). Router sống lại thì tự nối, **không cần thao tác** |
| C | **Chập chờn** | App timeout 3 giây, gọi lại server với cùng `clientRequestId` (server gửi lại cùng `commandId`). Mạch gửi RSSI, tín hiệu yếu → app khuyên dời mạch gần router |
| D | **Đổi mật khẩu / đổi router** | Lưu tối đa 3 mạng WiFi. Không nối được mạng nào > 5 phút → bật **WiFi riêng + trang cài đặt WiFi** (chỉ để nhập WiFi, **không dùng để điều khiển**). Cũng vào được bằng cách giữ nút 10 giây |
| E | **WebSocket đứt giữa chừng** | Kết nối lại với khoảng chờ tăng dần + ngẫu nhiên (tránh nhiều mạch cùng thử lại một lúc). Xong thì vào lại kênh, kiểm tra `profile_version`, gửi bù lỗi tồn đọng |
| F | **Heartbeat không có trả lời** | Coi như đứt, làm như E |
| G | **Supabase bảo trì / project bị tạm dừng** | Giống A. App báo "Hệ thống đang bảo trì" |
| H | **Pin cạn** | Báo trước ở ≤5%, khi tắt thì server thấy mạch ngừng báo trạng thái → offline |

### 9.3 Chỉ báo trạng thái

| Trạng thái | LED | OLED (khi sáng) |
|---|---|---|
| Online (Supabase) | 🟢 Xanh lá, nháy ngắn mỗi 3 giây | "Online" |
| Có WiFi, mất Internet | 🟡 Vàng, nháy chậm | "Mất Internet" |
| Mất WiFi | 🔴 Đỏ, nháy nhanh | "Mất WiFi" |
| Đang ở chế độ cài đặt | 🔵 Xanh dương, 2 nháy liên tục | Tên + mật khẩu WiFi riêng + mã ghép đôi |
| Đang học lệnh | 🟣 Tím, nháy đều | "Bấm phím trên remote" |
| Pin yếu (khi online) | 🔴 Đỏ, 3 nháy ngắn | "Pin xx%" |

---

## 10. Bảo mật

### 10.1 Nên làm ngay hay để sau?

**Khuyến nghị: làm phần cơ bản ngay trong đợt này, phần nâng cao để đợt sau.** Lý do: phần cơ bản chủ yếu là **cấu hình Supabase và cách thiết kế dữ liệu** (ai thuộc nhà nào, mạch thuộc nhà nào). Làm sau thì phải sửa lại cấu trúc bảng và đồng bộ lại tất cả, rất tốn.

| | Làm ngay (đợt này) | Để đợt sau |
|---|---|---|
| **Đăng nhập** | Người dùng đăng nhập bằng Zalo; Edge Function xác minh token Zalo rồi cấp JWT Supabase | Xác thực 2 lớp (2FA) |
| **Phân quyền** | `home_members`: owner/member; **RLS** để mỗi người chỉ thấy dữ liệu nhà mình; Edge Function kiểm tra quyền ở **mỗi lệnh**; bảng `commands` ghi `user_id` | Quyền chi tiết từng thiết bị (VD chặn trẻ em), màn hình lịch sử "ai điều khiển gì" |
| **Ghép đôi mạch** | Mã 6 số hiện trên OLED, dùng 1 lần, hết hạn 10 phút, giới hạn số lần nhập sai. Mã chỉ hiện trên OLED của mạch (chứng minh có mạch trong tay): tự hiện khi mạch chưa ghép đôi, hoặc giữ nút 10 giây | Gỡ ghép từ xa kèm xác nhận, chuyển nhượng mạch |
| **Danh tính mạch** | Mỗi mạch **một token riêng**, chỉ có quyền với kênh của nhà mình (RLS). **Tuyệt đối không dùng `service_role` key trong firmware** | Thu hồi/xoay vòng token định kỳ |
| **Kênh Realtime** | Kênh riêng tư + RLS. Kênh `board:<boardId>`: chỉ mạch đó nghe, chỉ server gửi. Kênh `home:<homeId>`: chỉ thành viên nhà nghe, chỉ server gửi. Người dùng **không** gửi được vào kênh nào | Phát hiện bất thường (nhiều lệnh lạ) |
| **Chống lệnh cũ/lặp** | `expiresAt` + `commandId` + giờ NTP (đã có ở 4.1) | |
| **Chống spam lệnh** | Mạch giới hạn tốc độ lệnh (VD tối đa vài lệnh mỗi giây) để bảo vệ IR và pin; server giới hạn theo người và theo mạch | |
| **Đường truyền** | TLS bật, **kiểm tra chứng chỉ** (nạp CA gốc/bộ CA, không dùng `setInsecure()`) | Ghim chứng chỉ (certificate pinning) |
| **Dữ liệu trên mạch** | Không ghi mật khẩu WiFi/token ra log; WiFi riêng dùng **mật khẩu ngẫu nhiên sinh mới mỗi lần** bật chế độ cài đặt, chỉ hiện trên OLED (phải đứng trước mạch mới nối được) | Mã hoá flash |
| **Cập nhật firmware** | Cập nhật bằng cách nạp lại, hoặc OTA chỉ khi đã ghép đôi | OTA có **ký số**, Secure Boot, Flash Encryption (khó hoàn tác, nên làm khi firmware đã ổn định) |

### 10.2 Quy trình ghép đôi

```
1. Chủ nhà đăng nhập app (Zalo) → tạo "nhà" (hoặc chọn nhà đã có để ghép thêm mạch)
2. Mạch mới tự vào chế độ cài đặt (hoặc giữ nút 10 giây) → mạch bật WiFi riêng, OLED hiện tên + mật khẩu WiFi riêng (ngẫu nhiên) và mã 6 số
3. Điện thoại nối WiFi mạch → nhập WiFi nhà → mạch nối Internet và đăng ký chờ ghép
4. Chủ nhà nhập mã 6 số vào app → Edge Function ghép mạch với nhà → cấp token riêng cho mạch
5. Mạch lưu token vào NVS, từ đó kết nối Supabase bằng token này
```

- Một mạch chỉ thuộc **một nhà**; một nhà có thể có **nhiều mạch** (mục 4.4). Mạch đã ghép thì **không** ghép được lần nữa nếu chưa được reset.
- Reset (giữ nút 20 giây) xoá token và WiFi. Nhà cũ cũng phải gỡ mạch trên app.

### 10.3 Phần bảo mật còn lại (cần biết)

- Ai **đứng cạnh mạch** có thể giữ nút để học lệnh (chỉ tạo "mã chờ gán", chủ nhà phải duyệt trong app) hoặc reset mạch. Chấp nhận được vì cần có mặt trong nhà.
- **Nhận diện giọng nói của từng người** không nằm trong phạm vi (người trong phòng nói thì app vẫn nghe). Phân quyền thành viên (đợt sau) mới ngăn được người đã đăng nhập.
- Điểm yếu lớn nhất của kiến trúc này là **cấu hình RLS sai**. Cần test kỹ (xem 12).

---

## 11. Cấu trúc firmware và bộ nhớ

```
firmware/
├── main              # setup + vòng lặp chính
├── power_manager     # tiết kiệm pin, bật/tắt ngoại vi, đo pin, nhận biết cắm sạc
├── wifi_manager      # nối lại, nhiều mạng, WiFi riêng + trang cài đặt WiFi
├── realtime_client   # WebSocket tới Supabase, heartbeat, nghe kênh riêng của mạch (nhận lệnh từ server)
├── provisioning      # ghép đôi, lưu/xoá token
├── ir_sender         # phát IR (IRsend + IRac)
├── ir_learner        # thu IR, giải mã, so 2 lần
├── device_store      # lưu thiết bị/remote vào LittleFS, đồng bộ profile_version
├── error_reporter    # log lỗi, hàng đợi gửi bù
├── buttons           # 1 nút: học lệnh, cài đặt, reset
├── display_oled
└── audio_player      # điều khiển DFPlayer qua UART
```

| Dữ liệu | Lưu ở |
|---|---|
| WiFi (≤3 mạng), token mạch, id mạch | NVS |
| Thiết bị + mã lệnh + remote ảo | LittleFS (JSON, giữ bản sao lưu cũ) |
| Trạng thái điều hòa gần nhất | NVS |
| Log lỗi chưa gửi (≤50) | LittleFS (ghi vòng) |
| Danh sách `commandId` vừa xử lý | RAM |

---

## 12. Tiêu chí nghiệm thu

| # | Tiêu chí | Cách kiểm tra |
|---|---|---|
| 1 | Lệnh tới khi phát IR **≤ 2 giây** (chạy pin), **≤ 1 giây** (cắm sạc) | Đo thời gian |
| 2 | Thời lượng pin đạt mục tiêu (đặt sau khi đo Giai đoạn 1) | Đo dòng/pin chạy thật |
| 3 | Kết nối giữ ổn định ≥ 48 giờ, heartbeat không bị server cắt | Chạy liên tục |
| 4 | Remote ảo cho 1 thiết bị chưa có trong danh mục, mọi nút gán đều chạy | Thử ≥ 3 hãng |
| 5 | Điều khiển nút ảo bằng giọng nói qua `voiceAliases` | Thử câu thật |
| 6 | Lệnh quá hạn bị bỏ, lệnh trùng không phát hai lần | Gửi trễ / gửi lặp |
| 7 | Mất Internet: OLED/LED báo đúng trạng thái; mã học bằng nút lúc offline được gửi bù khi có mạng | Rút dây WAN |
| 8 | Tắt/bật router: mạch tự nối lại, không cần thao tác | Rút nguồn router |
| 9 | Lỗi một thiết bị không ảnh hưởng thiết bị khác | Xoá lệnh của 1 thiết bị |
| 10 | Lỗi lúc offline được gửi bù, Quản trị nhận thông báo | Test offline → online |
| 11 | **Người dùng nhà A không đọc/gửi được lệnh vào nhà B** | Test RLS bằng 2 tài khoản |
| 12 | **Token mạch nhà A không dùng được cho kênh nhà B** | Dùng token sai kênh |
| 13 | Mã ghép đôi hết hạn / sai quá số lần thì bị khoá; mạch đã ghép không bị ghép lại | Test thủ công |
| 14 | Pin ≤10% tắt OLED/loa, ≤5% báo sắp hết pin | Xả pin thử |
| 15 | Khởi động lại vẫn giữ WiFi, token, thiết bị, remote ảo | Cắt/cấp điện |
| 16 | Nhà có 2 mạch: lệnh cho thiết bị mạch A chỉ mạch A phát; sửa thiết bị mạch A không bắt mạch B tải lại profile | 2 mạch, 1 nhà |
| 17 | 2 người cùng điều khiển 1 điều hòa: trạng thái cuối cùng đúng với lệnh sau cùng, cả 2 app hiện giống nhau | 2 điện thoại |
| 18 | Thành viên bị gỡ khỏi nhà: lệnh tiếp theo bị từ chối ngay | Gỡ rồi gửi lệnh |
| 19 | Người dùng không gửi/nghe được kênh `board:<boardId>`, kể cả của nhà mình | Thử bằng JWT người dùng |

## 13. Lộ trình gợi ý

1. **Tuần 1 (thử nghiệm rủi ro):** ESP32 chạy WebSocket tới Supabase Realtime + heartbeat + Giai đoạn 1 tiết kiệm pin, đo dòng. Thử cầu nối đăng nhập Zalo → JWT Supabase.
2. **Tuần 2:** Phát IR Tivi/Điều hòa + nhận lệnh qua Supabase (ACK, chống trùng, hạn dùng, NTP).
3. **Tuần 3:** Phần cứng pin + sạc + âm thanh (DFPlayer), tắt/bật ngoại vi, đo thời lượng pin.
4. **Tuần 4:** Remote ảo: mắt thu, gán phím, đồng bộ, voiceAliases.
5. **Tuần 5:** Bảo mật cơ bản (ghép đôi, RLS, token mạch), WiFi manager, nút (học lệnh / cài đặt / reset).
6. **Tuần 6:** Báo lỗi + thông báo Quản trị, import danh mục lớn, test tổng. Làm Giai đoạn 2 tiết kiệm pin nếu mục tiêu chưa đạt.

## 14. Câu hỏi còn mở

1. Mục tiêu thời lượng pin là bao nhiêu ngày? (quyết định có cần Giai đoạn 2 hoặc đổi board ESP32 không)
2. Chấp nhận cầu nối đăng nhập **Zalo → Edge Function → JWT Supabase** không? (cần thiết kế sớm, vì Zalo không đăng nhập thẳng vào Supabase)
3. Quản trị nhận báo lỗi qua kênh nào? (email, dashboard, tin nhắn Zalo OA…)
4. Chia sẻ remote ảo lên danh mục chung: chỉ khi chủ nhà đồng ý? (đề xuất: đúng như vậy)
5. Giấy phép dữ liệu IR: đồ án có công khai/thương mại hoá không?
6. ~~Nút 1, Nút 2 mặc định gán Tivi/Điều hòa?~~ Đã chốt: chỉ 1 nút, không có nút nhanh (mục 3.3).
