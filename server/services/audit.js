import crypto from "node:crypto";

function stringify(value) {
  if (!value || typeof value !== "object") return null;
  try { return JSON.stringify(value).slice(0, 8_000); } catch { return null; }
}

export function createAuditService(db) {
  const writeAudit = db.prepare("INSERT INTO audit_events (user_id, mobile_session_id, device_name, action, target, result, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const writeLog = db.prepare("INSERT INTO application_logs (service, level, message, metadata, request_id) VALUES (?, ?, ?, ?, ?)");
  const writeAlert = db.prepare("INSERT INTO alerts (id, type, severity, service, message, metadata) VALUES (?, ?, ?, ?, ?, ?)");

  function record({ userId = null, mobileSessionId = null, deviceName = null, action, target = null, result = "success", metadata = null }) {
    writeAudit.run(userId, mobileSessionId, deviceName, action, target, result, stringify(metadata));
  }

  function log({ service = "app", level = "INFO", message, metadata = null, requestId = null }) {
    writeLog.run(service, level, String(message).slice(0, 2_000), stringify(metadata), requestId);
  }

  function alert({ type, severity = "WARNING", service = "app", message, metadata = null }) {
    const id = crypto.randomUUID();
    writeAlert.run(id, type, severity, service, String(message).slice(0, 2_000), stringify(metadata));
    return id;
  }

  return { record, log, alert };
}
