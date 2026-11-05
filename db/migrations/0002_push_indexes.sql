CREATE INDEX IF NOT EXISTS even_push_owner ON even_push_subscriptions(owner_email);
CREATE INDEX IF NOT EXISTS even_push_device ON even_push_subscriptions(device_id);
