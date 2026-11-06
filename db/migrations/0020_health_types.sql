-- Which Health types a person's iPhone has given data for, the one a run is trying, and any turned off because a run stopped there.
ALTER TABLE health_users ADD COLUMN health_types TEXT;
