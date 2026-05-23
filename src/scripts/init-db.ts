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

    console.log('Base de datos inicializada correctamente.');
  } finally {
    await schemaConnection.end();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
