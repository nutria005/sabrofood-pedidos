# 🔒 Setup Completo de RLS - Todas las Tablas en Armonía

Este script configura **todas las políticas RLS** de forma consistente para que todo funcione en armonía.

## ⚠️ IMPORTANTE
- Este script es **seguro** y no borra datos
- Solo recrea las políticas RLS (los datos en las tablas quedan intactos)
- Ejecuta los scripts en orden

---

## 📋 SCRIPT 1: Limpiar políticas existentes (opcional pero recomendado)

Si ya tienes políticas creadas, este script las elimina para evitar duplicados:

```sql
-- ============================================
-- LIMPIEZA: Eliminar políticas anteriores
-- ============================================

-- Políticas de pedidos
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver pedidos" ON pedidos;
DROP POLICY IF EXISTS "Solo admin puede crear pedidos" ON pedidos;
DROP POLICY IF EXISTS "Admin actualiza todo, repartidor solo entrega" ON pedidos;
DROP POLICY IF EXISTS "Solo admin puede eliminar pedidos" ON pedidos;

-- Políticas de carga_marcados
DROP POLICY IF EXISTS "Todos pueden ver items marcados" ON carga_marcados;
DROP POLICY IF EXISTS "Admin y Repartidor pueden marcar items" ON carga_marcados;
DROP POLICY IF EXISTS "Admin y Repartidor pueden actualizar items" ON carga_marcados;
DROP POLICY IF EXISTS "Admin y Repartidor pueden desmarcar items" ON carga_marcados;

-- Políticas de productos
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver productos" ON productos;
DROP POLICY IF EXISTS "Solo admin puede crear productos" ON productos;
DROP POLICY IF EXISTS "Solo admin puede actualizar productos" ON productos;
DROP POLICY IF EXISTS "Solo admin puede eliminar productos" ON productos;

-- Políticas de movimientos_stock
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver movimientos" ON movimientos_stock;
DROP POLICY IF EXISTS "Solo admin puede crear movimientos" ON movimientos_stock;
DROP POLICY IF EXISTS "Solo admin puede eliminar movimientos" ON movimientos_stock;
```

---

## 📋 SCRIPT 2: Crear/verificar estructura de tablas

```sql
-- ============================================
-- TABLAS: Crear si no existen
-- ============================================

-- Tabla de pedidos (probablemente ya existe)
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  telefono TEXT,
  direccion TEXT,
  items JSONB,
  total DECIMAL(10,2),
  prioridad TEXT DEFAULT 'C',
  entregado BOOLEAN DEFAULT false,
  fecha_entrega TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de productos (probablemente ya existe)
CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio DECIMAL(10,2),
  stock INTEGER DEFAULT 0,
  categoria TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de items marcados en carga (NUEVA)
CREATE TABLE IF NOT EXISTS carga_marcados (
  checkbox_id TEXT PRIMARY KEY,
  marcado BOOLEAN DEFAULT true,
  pedido_id TEXT,
  producto_id INTEGER,
  cantidad INTEGER,
  nombre_producto TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de movimientos de stock (NUEVA)
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
```

---

## 📋 SCRIPT 3: Habilitar RLS en todas las tablas

```sql
-- ============================================
-- RLS: Habilitar en todas las tablas
-- ============================================

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE carga_marcados ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
```

---

## 📋 SCRIPT 4: Políticas para tabla PEDIDOS

```sql
-- ============================================
-- POLÍTICAS: pedidos
-- ============================================

-- Todos pueden VER pedidos
CREATE POLICY "Usuarios autenticados pueden ver pedidos"
ON pedidos
FOR SELECT
TO authenticated
USING (true);

-- Solo admin puede CREAR pedidos
CREATE POLICY "Solo admin puede crear pedidos"
ON pedidos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);

-- Admin actualiza todo, Repartidor solo entrega
CREATE POLICY "Admin actualiza todo, repartidor solo entrega"
ON pedidos
FOR UPDATE
TO authenticated
USING (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
)
WITH CHECK (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
);

-- Solo admin puede ELIMINAR pedidos
CREATE POLICY "Solo admin puede eliminar pedidos"
ON pedidos
FOR DELETE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
);
```

