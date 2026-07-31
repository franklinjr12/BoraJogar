-- name: DatabaseVersion :one
SELECT current_database()::text AS database_name, PostGIS_Version()::text AS postgis_version;
