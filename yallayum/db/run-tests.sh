#!/usr/bin/env bash
# Tests du schéma : cluster PostgreSQL 16 + PostGIS jetable, chargé puis détruit.
#
#   bash db/run-tests.sh            (ou npm run test:sql)
#
# Variables utiles :
#   PG_BIN       dossier des binaires (défaut : /usr/lib/postgresql/16/bin)
#   PGTEST_BASE  dossier parent du cluster temporaire (défaut : $TMPDIR ou /tmp)
#   KEEP=1       garde le cluster après l'exécution, pour inspection
#
# En root (conteneur), le serveur tourne sous l'utilisateur « postgres » : le
# dossier du cluster doit donc lui être accessible. Si PGTEST_BASE ne l'est
# pas (dossier parent en 700, par exemple), on se replie sur /tmp.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
BASE="${PGTEST_BASE:-${TMPDIR:-/tmp}}"
PORT="${PGTEST_PORT:-$((54000 + RANDOM % 1000))}"

as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

mkdir -p "$BASE"
DIR="$(mktemp -d "$BASE/yallayum-pgtest.XXXXXX")"
if [ "$(id -u)" = "0" ]; then
  chown postgres:postgres "$DIR"
  if ! runuser -u postgres -- test -w "$DIR"; then
    rm -rf "$DIR"
    DIR="$(mktemp -d /tmp/yallayum-pgtest.XXXXXX)"
    chown postgres:postgres "$DIR"
    echo "· $BASE n'est pas accessible à l'utilisateur postgres : cluster dans $DIR"
  fi
fi

cleanup() {
  as_pg "$PG_BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true
  if [ "${KEEP:-0}" != "1" ]; then rm -rf "$DIR"; else echo "· cluster conservé : $DIR (port $PORT)"; fi
}
trap cleanup EXIT

as_pg "$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >"$DIR/initdb.log" 2>&1 \
  || { cat "$DIR/initdb.log"; exit 1; }
as_pg "$PG_BIN/pg_ctl" -D "$DIR/data" -l "$DIR/server.log" -w \
  -o "-p $PORT -k $DIR -c listen_addresses='' -c fsync=off -c timezone=UTC" start >/dev/null \
  || { cat "$DIR/server.log"; exit 1; }

# Les fichiers SQL sont copiés : le dépôt peut se trouver hors de portée de « postgres ».
cp "$HERE"/schema.sql "$HERE"/seed-taxonomy.sql "$HERE"/tests.sql "$DIR"/
chmod a+r "$DIR"/*.sql

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$DIR" -p "$PORT" -U postgres)
as_pg "$PG_BIN/createdb" -h "$DIR" -p "$PORT" -U postgres yallayum_test

for f in schema.sql seed-taxonomy.sql tests.sql; do
  echo "▸ $f"
  as_pg "${PSQL[@]}" -d yallayum_test -f "$DIR/$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /'
done

echo "✓ schéma chargé, tous les tests SQL passent"
