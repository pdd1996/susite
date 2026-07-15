CREATE TABLE `sites` (
  `site_id` varchar(80) NOT NULL,
  `name` varchar(100) NOT NULL,
  `template` varchar(80) NOT NULL,
  `current_revision` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`site_id`)
);

CREATE TABLE `site_revisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `site_id` varchar(80) NOT NULL,
  `revision` int NOT NULL,
  `schema_version` varchar(20) NOT NULL,
  `config` json NOT NULL,
  `created_by` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_revisions_site_revision_uq` (`site_id`, `revision`)
);

CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actor_id` varchar(100) NOT NULL,
  `action` varchar(80) NOT NULL,
  `site_id` varchar(80) NOT NULL,
  `target_id` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
