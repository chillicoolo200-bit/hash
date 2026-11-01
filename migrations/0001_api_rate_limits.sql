CREATE TABLE IF NOT EXISTS api_rate_limits (
  route TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count >= 1),
  PRIMARY KEY (route, ip_hash, window_start)
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits (window_start);