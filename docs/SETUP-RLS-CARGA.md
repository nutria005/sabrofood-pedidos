# Configuración de RLS para Manifiesto de Carga

## Problema
Los errores 400 en la consola ocurren porque las tablas `carga_marcados`, `productos` y `movimientos_stock` no tienen políticas RLS configuradas.

## Solución

### Paso 1: Crear tabla `carga_marcados` (si no existe)

```sql
-- Tabla para persistir items marcados en el manifiesto de carga
CREATE TABLE IF NOT EXISTS carga_marcados (
  checkbox_id TEXT PRIMARY KEY,
  marcado BOOLEAN DEFAULT true,
  pedido_id TEXT,
  producto_id INTEGER,
  cantidad INTEGER,
  nombre_producto TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE carga_marcados ENABLE ROW LEVEL SECURITY;

-- Política: Admin y Repartidor pueden ver todos los items marcados
CREATE POLICY "Todos pueden ver items marcados"
ON carga_marcados
FOR SELECT
TO authenticated
USING (true);

-- Política: Admin y Repartidor pueden insertar/actualizar
CREATE POLICY "Admin y Repartidor pueden marcar items"
ON carga_marcados
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
);

CREATE POLICY "Admin y Repartidor pueden actualizar items"
ON carga_marcados
FOR UPDATE
TO authenticated
USING (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
)
WITH CHECK (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
);

-- Política: Admin y Repartidor pueden eliminar
CREATE POLICY "Admin y Repartidor pueden desmarcar items"
ON carga_marcados
FOR DELETE
TO authenticated
USING (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
);
```

### Paso 2: Configurar RLS en tabla `productos`

```sql
-- Habilitar RLS (si no está habilitado)
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

-- Política: Todos pueden VER productos
CREATE POLICY "Usuarios autenticados pueden ver productos"
ON productos
FOR SELECT
TO authenticated
USING (true);

-- Política: Solo Admin puede ACTUALIZAR stock
CREATE POLICY "Solo admin puede actualizar productos"
ON productos
FOR UPDATE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
)
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);

-- Política: Solo Admin puede INSERTAR productos
CREATE POLICY "Solo admin puede crear productos"
ON productos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);

-- Política: Solo Admin puede ELIMINAR productos
CREATE POLICY "Solo admin puede eliminar productos"
ON productos
FOR DELETE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
);
```

### Paso 3: Crear tabla `movimientos_stock` (si no existe)

```sql
-- Tabla para historial de movimientos de stock
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  pedido_id TEXT,
  tipo TEXT NOT NULL, -- 'ENTRADA', 'SALIDA', 'AJUSTE'
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER,
  stock_nuevo INTEGER,
  usuario TEXT,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;

-- Política: Todos pueden VER movimientos
CREATE POLICY "Usuarios autenticados pueden ver movimientos"
ON movimientos_stock
FOR SELECT
TO authenticated
USING (true);

-- Política: Solo Admin puede INSERTAR movimientos
CREATE POLICY "Solo admin puede crear movimientos"
ON movimientos_stock
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);

-- Política: Solo Admin puede ELIMINAR movimientos
CREATE POLICY "Solo admin puede eliminar movimientos"
ON movimientos_stock
FOR DELETE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
);
```

## Verificar políticas

```sql
-- Ver políticas de carga_marcados
SELECT * FROM pg_policies WHERE tablename = 'carga_marcados';

-- Ver políticas de productos
SELECT * FROM pg_policies WHERE tablename = 'productos';

-- Ver políticas de movimientos_stock
SELECT * FROM pg_policies WHERE tablename = 'movimientos_stock';
```

## Resultado esperado

✅ **Admin** (`admin@sabrofood.com`):
- Puede ver, crear, actualizar y eliminar items marcados
- Puede actualizar stock de productos
- Puede ver e insertar movimientos de stock

✅ **Repartidor** (`repartidor@sabrofood.com`):
- Puede ver, crear, actualizar y eliminar items marcados
- Puede ver productos (solo lectura)
- Puede ver movimientos (solo lectura)

## Notas importantes

1. La tabla `carga_marcados` usa `checkbox_id` como PRIMARY KEY para evitar duplicados
2. Los movimientos de stock solo pueden ser creados por admin
3. El repartidor puede marcar/desmarcar items pero NO puede modificar stock directamente
4. Si la tabla `productos` ya existe, solo ejecuta las políticas RLS (paso 2)
