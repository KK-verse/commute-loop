-- Applied automatically on PostgreSQL start-up (idempotent).
-- Adds PostGIS geography columns generated from latitude/longitude, plus GiST indexes
-- so proximity and corridor queries in the matching engine can use spatial indexes.

ALTER TABLE saved_locations
  ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED;
CREATE INDEX IF NOT EXISTS ix_saved_locations_geog ON saved_locations USING GIST (geog);

ALTER TABLE saved_locations
  ADD COLUMN IF NOT EXISTS pickup_geog geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN pickup_latitude IS NULL OR pickup_longitude IS NULL THEN NULL
         ELSE ST_SetSRID(ST_MakePoint(pickup_longitude, pickup_latitude), 4326)::geography END
  ) STORED;
CREATE INDEX IF NOT EXISTS ix_saved_locations_pickup_geog ON saved_locations USING GIST (pickup_geog);

ALTER TABLE route_stops
  ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED;
CREATE INDEX IF NOT EXISTS ix_route_stops_geog ON route_stops USING GIST (geog);