---

## 📋 SCRIPT 5: Políticas para tabla PRODUCTOS

```sql
-- ============================================
-- POLÍTICAS: productos
-- ============================================

-- Todos pueden VER productos
CREATE POLICY "Usuarios autenticados pueden ver productos"
ON productos
FOR SELECT
TO authenticated
USING (true);

-- Solo admin puede CREAR productos
CREATE POLICY "Solo admin puede crear productos"
ON productos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);

-- Solo admin puede ACTUALIZAR productos
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

-- Solo admin puede ELIMINAR productos
CREATE POLICY "Solo admin puede eliminar productos"
ON productos
FOR DELETE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
);
```

---

## 📋 SCRIPT 6: Políticas para tabla CARGA_MARCADOS

```sql
-- ============================================
-- POLÍTICAS: carga_marcados
-- ============================================

-- Todos pueden VER items marcados
CREATE POLICY "Todos pueden ver items marcados"
ON carga_marcados
FOR SELECT
TO authenticated
USING (true);

-- Admin y Repartidor pueden MARCAR items
CREATE POLICY "Admin y Repartidor pueden marcar items"
ON carga_marcados
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
);

-- Admin y Repartidor pueden ACTUALIZAR items
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

-- Admin y Repartidor pueden DESMARCAR items
CREATE POLICY "Admin y Repartidor pueden desmarcar items"
ON carga_marcados
FOR DELETE
TO authenticated
USING (
  auth.email() IN ('admin@sabrofood.com', 'repartidor@sabrofood.com')
);
```

---

## 📋 SCRIPT 7: Políticas para tabla MOVIMIENTOS_STOCK

```sql
-- ============================================
-- POLÍTICAS: movimientos_stock
-- ============================================

-- Todos pueden VER movimientos (historial)
CREATE POLICY "Usuarios autenticados pueden ver movimientos"
ON movimientos_stock
FOR SELECT
TO authenticated
USING (true);

-- Solo admin puede REGISTRAR movimientos
CREATE POLICY "Solo admin puede crear movimientos"
ON movimientos_stock
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'admin@sabrofood.com'
);

-- Solo admin puede ELIMINAR movimientos
CREATE POLICY "Solo admin puede eliminar movimientos"
ON movimientos_stock
FOR DELETE
TO authenticated
USING (
  auth.email() = 'admin@sabrofood.com'
);
```

---

## 📋 SCRIPT 8: Verificar que todo está correcto

```sql
-- ============================================
-- VERIFICACIÓN: Ver todas las políticas
-- ============================================

-- Ver políticas de pedidos
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename = 'pedidos'
ORDER BY policyname;

-- Ver políticas de productos
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename = 'productos'
ORDER BY policyname;

-- Ver políticas de carga_marcados
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename = 'carga_marcados'
ORDER BY policyname;

-- Ver políticas de movimientos_stock
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename = 'movimientos_stock'
ORDER BY policyname;

-- Resumen: Contar políticas por tabla
SELECT tablename, COUNT(*) as total_policies
FROM pg_policies 
WHERE tablename IN ('pedidos', 'productos', 'carga_marcados', 'movimientos_stock')
GROUP BY tablename
ORDER BY tablename;
```

---

## 🎯 Resultado Esperado

Después de ejecutar todos los scripts, deberías ver:

```
tablename          | total_policies
-------------------+---------------
carga_marcados     | 4
movimientos_stock  | 3
pedidos            | 4
productos          | 4
```

---

## 📊 Matriz de Permisos (resumen)

