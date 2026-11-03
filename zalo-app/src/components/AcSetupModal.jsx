import React, { useEffect, useRef, useState } from 'react';
import {
  AC_PROTOCOL_META,
  DEFAULT_AC_PROTOCOLS,
  acSetupErrorText,
  cancelLearn,
  detectAcProtocol,
  fetchBoardProfile,
  getAcProtocolLabel,
  saveAcProtocol,
  tryAcProtocol,
} from '../services/profileSetupService';

const DETECT_HINTS = {
  waiting: 'Hướng remote điều hòa âm trần vào mắt thu trên mạch ESP32 rồi bấm nút Nguồn ON/OFF (hoặc Tăng/Giảm nhiệt độ).',
  first_captured: 'Đã thu lần 1 — bấm lại đúng nút đó thêm 1 lần nữa để xác nhận giao thức.',
  mismatch: 'Hai lần bấm khác nhau — vui lòng bấm lại cùng 1 nút.',
};

/**
 * Chọn giao thức điều hòa âm trần / treo tường: tự nhận từ remote thật, hoặc thử lần lượt rồi chọn.
 * Props: acDevice { id, name }, acState { temp, mode, fan }, initialProtocol, onClose(), onSaved(protocol), onNotify(msg)
 */
export default function AcSetupModal({ acDevice, acState, initialProtocol, onClose, onSaved, onNotify }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [current, setCurrent] = useState(initialProtocol || 'DAIKIN64');
  const [candidates, setCandidates] = useState(DEFAULT_AC_PROTOCOLS);
  const [onlyCeiling, setOnlyCeiling] = useState(false);
  const [busy, setBusy] = useState(null); // 'detect' | 'try:<p>' | 'save:<p>'
  const [detectHint, setDetectHint] = useState(null);
  const [detectResult, setDetectResult] = useState(null);
  const detectingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchBoardProfile().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError(acSetupErrorText(res.error));
        return;
      }
      const ac = res.devices.find((d) => d.id === acDevice.id || d.type === 'ac');
      if (ac?.acProtocol) setCurrent(ac.acProtocol);
      const merged = Array.from(new Set([...DEFAULT_AC_PROTOCOLS, ...(res.acProtocols || [])]));
      setCandidates(merged);
    });
    return () => {
      alive = false;
      if (detectingRef.current) cancelLearn();
    };
  }, [acDevice.id]);

  const save = async (protocol) => {
    setBusy(`save:${protocol}`);
    const res = await saveAcProtocol({ deviceId: acDevice.id, protocol, name: acDevice.name });
    setBusy(null);
    if (!res.ok) {
      // Nếu mạch tạm thời offline/timeout, vẫn cho lưu trên App để gửi kèm params.protocol khi mạch online
      if (res.error === 'E_TIMEOUT' || res.error === 'E_NOT_CONFIGURED') {
        setCurrent(protocol);
        onSaved(protocol);
        onNotify(`✅ Đã chọn ${protocol} trên ứng dụng (sẽ tự áp dụng khi mạch ESP32 trực tuyến)`);
        return true;
      }
      onNotify(`❌ ${acSetupErrorText(res.error)}`);
      return false;
    }
    setCurrent(protocol);
    onSaved(protocol);
    onNotify(`✅ Đã lưu giao thức ${protocol} xuống mạch cho ${acDevice.name}`);
    return true;
  };

  const tryProtocol = async (protocol) => {
    setBusy(`try:${protocol}`);
    const res = await tryAcProtocol({ protocol, power: true, ...acState });
    setBusy(null);
    onNotify(
      res.ok
        ? `📡 Đã phát thử ${protocol} — điều hòa âm trần có kêu "bíp" hoặc sáng đèn nhận lệnh không?`
        : `❌ ${acSetupErrorText(res.error)}`
    );
  };

  const detect = async () => {
    setBusy('detect');
    setDetectResult(null);
    setDetectHint(DETECT_HINTS.waiting);
    detectingRef.current = true;
    const res = await detectAcProtocol({ onProgress: (status) => setDetectHint(DETECT_HINTS[status] || null) });
    detectingRef.current = false;
    setDetectHint(null);
    setBusy(null);
    if (!res.ok) {
      setDetectResult({ error: acSetupErrorText(res.error) });
      return;
    }
    setDetectResult(res);
    if (res.acSupported) await save(res.detected);
  };

  const stopDetect = () => {
    cancelLearn();
    detectingRef.current = false;
    setDetectHint(null);
    setBusy(null);
  };

  const isBusy = busy !== null;
  const visibleCandidates = onlyCeiling
    ? candidates.filter((p) => AC_PROTOCOL_META[p]?.ceiling)
    : candidates;

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div className="modal-title-group">
            <h3 className="modal-main-title">Giao thức Điều hòa Âm trần</h3>
            <p className="modal-sub-desc">
              {acDevice.name} • Đang chọn: <strong>{loading ? `${current} (...)` : current || 'DAIKIN64'}</strong>
            </p>
          </div>
          <button type="button" className="modal-close-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-form-body">
          {loadError && (
            <p className="ac-setup-hint">
              ⚠️ {loadError}. Bạn vẫn có thể chọn trước giao thức điều hòa âm trần bên dưới (mặc định{' '}
              <strong>DAIKIN64</strong> cho remote <strong>BRC52A62</strong>).
            </p>
          )}

          <div className="ac-setup-block">
            <span className="input-micro-label">Cách 1 — Tự nhận giao thức từ remote điều hòa âm trần</span>
            {busy === 'detect' ? (
              <>
                <p className="ac-setup-hint">{detectHint}</p>
                <button type="button" className="ac-setup-secondary-btn" onClick={stopDetect}>Huỷ</button>
              </>
            ) : (
              <button type="button" className="form-action-btn full-width" disabled={isBusy || !!loadError} onClick={detect}>
                📡 Quét giao thức từ Remote thật
              </button>
            )}
            {detectResult?.error && <p className="ac-setup-error">{detectResult.error}</p>}
            {detectResult?.ok && detectResult.acSupported && (
              <p className="ac-setup-hint">
                ✅ Đã nhận diện và lưu giao thức: <strong>{detectResult.detected}</strong> ({getAcProtocolLabel(detectResult.detected)})
              </p>
            )}
            {detectResult?.ok && !detectResult.acSupported && (
              <p className="ac-setup-hint">
                Mạch nhận ra <strong>{detectResult.detected}</strong> nhưng không điều khiển điều hòa bằng giao thức này
                được. Hãy thử Cách 2 bên dưới.
              </p>
            )}
          </div>

          <div className="ac-setup-block">
            <div className="ac-setup-filter-row">
              <span className="input-micro-label">Cách 2 — Bấm Thử từng giao thức, máy kêu "bíp" thì bấm Dùng</span>
              <button
                type="button"
                className={`ac-filter-chip-btn ${onlyCeiling ? 'active' : ''}`}
                onClick={() => setOnlyCeiling((v) => !v)}
              >
                {onlyCeiling ? '✓ Chỉ dòng Âm trần' : 'Lọc Âm trần'}
              </button>
            </div>
            <ul className="ac-setup-list">
              {visibleCandidates.map((protocol) => {
                const meta = AC_PROTOCOL_META[protocol];
                return (
                  <li key={protocol} className={`ac-setup-row ${protocol === current ? 'current' : ''}`}>
                    <div className="ac-setup-name-col">
                      <div className="ac-setup-code-row">
                        <span className="ac-setup-name">{protocol}</span>
                        {meta?.ceiling && <span className="ac-proto-tag ceiling">Âm trần</span>}
                        {meta?.togglePower && <span className="ac-proto-tag toggle">Toggle nguồn</span>}
                      </div>
                      {meta?.label && <span className="ac-setup-status">{meta.label}</span>}
                    </div>
                    <button
                      type="button"
                      className="ac-setup-secondary-btn"
                      disabled={isBusy || !!loadError}
                      onClick={() => tryProtocol(protocol)}
                    >
                      {busy === `try:${protocol}` ? '...' : 'Thử'}
                    </button>
                    <button
                      type="button"
                      className="ac-setup-primary-btn"
                      disabled={isBusy || protocol === current}
                      onClick={() => save(protocol)}
                    >
                      {protocol === current ? 'Đang dùng' : busy === `save:${protocol}` ? '...' : 'Dùng'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
