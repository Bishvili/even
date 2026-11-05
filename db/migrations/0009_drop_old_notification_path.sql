ALTER TABLE health_users DROP COLUMN mood_sync;
ALTER TABLE health_push_subscriptions DROP COLUMN times;
ALTER TABLE health_push_subscriptions DROP COLUMN last_sent_target;
ALTER TABLE health_push_subscriptions DROP COLUMN last_sent_day;
ALTER TABLE health_push_subscriptions DROP COLUMN bedtime_at;
ALTER TABLE health_push_subscriptions DROP COLUMN brief_at;
ALTER TABLE health_push_subscriptions DROP COLUMN hard_at;
ALTER TABLE health_push_subscriptions DROP COLUMN weekends;
