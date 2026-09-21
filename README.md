# 📱 Sistema de Gestión de Pedidos - Sabrofood Reparto

Sistema web **PWA (Progressive Web App)** para gestionar pedidos de delivery con dos paneles: uno para administración y otro para repartidores.

> 🎉 **Nuevo**: Ahora disponible como **PWA instalable** en móviles y computadoras

---

## 🎯 ¿Para qué sirve?

Este sistema permite:

- **Crear y gestionar pedidos** de manera rápida
- **Asignar entregas** a repartidores
- **Marcar pedidos como entregados** desde el móvil
- **Controlar la recaudación** diaria
- **Sincronizar datos en tiempo real** entre todos los dispositivos
- **📱 Funcionar como app instalada** (PWA)

---

## 👥 Roles de usuario

### 👨‍💼 Administrador (Local)
- Crear, editar y eliminar pedidos
- Ver estadísticas y reportes
- Acceso completo al sistema
- Historial de clientes con múltiples direcciones
- Confirmación obligatoria de direcciones
- 🚫 **Sistema de strikes**: panel "Clientes en Revisión" con baneados, observación y descartes

### 🚚 Repartidor
- Ver pedidos del día
- Marcar entregas como completadas
- Controlar recaudación personal
- Selector de perfil (Repartidor 1 o 2)

---

## 🚀 Cómo usar

### 1. Iniciar sesión
- Abrir la aplicación en el navegador
- Ingresar tu correo y contraseña
- Si eres admin: elegir panel Local o Repartidor
- Si eres repartidor: vas directo a tu panel

### 2. Crear un pedido (Admin)
1. Completar datos del cliente (nombre, dirección, teléfono)
2. **Nuevo**: Seleccionar dirección del historial si es cliente recurrente
3. Confirmar que la dirección es correcta (obligatorio)
4. Seleccionar productos del catálogo
5. Elegir repartidor (1 o 2)
6. Guardar pedido

### 3. Entregar un pedido (Repartidor)
1. Seleccionar tu perfil (Repartidor 1 o 2)
2. Ver lista de pedidos asignados
3. Click en "Marcar como entregado"
4. Seleccionar método de pago recibido

### 4. Ver resumen del día
- Click en "Ver Carga" para ver totales
- Diferenciación entre efectivo y transferencias
- Resumen de pedidos entregados

### 5. Sistema de Strikes (Admin)
- El panel "🚫 Clientes en Revisión" (`local/strikes.html`) gestiona clientes repetidores:
  - **🧪 Modo práctica** (por defecto): datos inventados en el navegador, sin base de datos.
    Carga la semilla con "🧪 Cargar datos de ejemplo" para probar y entender el sistema.
  - **🟢 Modo real (BD)**: contra las tablas de Supabase (requiere ejecutar el SQL de
    `docs/SETUP-RLS-STRIKES.md` y sesión iniciada).
  - Puedes alternar entre modos con los botones del panel; la elección se guarda y la
    respetan todos los paneles (pedidos, historial, reparto).
- Un cliente **baneado** no puede tener pedidos confirmados (bloqueo en el formulario,
  tanto en admin como en repartidor).

---

## 📱 Instalación como PWA

### En móviles (Android/iOS)

**Android Chrome:**
1. Abre la aplicación en Chrome
2. Toca el menú (⋮)
3. Selecciona "Instalar app" o "Añadir a pantalla de inicio"
4. ¡Listo! Ahora tienes el icono en tu launcher

**iOS Safari:**
1. Abre la aplicación en Safari
2. Toca el botón de compartir (cuadro con flecha)
3. Selecciona "Añadir a pantalla de inicio"
4. ¡Listo! Aparecerá en tu pantalla principal

### En computadora (Windows/Mac)

**Chrome/Edge:**
1. Abre la aplicación
2. Busca el icono ⊕ en la barra de direcciones
3. Click en "Instalar Sabrofood Reparto"
4. Se creará un acceso directo en tu escritorio

---

## 💻 Requisitos técnicos

- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Conexión a internet (con soporte offline parcial)
- Cuenta en Supabase (para la base de datos)

---

## 🛠️ Instalación para desarrolladores

1. Clonar el proyecto
2. Configurar credenciales de Supabase en `shared/supabase-config.js`
3. Crear usuarios en Supabase Authentication
4. Configurar emails autorizados en `shared/roles-config.js`
5. Subir a un hosting (Netlify recomendado) o usar Live Server localmente

**Documentación detallada:**
- Ver `docs/SETUP-RLS-STRIKES.md` para la configuración del Sistema de Strikes (SQL + RLS)
- Ver `docs/analisis-union-proyectos.md` para entender la relación entre las dos apps web

