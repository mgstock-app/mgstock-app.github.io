#!/bin/sh
# Base de prueba limpia para el recorrido web: fixture + migración real de la caja app.
set -e
PGARGS=${CAJA_PG:-"-h /home/claude/pgcaja -p 55432 -U postgres"}
DIR=$(dirname "$0")/../..
psql $PGARGS -d postgres -q -v ON_ERROR_STOP=1 -c "drop database if exists cajaui" -c "create database cajaui" 2>/dev/null
psql $PGARGS -d cajaui -q -v ON_ERROR_STOP=1 -f "$DIR/tests/fixtures/base.sql" >/dev/null
psql $PGARGS -d cajaui -q -v ON_ERROR_STOP=1 -f "$DIR/supabase/migrations/20261102050000_caja_app_base.sql" >/dev/null
echo "base cajaui lista"
