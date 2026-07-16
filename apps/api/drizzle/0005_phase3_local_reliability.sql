ALTER TABLE `build_artifacts`
  ADD UNIQUE KEY `build_artifacts_site_identity_uq` (`artifact_id`, `site_id`);

ALTER TABLE `deployments`
  DROP CHECK `deployments_status_ck`,
  DROP INDEX `deployments_site_idempotency_uq`,
  ADD COLUMN `target_artifact_id` varchar(110) NULL AFTER `artifact_id`,
  ADD COLUMN `kind` varchar(20) NOT NULL DEFAULT 'publish' AFTER `target_artifact_id`,
  ADD COLUMN `attempt_count` int unsigned NOT NULL DEFAULT 0 AFTER `error_summary`,
  ADD COLUMN `max_attempts` int unsigned NOT NULL DEFAULT 3 AFTER `attempt_count`,
  ADD COLUMN `next_attempt_at` timestamp NULL AFTER `max_attempts`,
  ADD COLUMN `last_error_code` varchar(80) NULL AFTER `next_attempt_at`,
  ADD COLUMN `last_error_class` varchar(20) NULL AFTER `last_error_code`,
  ADD UNIQUE KEY `deployments_site_kind_idempotency_uq` (`site_id`, `kind`, `idempotency_key`),
  ADD UNIQUE KEY `deployments_identity_uq` (`deployment_id`, `site_id`),
  ADD CONSTRAINT `deployments_target_artifact_identity_fk`
    FOREIGN KEY (`target_artifact_id`, `site_id`, `revision`)
    REFERENCES `build_artifacts` (`artifact_id`, `site_id`, `revision`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `deployments_kind_ck` CHECK (`kind` IN ('publish', 'rollback')),
  ADD CONSTRAINT `deployments_status_ck`
    CHECK (`status` IN ('queued', 'building', 'deploying', 'retry_waiting', 'healthy', 'failed')),
  ADD CONSTRAINT `deployments_attempts_ck` CHECK (`attempt_count` <= `max_attempts`),
  ADD CONSTRAINT `deployments_error_class_ck`
    CHECK (`last_error_class` IS NULL OR `last_error_class` IN ('transient', 'permanent', 'concurrency'));

CREATE TABLE `site_preview_states` (
  `site_id` varchar(80) NOT NULL,
  `environment` varchar(20) NOT NULL DEFAULT 'preview',
  `active_artifact_id` varchar(110) NOT NULL,
  `active_deployment_id` varchar(110) NOT NULL,
  `preview_url` varchar(2048) NOT NULL,
  `version` bigint unsigned NOT NULL DEFAULT 1,
  `activated_at` timestamp NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `site_preview_states_identity_uq` (`site_id`, `environment`),
  CONSTRAINT `site_preview_states_site_fk`
    FOREIGN KEY (`site_id`) REFERENCES `sites` (`site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `site_preview_states_artifact_fk`
    FOREIGN KEY (`active_artifact_id`, `site_id`)
    REFERENCES `build_artifacts` (`artifact_id`, `site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `site_preview_states_deployment_fk`
    FOREIGN KEY (`active_deployment_id`, `site_id`)
    REFERENCES `deployments` (`deployment_id`, `site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `site_preview_states_environment_ck` CHECK (`environment` = 'preview')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `deployment_events` (
  `event_id` varchar(140) NOT NULL,
  `deployment_id` varchar(110) NOT NULL,
  `site_id` varchar(80) NOT NULL,
  `attempt` int unsigned NOT NULL,
  `sequence` int unsigned NOT NULL,
  `stage` varchar(80) NOT NULL,
  `level` varchar(20) NOT NULL,
  `code` varchar(80) NOT NULL,
  `message` varchar(500) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `deployment_events_order_uq` (`deployment_id`, `attempt`, `sequence`),
  KEY `deployment_events_site_created_idx` (`site_id`, `created_at`),
  CONSTRAINT `deployment_events_deployment_fk`
    FOREIGN KEY (`deployment_id`, `site_id`)
    REFERENCES `deployments` (`deployment_id`, `site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `deployment_events_level_ck` CHECK (`level` IN ('info', 'warn', 'error'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
