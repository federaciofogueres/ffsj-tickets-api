import mysql from 'mysql2/promise';

import { env } from './env';

export const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: env.MYSQL_CONNECTION_LIMIT,
  charset: 'utf8mb4'
});
