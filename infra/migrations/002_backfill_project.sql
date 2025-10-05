-- Migration: 002_backfill_project.sql
-- Automatically set 'project' field to 'default' for all existing rows after schema change

UPDATE raw_events SET project = 'default' WHERE project IS NULL;
UPDATE metrics_agg SET project = 'default' WHERE project IS NULL;
UPDATE incidents SET project = 'default' WHERE project IS NULL;
