-- Record accepted and rejected authenticated Shortcut uploads for diagnostics.
-- last_used_at remains the timestamp of the last accepted data upload.
ALTER TABLE rt_devices ADD COLUMN last_attempt_at TEXT;
ALTER TABLE rt_devices ADD COLUMN last_error_code TEXT;
ALTER TABLE rt_devices ADD COLUMN shortcut_version TEXT;
