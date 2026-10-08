-- One schema and one role per service that persists data (ADR 0009).
--
-- LOCAL DEVELOPMENT ONLY: the passwords below match .env.example and are not secrets.
-- In any shared or real environment, create the roles with generated passwords instead.

CREATE ROLE web LOGIN PASSWORD 'change-me-web';
CREATE ROLE normalization LOGIN PASSWORD 'change-me-normalization';
CREATE ROLE reports LOGIN PASSWORD 'change-me-reports';

CREATE SCHEMA web AUTHORIZATION web;
CREATE SCHEMA normalization AUTHORIZATION normalization;
CREATE SCHEMA reports AUTHORIZATION reports;

-- Each role works inside its own schema by default.
ALTER ROLE web SET search_path = web;
ALTER ROLE normalization SET search_path = normalization;
ALTER ROLE reports SET search_path = reports;

-- Nobody can create objects in the public schema, and only the three service roles can connect.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO web, normalization, reports', current_database());
END
$$;
