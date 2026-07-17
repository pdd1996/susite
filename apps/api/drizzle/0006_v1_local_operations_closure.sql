ALTER TABLE `site_revisions`
  ADD COLUMN `content_status` varchar(30) NOT NULL DEFAULT 'draft' AFTER `config`,
  ADD CONSTRAINT `site_revisions_content_status_ck`
    CHECK (`content_status` IN ('draft', 'review_requested', 'approved', 'archived'));

ALTER TABLE `deployments`
  ADD UNIQUE KEY `deployments_review_identity_uq` (`deployment_id`, `site_id`, `revision`);

CREATE TABLE `review_records` (
  `review_id` varchar(110) NOT NULL,
  `site_id` varchar(80) NOT NULL,
  `revision` int NOT NULL,
  `deployment_id` varchar(110) NOT NULL,
  `kind` varchar(30) NOT NULL,
  `outcome` varchar(30) NOT NULL,
  `channel` varchar(30) NOT NULL,
  `preview_url` varchar(2048) NOT NULL,
  `note` varchar(2000) NOT NULL DEFAULT '',
  `recorded_by` varchar(100) NOT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  KEY `review_records_site_recorded_idx` (`site_id`, `recorded_at`),
  KEY `review_records_revision_recorded_idx` (`site_id`, `revision`, `recorded_at`),
  CONSTRAINT `review_records_revision_fk`
    FOREIGN KEY (`site_id`, `revision`)
    REFERENCES `site_revisions` (`site_id`, `revision`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `review_records_deployment_fk`
    FOREIGN KEY (`deployment_id`, `site_id`, `revision`)
    REFERENCES `deployments` (`deployment_id`, `site_id`, `revision`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `review_records_kind_ck`
    CHECK (`kind` IN ('preview_sent', 'customer_feedback', 'customer_confirmed')),
  CONSTRAINT `review_records_outcome_ck`
    CHECK (`outcome` IN ('pending', 'changes_requested', 'approved')),
  CONSTRAINT `review_records_channel_ck`
    CHECK (`channel` IN ('wechat', 'phone', 'email', 'in_person', 'other')),
  CONSTRAINT `review_records_kind_outcome_ck`
    CHECK (
      (`kind` = 'preview_sent' AND `outcome` = 'pending')
      OR (`kind` = 'customer_feedback' AND `outcome` = 'changes_requested')
      OR (`kind` = 'customer_confirmed' AND `outcome` = 'approved')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
