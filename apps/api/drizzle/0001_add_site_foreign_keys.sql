ALTER TABLE `site_revisions`
  ADD CONSTRAINT `site_revisions_site_id_fk`
  FOREIGN KEY (`site_id`) REFERENCES `sites` (`site_id`)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_site_id_fk`
  FOREIGN KEY (`site_id`) REFERENCES `sites` (`site_id`)
  ON UPDATE CASCADE ON DELETE RESTRICT;
