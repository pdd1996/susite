ALTER TABLE `build_artifacts`
  ADD COLUMN `status` varchar(20) NOT NULL DEFAULT 'ready' AFTER `location`,
  ADD COLUMN `lease_expires_at` timestamp NULL AFTER `status`,
  ADD CONSTRAINT `build_artifacts_status_ck` CHECK (`status` IN ('building', 'ready'));

ALTER TABLE `deployments`
  ADD COLUMN `lease_expires_at` timestamp NULL AFTER `error_summary`,
  ADD INDEX `deployments_claim_idx` (`status`, `lease_expires_at`, `created_at`);
