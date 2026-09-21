-- ============================================================
-- SISTEMA DE STRIKES - SABROFOOD REPARTO - PASO 2 (solo RLS)
-- Las tablas ya se crearon en el PASO 1. Este archivo solo
-- agrega las politicas de seguridad por rol.
-- Ejecutar en: Supabase > SQL Editor > Nueva consulta
-- ============================================================

-- Primero asegurar que RLS este habilitado (idempotente)
ALTER TABLE strikes_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisiones_cliente ENABLE ROW LEVEL SECURITY;

-- SELECT: todos los usuarios autenticados ven strikes y decisiones
CREATE POLICY "Todos pueden ver strikes" ON strikes_clientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Todos pueden ver decisiones" ON decisiones_cliente
  FOR SELECT TO authenticated USING (true);

-- INSERT: admin y repartidor registran strikes
CREATE POLICY "Admin y Repartidor registran strikes" ON strikes_clientes
  FOR INSERT TO authenticated
  WITH CHECK (auth.email() IN ('admin@sabrofood.com','repartidor@sabrofood.com'));

-- UPDATE: solo admin actualiza el estado de los strikes
CREATE POLICY "Solo admin actualiza strikes" ON strikes_clientes
  FOR UPDATE TO authenticated
  USING (auth.email() = 'admin@sabrofood.com')
  WITH CHECK (auth.email() = 'admin@sabrofood.com');

-- INSERT decisiones de baneo/observacion: solo admin
CREATE POLICY "Solo admin registra decisiones" ON decisiones_cliente
  FOR INSERT TO authenticated
  WITH CHECK (auth.email() = 'admin@sabrofood.com');

-- ============================================================
-- VERIFICACION: debe listar 3 politicas en strikes_clientes
-- y 2 politicas en decisiones_cliente
-- ============================================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('strikes_clientes','decisiones_cliente')
ORDER BY tablename, policyname;
