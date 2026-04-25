-- ============================================================
-- Control Store Pro — Supabase Schema
-- ASSA ABLOY México
-- ============================================================
-- Pega este archivo completo en el SQL Editor de Supabase
-- (Dashboard → SQL Editor → New query → Run)
-- ============================================================

-- Tabla principal: almacena todos los registros por colección
-- Usa JSONB para flexibilidad total sin romper compatibilidad
CREATE TABLE IF NOT EXISTS csp_data (
  collection  TEXT        NOT NULL,
  item_id     TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (collection, item_id)
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_csp_collection     ON csp_data(collection);
CREATE INDEX IF NOT EXISTS idx_csp_updated_at     ON csp_data(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_not_deleted    ON csp_data(collection, deleted) WHERE deleted = FALSE;

-- Auto-actualizar updated_at en cada UPDATE
CREATE OR REPLACE FUNCTION csp_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_csp_updated_at ON csp_data;
CREATE TRIGGER trg_csp_updated_at
  BEFORE UPDATE ON csp_data
  FOR EACH ROW EXECUTE FUNCTION csp_set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Habilita RLS (buena práctica aunque usemos política abierta por ahora)
ALTER TABLE csp_data ENABLE ROW LEVEL SECURITY;

-- Política abierta para anon (publishable key):
-- Permite leer y escribir a cualquier cliente autenticado con tu publishable key.
-- Para producción multi-empresa, agrega una columna tenant_id y filtra por ella.
DROP POLICY IF EXISTS "anon_full_access" ON csp_data;
CREATE POLICY "anon_full_access" ON csp_data
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── Vista auxiliar: última sincronización por colección ─────────────────────
CREATE OR REPLACE VIEW csp_sync_status AS
  SELECT
    collection,
    COUNT(*)                              AS total_items,
    COUNT(*) FILTER (WHERE deleted=FALSE) AS active_items,
    MAX(updated_at)                       AS last_updated
  FROM csp_data
  GROUP BY collection;

-- ─── Función: upsert batch ────────────────────────────────────────────────────
-- Permite insertar o actualizar muchos items en una sola llamada
CREATE OR REPLACE FUNCTION csp_upsert_batch(items JSONB)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  item    JSONB;
  counter INTEGER := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    INSERT INTO csp_data(collection, item_id, data, updated_at)
    VALUES (
      item->>'collection',
      item->>'item_id',
      item->'data',
      COALESCE((item->>'updated_at')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (collection, item_id) DO UPDATE
      SET data       = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at,
          deleted    = FALSE;
    counter := counter + 1;
  END LOOP;
  RETURN counter;
END;
$$;

-- ─── Verificación ─────────────────────────────────────────────────────────────
-- Ejecuta esto para confirmar que todo quedó bien:
-- SELECT * FROM csp_sync_status;
-- SELECT COUNT(*) FROM csp_data;
