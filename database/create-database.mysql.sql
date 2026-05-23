-- Sustituye ffsj_tickets por el valor de MYSQL_DATABASE si quieres otro nombre.
CREATE DATABASE IF NOT EXISTS ffsj_tickets
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ffsj_tickets;

SOURCE database/schema.mysql.sql;