| Tabla | Admin | Repartidor |
|-------|-------|------------|
| **pedidos** | Ver ✅ Crear ✅ Editar ✅ Eliminar ✅ | Ver ✅ Editar ✅ |
| **productos** | Ver ✅ Crear ✅ Editar ✅ Eliminar ✅ | Ver ✅ |
| **carga_marcados** | Ver ✅ Crear ✅ Editar ✅ Eliminar ✅ | Ver ✅ Crear ✅ Editar ✅ Eliminar ✅ |
| **movimientos_stock** | Ver ✅ Crear ✅ Eliminar ✅ | Ver ✅ |

---

## 🚀 Cómo ejecutar (paso a paso)

1. **Abre Supabase Dashboard**: https://supabase.com/dashboard
2. **Ve a SQL Editor**
3. **Ejecuta SCRIPT 1** (limpieza) → Presiona Run
4. **Ejecuta SCRIPT 2** (tablas) → Presiona Run
5. **Ejecuta SCRIPT 3** (habilitar RLS) → Presiona Run
6. **Ejecuta SCRIPT 4** (pedidos) → Presiona Run
7. **Ejecuta SCRIPT 5** (productos) → Presiona Run
8. **Ejecuta SCRIPT 6** (carga_marcados) → Presiona Run
9. **Ejecuta SCRIPT 7** (movimientos_stock) → Presiona Run
10. **Ejecuta SCRIPT 8** (verificar) → Deberías ver las 4 políticas por tabla

---

## ⚠️ Notas Importantes

### ¿Perderé datos?
**NO**. Las políticas RLS solo controlan **permisos de acceso**, no borran datos.

### ¿Tengo que ejecutar TODO?
- Si YA tienes la tabla `pedidos` funcionando → **Ejecuta del SCRIPT 2 al 8**
- Si es instalación nueva → **Ejecuta del SCRIPT 1 al 8**

### ¿Qué pasa si ejecuto dos veces?
- **SCRIPT 1**: Es seguro, solo borra políticas (no datos)
- **SCRIPT 2**: `CREATE TABLE IF NOT EXISTS` no hace nada si ya existe
- **SCRIPT 3-7**: Si la política ya existe, dará error pero puedes ignorarlo

### ¿Cómo saber si funcionó?
Después del SCRIPT 8 deberías ver en la consola:
```
✅ 4 políticas en pedidos
✅ 4 políticas en productos
✅ 4 políticas en carga_marcados
✅ 3 políticas en movimientos_stock
```

---

## 🆘 Si algo sale mal

### Desactivar RLS temporalmente (NO RECOMENDADO)
```sql
ALTER TABLE pedidos DISABLE ROW LEVEL SECURITY;
ALTER TABLE productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE carga_marcados DISABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock DISABLE ROW LEVEL SECURITY;
```

### Ver errores de políticas
```sql
-- Ver si RLS está activo
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('pedidos', 'productos', 'carga_marcados', 'movimientos_stock');
```

---

## ✅ Checklist Final

- [ ] Ejecuté SCRIPT 1 (limpieza)
- [ ] Ejecuté SCRIPT 2 (tablas)
- [ ] Ejecuté SCRIPT 3 (habilitar RLS)
- [ ] Ejecuté SCRIPT 4 (pedidos)
- [ ] Ejecuté SCRIPT 5 (productos)
- [ ] Ejecuté SCRIPT 6 (carga_marcados)
- [ ] Ejecuté SCRIPT 7 (movimientos_stock)
- [ ] Ejecuté SCRIPT 8 (verificación)
- [ ] Veo 4-3-4-4 políticas en la verificación
- [ ] Probé marcar items en "Ver Carga"
- [ ] No hay errores 400 en consola

---

## 🎉 Todo listo

Si completaste el checklist, **todo está en armonía** y deberías poder:

✅ Marcar items en "Ver Carga" (admin y repartidor)  
✅ Ver el conteo correcto de bultos (2 en lugar de 20001)  
✅ Sincronizar items marcados entre interfaces  
✅ Descontar stock automáticamente (solo admin)  
✅ Ver historial de movimientos  

**Sin errores 400 en consola** 🚀
