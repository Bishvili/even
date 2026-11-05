CREATE INDEX IF NOT EXISTS health_push_owner ON health_push_subscriptions(owner_email);
CREATE INDEX IF NOT EXISTS health_push_device ON health_push_subscriptions(device_id);
