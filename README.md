<<<<<<< HEAD
#  Sistema de Gestión de Pedidos

Sistema web para gestionar pedidos de delivery con dos paneles:  uno para administración y otro para repartidores. 

---

## ¿Para qué sirve? 

Este sistema permite: 

- **Crear y gestionar pedidos** de manera rápida
- **Asignar entregas** a repartidores
- **Marcar pedidos como entregados** desde el móvil
- **Controlar la recaudación** diaria
- **Sincronizar datos en tiempo real** entre todos los dispositivos

---

## Roles de usuario

### 👨‍💼 Administrador (Local)
- Crear, editar y eliminar pedidos
- Ver estadísticas y reportes
- Acceso completo al sistema

### 🚚 Repartidor
- Ver pedidos del día
- Marcar entregas como completadas
- Controlar recaudación personal
- Selector de perfil (Repartidor 1 o 2)

---

## Cómo usar

### 1. Iniciar sesión
- Abrir la aplicación en el navegador
- Ingresar tu correo y contraseña
- Si eres admin:  elegir panel Local o Repartidor
- Si eres repartidor:  vas directo a tu panel

### 2. Crear un pedido (Admin)
1. Completar datos del cliente (nombre, dirección, teléfono)
2. Seleccionar productos del catálogo
3. Elegir repartidor (1 o 2)
4. Guardar pedido

### 3. Entregar un pedido (Repartidor)
1. Seleccionar tu perfil (Repartidor 1 o 2)
2. Ver lista de pedidos asignados
3. Click en "Marcar como entregado"
4. Seleccionar método de pago recibido

### 4. Ver resumen del día
- Click en "Ver Carga" para ver totales
- Diferenciación entre efectivo y transferencias
- Resumen de pedidos entregados

---

## Requisitos técnicos

- Navegador web moderno (Chrome, Firefox, Safari)
- Conexión a internet
- Cuenta en Supabase (para la base de datos)

---

## Instalación

1. Descargar el proyecto
2. Configurar credenciales de Supabase en `shared/supabase-config.js`
3. Crear usuarios en Supabase Authentication
4. Configurar emails autorizados en `shared/roles-config.js`
5. Subir a un hosting (Netlify recomendado) o usar Live Server localmente

**Documentación detallada:** Ver archivo `docs/SETUP-RLS. md` para configuración de seguridad.

---

## Características principales

✅ Autenticación segura con Supabase  
✅ Sincronización en tiempo real  
✅ Diseño responsive (móvil y escritorio)  
✅ Control de recaudación por método de pago  
✅ Protección de datos con permisos por rol  
✅ Modo offline parcial  

---

## Soporte

Si tienes problemas: 
- Verificar que estés usando un servidor web (no abrir archivos directamente)
- Limpiar caché del navegador (Ctrl + Shift + R)
- Verificar conexión a internet
- Revisar que las credenciales de Supabase estén correctas

---

Desarrollado con ❤️ para optimizar entregas de delivery. 
=======
#  Sistema de Gestión de Pedidos

Sistema web para gestionar pedidos de delivery con dos paneles:  uno para administración y otro para repartidores. 

---

## ¿Para qué sirve? 

Este sistema permite: 

- **Crear y gestionar pedidos** de manera rápida
- **Asignar entregas** a repartidores
- **Marcar pedidos como entregados** desde el móvil
- **Controlar la recaudación** diaria
- **Sincronizar datos en tiempo real** entre todos los dispositivos

---

## Roles de usuario

### 👨‍💼 Administrador (Local)
- Crear, editar y eliminar pedidos
- Ver estadísticas y reportes
- Acceso completo al sistema

### 🚚 Repartidor
- Ver pedidos del día
- Marcar entregas como completadas
- Controlar recaudación personal
- Selector de perfil (Repartidor 1 o 2)

---

## Cómo usar

### 1. Iniciar sesión
- Abrir la aplicación en el navegador
- Ingresar tu correo y contraseña
- Si eres admin:  elegir panel Local o Repartidor
- Si eres repartidor:  vas directo a tu panel

### 2. Crear un pedido (Admin)
1. Completar datos del cliente (nombre, dirección, teléfono)
2. Seleccionar productos del catálogo
3. Elegir repartidor (1 o 2)
4. Guardar pedido

### 3. Entregar un pedido (Repartidor)
1. Seleccionar tu perfil (Repartidor 1 o 2)
2. Ver lista de pedidos asignados
3. Click en "Marcar como entregado"
4. Seleccionar método de pago recibido

### 4. Ver resumen del día
- Click en "Ver Carga" para ver totales
- Diferenciación entre efectivo y transferencias
- Resumen de pedidos entregados

---

## Requisitos técnicos

- Navegador web moderno (Chrome, Firefox, Safari)
- Conexión a internet
- Cuenta en Supabase (para la base de datos)

---

## Instalación

1. Descargar el proyecto
2. Configurar credenciales de Supabase en `shared/supabase-config.js`
3. Crear usuarios en Supabase Authentication
4. Configurar emails autorizados en `shared/roles-config.js`
5. Subir a un hosting (Netlify recomendado) o usar Live Server localmente

**Documentación detallada:** Ver archivo `docs/SETUP-RLS. md` para configuración de seguridad.

---

## Características principales

✅ Autenticación segura con Supabase  
✅ Sincronización en tiempo real  
✅ Diseño responsive (móvil y escritorio)  
✅ Control de recaudación por método de pago  
✅ Protección de datos con permisos por rol  
✅ Modo offline parcial  

---

## Soporte

Si tienes problemas: 
- Verificar que estés usando un servidor web (no abrir archivos directamente)
- Limpiar caché del navegador (Ctrl + Shift + R)
- Verificar conexión a internet
- Revisar que las credenciales de Supabase estén correctas

---

Desarrollado con ❤️ para optimizar entregas de delivery. 
>>>>>>> 41ff8d308b21eebdb67b191af429292bcaf2d174