---

## ✨ Características principales

### Core
✅ Autenticación segura con Supabase  
✅ Sincronización en tiempo real  
✅ Diseño responsive (móvil y escritorio)  
✅ Control de recaudación por método de pago  
✅ Protección de datos con permisos por rol  
✅ Modo offline parcial  

### PWA (Nuevo)
📱 **Instalable** como app nativa  
🔄 **Service Worker** para caché inteligente  
⚡ **Fast loading** con estrategias de caché  
🔔 **Push notifications** (preparado para futuro)  
📦 **Iconos adaptativos** para todos los dispositivos  
🎯 **Shortcuts** rápidos a paneles  

### Panel Admin (Nuevo)
🏠 **Historial de direcciones** por cliente  
🔍 **Búsqueda automática** al ingresar teléfono  
⚠️ **Confirmación obligatoria** de direcciones  
✨ **Resaltado visual** de campos autocompletados  
📊 **Múltiples direcciones** con contador de uso  

### Sistema de Strikes (Nuevo)
🚫 **Clientes en Revisión**: panel dedicado con baneados, observación y descartes  
🧪 **Modo práctica** sin BD (datos inventados + semilla) para aprender el sistema  
🟢 **Modo real (BD)** contra Supabase, alternable al instante  
⛔ **Bloqueo de pedidos** para clientes baneados (admin y repartidor)  
📜 **Historial de decisiones** (quién y cuándo, 5 motivos oficiales)  

---

## 🐛 Soporte y troubleshooting

### Problemas comunes

**No se puede instalar la PWA:**
- Verificar que estés usando HTTPS
- Verificar que los iconos estén en `/icons/`
- Limpiar caché y probar en modo incógnito

**Service Worker no se registra:**
- Abrir DevTools (F12) → Application → Service Workers
- Verificar que no haya errores
- Hacer hard refresh (Ctrl + Shift + R)

**Problemas de sincronización:**
- Verificar conexión a internet
- Verificar credenciales de Supabase correctas
- Revisar consola de errores (F12)

**Otros problemas:**
- Usar un servidor web (no abrir archivos directamente)
- Limpiar caché del navegador (Ctrl + Shift + R)
- Verificar que estés logueado correctamente

---

## 📚 Documentación adicional

- `docs/SETUP-RLS-STRIKES.md` - SQL y RLS del Sistema de Strikes (instrucciones de activación)
- `docs/analisis-union-proyectos.md` - Relación entre el POS web y la PWA de reparto

---

## 🎨 Colores del proyecto

```css
/* Gradiente principal */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Tema PWA */
Theme color: #667eea
Background: #667eea
```

---

## 🚀 Próximas mejoras

- [ ] Notificaciones push en tiempo real
- [ ] Geolocalización de repartidores
- [ ] Tracking de entregas en mapa
- [ ] Firma digital del cliente
- [ ] Escaneo QR de pedidos
- [ ] Modo offline completo
- [ ] Analytics y reportes avanzados

---

## 📝 Changelog

### v2.2.0 (20/09/2026) - Auditoría PWA
- 🔧 Rutas de redirección `/repatosabrofood/...` (deploy antiguo) reemplazadas por relativas `../index.html`
- 🔄 Service Worker: historial.* y strikes.* pasan a estrategia Network First (adiós al problema de caché vieja)
- 🧹 Eliminado `shared/auth.js` (legacy sin uso) de las 6 páginas
- 📚 README actualizado con el Sistema de Strikes

### v2.1.0 (20/09/2026) - Sistema de Strikes
- 🚫 Panel "Clientes en Revisión" con baneados, observación y descartes
- 🧪 Modo práctica (datos inventados) + 🟢 Modo real (Supabase) alternables desde el panel
- ⛔ Bloqueo de pedidos para clientes baneados (admin y repartidor)
- 📜 Historial de decisiones con 5 motivos oficiales
- 🔀 Conmutador de capa de datos (demo/supabase) con la misma API `{data,error}`

### v1.2.0 (27/02/2026) - PWA Implementation
- ✨ Implementación completa de PWA
- 📱 Manifest.json configurado
- 🔄 Service Worker con caché inteligente
- 🎨 Carpeta de iconos preparada
- 📚 Documentación PWA completa

### v1.1.0 (26/02/2026) - UX Improvements
- ✨ Sistema de historial de direcciones
- ⚠️ Checkbox de confirmación obligatorio
- 🎨 Resaltado visual de campos autocompletados
- 🏠 Selector de direcciones múltiples
- 🔍 Búsqueda automática por teléfono

---

Desarrollado con ❤️ para optimizar entregas de delivery
