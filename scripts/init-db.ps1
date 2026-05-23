param(
  [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "No se ha encontrado el archivo $Path. Copia .env.example a .env y completa sus valores."
  }

  $values = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()

    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      return
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  return $values
}

$envValues = Read-DotEnv -Path $EnvFile

$mysqlHost = $envValues["MYSQL_HOST"]
$mysqlPort = $envValues["MYSQL_PORT"]
$mysqlUser = $envValues["MYSQL_USER"]
$mysqlPassword = $envValues["MYSQL_PASSWORD"]
$mysqlDatabase = $envValues["MYSQL_DATABASE"]
$schemaPath = Join-Path $PSScriptRoot "..\database\schema.mysql.sql"

if (-not $mysqlHost) { throw "Falta MYSQL_HOST en $EnvFile." }
if (-not $mysqlPort) { $mysqlPort = "3306" }
if (-not $mysqlUser) { throw "Falta MYSQL_USER en $EnvFile." }
if (-not $mysqlDatabase) { throw "Falta MYSQL_DATABASE en $EnvFile." }
if (-not (Test-Path -LiteralPath $schemaPath)) { throw "No se ha encontrado $schemaPath." }

$mysqlCommand = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysqlCommand) {
  throw "No se ha encontrado el comando mysql en PATH. Instala MySQL Client o abre una terminal con mysql disponible."
}

$createDatabaseSql = @"
CREATE DATABASE IF NOT EXISTS `$mysqlDatabase`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
"@

$createDatabaseArgs = @(
  "-h", $mysqlHost,
  "-P", $mysqlPort,
  "-u", $mysqlUser
)

if ($mysqlPassword) {
  $createDatabaseArgs += "-p$mysqlPassword"
}

Write-Host "Creando base de datos '$mysqlDatabase' si no existe..."
$createDatabaseSql | mysql @createDatabaseArgs

$applySchemaArgs = @(
  "-h", $mysqlHost,
  "-P", $mysqlPort,
  "-u", $mysqlUser
)

if ($mysqlPassword) {
  $applySchemaArgs += "-p$mysqlPassword"
}

$applySchemaArgs += $mysqlDatabase

Write-Host "Aplicando schema en '$mysqlDatabase'..."
Get-Content -LiteralPath $schemaPath -Raw | mysql @applySchemaArgs

Write-Host "Base de datos inicializada correctamente."
