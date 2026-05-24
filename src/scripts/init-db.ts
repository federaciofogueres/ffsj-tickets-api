import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const envFile = process.argv[2] || '.env';
const envPath = path.resolve(process.cwd(), envFile);
const schemaPath = path.resolve(process.cwd(), 'database/schema.mysql.sql');

if (!fs.existsSync(envPath)) {
  throw new Error(`No se ha encontrado ${envFile}. Copia .env.example a .env y completa sus valores.`);
}

if (!fs.existsSync(schemaPath)) {
  throw new Error(`No se ha encontrado ${schemaPath}.`);
}

dotenv.config({ path: envPath });

const required = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Falta ${key} en ${envFile}.`);
  }
  return value;
};

const splitSqlStatements = (sql: string): string[] => {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
};

const columnExists = async (connection: mysql.Connection, database: string, table: string, column: string): Promise<boolean> => {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [database, table, column]
  );
  return rows.length > 0;
};

const columnNullable = async (connection: mysql.Connection, database: string, table: string, column: string): Promise<boolean> => {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [database, table, column]
  );
  return String(rows[0]?.IS_NULLABLE ?? 'YES').toUpperCase() === 'YES';
};

const indexExists = async (connection: mysql.Connection, database: string, table: string, index: string): Promise<boolean> => {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [database, table, index]
  );
  return rows.length > 0;
};

const constraintExists = async (connection: mysql.Connection, database: string, table: string, constraint: string): Promise<boolean> => {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [database, table, constraint]
  );
  return rows.length > 0;
};

const primaryKeyColumns = async (connection: mysql.Connection, database: string, table: string): Promise<string[]> => {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION ASC`,
    [database, table]
  );
  return rows.map((row) => String(row.COLUMN_NAME));
};

const applyCompatibilityMigrations = async (connection: mysql.Connection, database: string): Promise<void> => {
  const defaultEventId = '00000000-0000-4000-8000-000000000001';

  await connection.query(
    `INSERT INTO eventos (id, year, nombre, descripcion, estado)
     SELECT ?, COALESCE((SELECT MIN(year) FROM tickets), YEAR(CURDATE())), 'Evento principal', 'Evento creado automaticamente para tickets existentes.', 'activo'
     WHERE NOT EXISTS (SELECT 1 FROM eventos LIMIT 1)`,
    [defaultEventId]
  );

  await connection.query(
    `INSERT INTO eventos (id, year, nombre, descripcion, estado)
     SELECT UUID(), ticket_years.year, 'Evento principal', 'Evento creado automaticamente para tickets existentes.', 'activo'
     FROM (SELECT DISTINCT year FROM tickets) AS ticket_years
     WHERE NOT EXISTS (SELECT 1 FROM eventos WHERE eventos.year = ticket_years.year)`
  );

  if (!(await columnExists(connection, database, 'tickets', 'event_id'))) {
    await connection.query('ALTER TABLE tickets ADD COLUMN event_id VARCHAR(36) NULL AFTER year');
  }

  await connection.query(
    `UPDATE tickets
     SET event_id = COALESCE(
       event_id,
       (SELECT id FROM eventos WHERE eventos.year = tickets.year ORDER BY created_at ASC, id ASC LIMIT 1),
       ?
     )
     WHERE event_id IS NULL`,
    [defaultEventId]
  );

  if (await columnNullable(connection, database, 'tickets', 'event_id')) {
    await connection.query('ALTER TABLE tickets MODIFY event_id VARCHAR(36) NOT NULL');
  }

  const primaryColumns = await primaryKeyColumns(connection, database, 'tickets');
  if (primaryColumns.join(',') !== 'event_id,codigo') {
    await connection.query('ALTER TABLE tickets DROP PRIMARY KEY, ADD PRIMARY KEY (event_id, codigo)');
  }

  if (!(await indexExists(connection, database, 'tickets', 'idx_tickets_event_created'))) {
    await connection.query('CREATE INDEX idx_tickets_event_created ON tickets (event_id, created_at DESC, codigo DESC)');
  }
  if (!(await indexExists(connection, database, 'tickets', 'idx_tickets_event_batch'))) {
    await connection.query('CREATE INDEX idx_tickets_event_batch ON tickets (event_id, batch_id)');
  }
  if (!(await indexExists(connection, database, 'tickets', 'idx_tickets_event_status'))) {
    await connection.query('CREATE INDEX idx_tickets_event_status ON tickets (event_id, activada, usada, bloqueada)');
  }
  if (!(await constraintExists(connection, database, 'tickets', 'fk_tickets_eventos'))) {
    await connection.query('ALTER TABLE tickets ADD CONSTRAINT fk_tickets_eventos FOREIGN KEY (event_id) REFERENCES eventos(id) ON UPDATE CASCADE ON DELETE RESTRICT');
  }
};

const main = async (): Promise<void> => {
  const host = required('MYSQL_HOST');
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = required('MYSQL_USER');
  const password = process.env.MYSQL_PASSWORD || '';
  const database = required('MYSQL_DATABASE');

  const bootstrapConnection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: false
  });

  try {
    console.log(`Creando base de datos '${database}' si no existe...`);
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '``')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrapConnection.end();
  }

  const schemaConnection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: false
  });

  try {
    console.log(`Aplicando schema en '${database}'...`);
    const statements = splitSqlStatements(fs.readFileSync(schemaPath, 'utf8'));

    for (const statement of statements) {
      await schemaConnection.query(statement);
    }

    console.log('Aplicando migraciones de compatibilidad...');
    await applyCompatibilityMigrations(schemaConnection, database);

    console.log('Base de datos inicializada correctamente.');
  } finally {
    await schemaConnection.end();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
