-- A name typed into the look picker. Kept apart from the look so counts of choices never carry it.
ALTER TABLE health_users ADD COLUMN look_name TEXT;
