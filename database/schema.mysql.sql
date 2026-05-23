SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS tickets (
  year CHAR(4) NOT NULL,
  codigo VARCHAR(80) NOT NULL,
  activada TINYINT(1) NOT NULL DEFAULT 0,
  activada_at DATETIME(3) NULL,
  usada TINYINT(1) NOT NULL DEFAULT 0,
  usada_at DATETIME(3) NULL,
  bloqueada TINYINT(1) NOT NULL DEFAULT 0,
  fisica TINYINT(1) NOT NULL DEFAULT 0,
  validated_at DATETIME(3) NULL,
  batch_id VARCHAR(120) NULL,
  qr_url VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (year, codigo),
  KEY idx_tickets_year_created (year, created_at DESC, codigo DESC),
  KEY idx_tickets_year_batch (year, batch_id),
  KEY idx_tickets_year_status (year, activada, usada, bloqueada),
  KEY idx_tickets_year_fisica (year, fisica)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
