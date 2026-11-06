-- Events a person hid in the app. They stay in the account, so they can be shown again.
ALTER TABLE health_calendar_events ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
