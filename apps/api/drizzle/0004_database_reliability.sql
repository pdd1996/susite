ALTER TABLE `build_artifacts`
  ADD COLUMN `lease_token` bigint unsigned NOT NULL DEFAULT 0 AFTER `lease_expires_at`,
  ADD CONSTRAINT `build_artifacts_identity_uq`
    UNIQUE (`artifact_id`, `site_id`, `revision`);

ALTER TABLE `deployments`
  ADD COLUMN `lease_token` bigint unsigned NOT NULL DEFAULT 0 AFTER `lease_expires_at`,
  DROP FOREIGN KEY `deployments_artifact_fk`,
  ADD CONSTRAINT `deployments_artifact_identity_fk`
    FOREIGN KEY (`artifact_id`, `site_id`, `revision`)
    REFERENCES `build_artifacts` (`artifact_id`, `site_id`, `revision`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE `audit_logs`
  ADD INDEX `audit_logs_site_created_idx` (`site_id`, `created_at`);
