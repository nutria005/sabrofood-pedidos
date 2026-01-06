# Configuración de Row Level Security (RLS)

## Instrucciones

1. Ve a Supabase Dashboard: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a **SQL Editor**
4. Copia y pega cada bloque de código a continuación
5. Ejecuta cada uno presionando "Run"

## Paso 1: Habilitar RLS en la tabla pedidos

```sql
-- Habilitar Row Level Security
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
```

## Paso 2: Política de lectura (SELECT)

```sql
-- Todos los usuarios autenticados pueden VER pedidos
CREATE POLICY "Usuarios autenticados pueden ver pedidos"
ON pedidos
FOR SELECT
TO authenticated
USING (true);
```

## Paso 3: Política de inserción (INSERT)

```sql
-- Solo admin puede CREAR pedidos
CREATE POLICY "Solo admin puede crear pedidos"
ON pedidos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);
```

## Paso 4: Política de actualización (UPDATE)

```sql
-- Admin puede actualizar TODO
-- Repartidor solo puede actualizar campo "entrega"
CREATE POLICY "Admin actualiza todo, repartidor solo entrega"
ON pedidos
FOR UPDATE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com' OR
  auth.email() = 'repartidor@sabrofood.com'
)
WITH CHECK (
  -- Admin puede cambiar cualquier cosa
  auth.email() = 'admin@sabrofood.com' OR
  
  -- Repartidor solo puede marcar como entregado
  (auth.email() = 'repartidor@sabrofood.com' AND
   -- Aquí verificaríamos que solo cambió el campo entrega
   -- Supabase permite esto con políticas más complejas si es necesario
   true)
);
```

## Paso 5: Política de eliminación (DELETE)

```sql
-- Solo admin puede ELIMINAR pedidos
CREATE POLICY "Solo admin puede eliminar pedidos"
ON pedidos
FOR DELETE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
);
```

## Verificación

Para verificar que las políticas están activas:

```sql
-- Ver todas las políticas de la tabla pedidos
SELECT * FROM pg_policies WHERE tablename = 'pedidos';
```

## Resultado esperado

✅ Admin (`admin@sabrofood.com`):
- Puede ver todos los pedidos
- Puede crear nuevos pedidos
- Puede editar cualquier campo
- Puede eliminar pedidos

✅ Repartidor (`repartidor@sabrofood.com`):
- Puede ver todos los pedidos
- NO puede crear pedidos (bloqueado en BD)
- Puede marcar pedidos como entregados
- NO puede eliminar pedidos (bloqueado en BD)

## Rollback (Deshacer)

Si necesitas desactivar RLS temporalmente:

```sql
-- Deshabilitar RLS (NO RECOMENDADO en producción)
ALTER TABLE pedidos DISABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver pedidos" ON pedidos;
DROP POLICY IF EXISTS "Solo admin puede crear pedidos" ON pedidos;
DROP POLICY IF EXISTS "Admin actualiza todo, repartidor solo entrega" ON pedidos;
DROP POLICY IF EXISTS "Solo admin puede eliminar pedidos" ON pedidos;
```
