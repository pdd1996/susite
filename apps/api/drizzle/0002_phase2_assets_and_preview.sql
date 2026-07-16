CREATE TABLE `assets` (
  `asset_id` varchar(110) NOT NULL,
  `site_id` varchar(80) NOT NULL,
  `type` varchar(40) NOT NULL,
  `status` varchar(20) NOT NULL,
  `source_kind` varchar(30) NOT NULL,
  `placeholder_approved_by` varchar(100),
  `placeholder_approved_at` timestamp NULL,
  `object_key` varchar(512) NOT NULL,
  `url` varchar(2048) NOT NULL,
  `content_type` varchar(100) NOT NULL,
  `size_bytes` bigint unsigned NOT NULL,
  `checksum_sha256` varchar(64) NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `created_by` varchar(100) NOT NULL,
  `verified_by` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `verified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `assets_pk` PRIMARY KEY (`asset_id`),
  CONSTRAINT `assets_object_key_uq` UNIQUE (`object_key`),
  CONSTRAINT `assets_site_fk` FOREIGN KEY (`site_id`) REFERENCES `sites` (`site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `assets_source_approval_ck` CHECK (
    (`source_kind` = 'customer_provided' AND `placeholder_approved_by` IS NULL AND `placeholder_approved_at` IS NULL)
    OR
    (
      `source_kind` = 'placeholder'
      AND (
        (`placeholder_approved_by` IS NULL AND `placeholder_approved_at` IS NULL)
        OR
        (`placeholder_approved_by` IS NOT NULL AND `placeholder_approved_at` IS NOT NULL)
      )
    )
  ),
  CONSTRAINT `assets_status_ck` CHECK (`status` = 'verified'),
  CONSTRAINT `assets_type_ck` CHECK (
    `type` IN ('logo', 'product_image', 'certificate_image', 'product_pdf', 'wechat_qr', 'factory_image')
  ),
  INDEX `assets_site_created_idx` (`site_id`, `created_at`)
);

CREATE TABLE `build_artifacts` (
  `artifact_id` varchar(110) NOT NULL,
  `site_id` varchar(80) NOT NULL,
  `revision` int NOT NULL,
  `template` varchar(80) NOT NULL,
  `template_version` varchar(40) NOT NULL,
  `input_checksum` varchar(64) NOT NULL,
  `location` varchar(512) NOT NULL,
  `created_by` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `build_artifacts_pk` PRIMARY KEY (`artifact_id`),
  CONSTRAINT `build_artifacts_site_fk` FOREIGN KEY (`site_id`) REFERENCES `sites` (`site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `build_artifacts_revision_fk` FOREIGN KEY (`site_id`, `revision`)
    REFERENCES `site_revisions` (`site_id`, `revision`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `build_artifacts_input_uq`
    UNIQUE (`site_id`, `revision`, `template_version`, `input_checksum`)
);

CREATE TABLE `deployments` (
  `deployment_id` varchar(110) NOT NULL,
  `job_id` varchar(110) NOT NULL,
  `site_id` varchar(80) NOT NULL,
  `revision` int NOT NULL,
  `artifact_id` varchar(110),
  `environment` varchar(20) NOT NULL,
  `idempotency_key` varchar(120) NOT NULL,
  `status` varchar(20) NOT NULL,
  `placeholder_asset_ids` json NOT NULL,
  `preview_url` varchar(2048),
  `error_summary` text,
  `created_by` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `deployments_pk` PRIMARY KEY (`deployment_id`),
  CONSTRAINT `deployments_job_id_uq` UNIQUE (`job_id`),
  CONSTRAINT `deployments_site_idempotency_uq` UNIQUE (`site_id`, `idempotency_key`),
  CONSTRAINT `deployments_site_fk` FOREIGN KEY (`site_id`) REFERENCES `sites` (`site_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `deployments_revision_fk` FOREIGN KEY (`site_id`, `revision`)
    REFERENCES `site_revisions` (`site_id`, `revision`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `deployments_artifact_fk` FOREIGN KEY (`artifact_id`) REFERENCES `build_artifacts` (`artifact_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `deployments_environment_ck` CHECK (`environment` = 'preview'),
  CONSTRAINT `deployments_status_ck` CHECK (`status` IN ('queued', 'building', 'deploying', 'healthy', 'failed')),
  INDEX `deployments_site_created_idx` (`site_id`, `created_at`)
);
