ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id text REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_status text NOT NULL DEFAULT 'active' CHECK(creator_status IN('active','suspended','blocked'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_started' CHECK(kyc_status IN('not_started','pending','approved','rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawals_suspended boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users(lower(referral_code)) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS creator_levels (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  min_monthly_revenue_cents bigint NOT NULL CHECK(min_monthly_revenue_cents>=0),
  max_monthly_revenue_cents bigint CHECK(max_monthly_revenue_cents IS NULL OR max_monthly_revenue_cents>=min_monthly_revenue_cents),
  commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
  color text NOT NULL DEFAULT '#63c7ff',
  sort_order integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO creator_levels(id,name,min_monthly_revenue_cents,max_monthly_revenue_cents,commission_bps,color,sort_order) VALUES
 ('beginner','Iniciante',0,49999,2000,'#91a5bc',1),
 ('creator','Creator',50000,199999,2500,'#19a7ff',2),
 ('pro','Pro',200000,999999,3000,'#bc98ff',3),
 ('elite','Elite',1000000,NULL,3500,'#ffb649',4)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id text PRIMARY KEY REFERENCES users(id),
  level_id text NOT NULL DEFAULT 'beginner' REFERENCES creator_levels(id),
  month_key text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'),
  monthly_revenue_cents bigint NOT NULL DEFAULT 0,
  total_revenue_cents bigint NOT NULL DEFAULT 0,
  total_commission_cents bigint NOT NULL DEFAULT 0,
  public_ranking boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_clicks (
  id text PRIMARY KEY,
  creator_user_id text NOT NULL REFERENCES users(id),
  referral_code text NOT NULL,
  tracking_token_hash text NOT NULL UNIQUE,
  ip_hash text,
  user_agent_hash text,
  landing_path text,
  expires_at timestamptz NOT NULL,
  claimed_by_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_clicks_creator_time ON referral_clicks(creator_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id text PRIMARY KEY,
  referrer_user_id text NOT NULL REFERENCES users(id),
  referred_user_id text NOT NULL UNIQUE REFERENCES users(id),
  click_id text REFERENCES referral_clicks(id),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  commission_expires_at timestamptz NOT NULL,
  CHECK(referrer_user_id<>referred_user_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_time ON referrals(referrer_user_id,attributed_at DESC);

CREATE TABLE IF NOT EXISTS purchase_types (
  id text PRIMARY KEY,
  name text NOT NULL,
  commission_eligible boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO purchase_types(id,name,commission_eligible) VALUES('score_participation','Participação no placar',true) ON CONFLICT(id) DO NOTHING;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purchase_type_id text REFERENCES purchase_types(id) DEFAULT 'score_participation';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_live boolean NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_tax_number_ciphertext text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS request_ip_hash text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0 CHECK(risk_score BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS commissions (
  id text PRIMARY KEY,
  transaction_id text NOT NULL UNIQUE REFERENCES transactions(id),
  creator_user_id text NOT NULL REFERENCES users(id),
  referred_user_id text NOT NULL REFERENCES users(id),
  level_id text NOT NULL REFERENCES creator_levels(id),
  eligible_amount_cents bigint NOT NULL CHECK(eligible_amount_cents>=0),
  commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
  amount_cents bigint NOT NULL CHECK(amount_cents>=0),
  status text NOT NULL CHECK(status IN('pending','available','blocked','cancelled','reversed','paid')),
  available_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commissions_creator_status ON commissions(creator_user_id,status,available_at);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  account text NOT NULL CHECK(account IN('pending','available','blocked','withdrawal_pending','internal_credit','paid')),
  entry_type text NOT NULL CHECK(entry_type IN('commission','release','withdrawal_request','withdrawal_complete','withdrawal_failed','refund','chargeback','customer_bonus','admin_adjustment','challenge_bonus')),
  amount_cents bigint NOT NULL CHECK(amount_cents<>0),
  currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),
  source_type text NOT NULL,
  source_id text NOT NULL,
  group_id text NOT NULL,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,account,entry_type,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_time ON wallet_ledger(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  pix_key_type text NOT NULL CHECK(pix_key_type IN('cpf','cnpj','email','phone','random')),
  pix_key_ciphertext text NOT NULL,
  pix_key_last4 text NOT NULL,
  recipient_tax_number_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','paid','failed','cancelled')),
  idempotency_key text NOT NULL,
  provider_id text UNIQUE,
  provider_payload jsonb,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS withdrawals_user_time ON withdrawals(user_id,requested_at DESC);

CREATE TABLE IF NOT EXISTS creator_challenges (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  metric text NOT NULL CHECK(metric IN('clicks','signups','buyers','revenue')),
  target bigint NOT NULL CHECK(target>0),
  reward_cents bigint NOT NULL DEFAULT 0 CHECK(reward_cents>=0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS creator_challenge_progress (
  challenge_id text NOT NULL REFERENCES creator_challenges(id),
  user_id text NOT NULL REFERENCES users(id),
  progress bigint NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(challenge_id,user_id)
);

CREATE TABLE IF NOT EXISTS creator_notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  source_type text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_notifications_user ON creator_notifications(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id),
  related_user_id text REFERENCES users(id),
  transaction_id text REFERENCES transactions(id),
  signal text NOT NULL,
  risk_score integer NOT NULL CHECK(risk_score BETWEEN 0 AND 100),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewed','dismissed','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_user_id text REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS fraud_flags_open ON fraud_flags(status,risk_score DESC,created_at DESC);

CREATE TABLE IF NOT EXISTS creator_daily_stats (
  user_id text NOT NULL REFERENCES users(id),
  stat_date date NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  signups integer NOT NULL DEFAULT 0,
  buyers integer NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  commission_cents bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,stat_date)
);

CREATE OR REPLACE VIEW wallet_balances AS
 SELECT user_id,
  COALESCE(sum(amount_cents) FILTER(WHERE account='pending'),0) AS pending_cents,
  COALESCE(sum(amount_cents) FILTER(WHERE account='available'),0) AS available_cents,
  COALESCE(sum(amount_cents) FILTER(WHERE account='blocked'),0) AS blocked_cents,
  COALESCE(sum(amount_cents) FILTER(WHERE account='withdrawal_pending'),0) AS withdrawal_pending_cents,
  COALESCE(sum(amount_cents) FILTER(WHERE account='internal_credit'),0) AS internal_credit_cents,
  COALESCE(sum(amount_cents) FILTER(WHERE account='paid'),0) AS paid_cents
 FROM wallet_ledger GROUP BY user_id;

DROP TRIGGER IF EXISTS immutable_wallet_ledger ON wallet_ledger;
CREATE TRIGGER immutable_wallet_ledger BEFORE UPDATE OR DELETE ON wallet_ledger FOR EACH ROW EXECUTE FUNCTION protect_immutable_log();
DROP TRIGGER IF EXISTS immutable_referrals ON referrals;
CREATE TRIGGER immutable_referrals BEFORE UPDATE OR DELETE ON referrals FOR EACH ROW EXECUTE FUNCTION protect_immutable_log();

ALTER TABLE creator_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_daily_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE candidate_scores; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE creator_notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON creator_levels,creator_profiles,referral_clicks,referrals,purchase_types,commissions,wallet_ledger,withdrawals,creator_challenges,creator_challenge_progress,creator_notifications,fraud_flags,creator_daily_stats,wallet_balances FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON creator_levels,creator_profiles,referral_clicks,referrals,purchase_types,commissions,wallet_ledger,withdrawals,creator_challenges,creator_challenge_progress,creator_notifications,fraud_flags,creator_daily_stats,wallet_balances FROM authenticated;
 END IF;
END $$;
