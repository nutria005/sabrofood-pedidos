# sabrofood-pedidos
"Sistema de pedidos para mi local".

## 🚀 Configuración

### Requisitos Previos
- Cuenta de Supabase (https://supabase.com)
- Navegador web moderno

### Configuración de Supabase

#### 1. Crear Proyecto en Supabase
1. Accede a https://supabase.com y crea una cuenta
2. Crea un nuevo proyecto
3. Anota la URL del proyecto y la clave anon (API Key)

#### 2. Configurar Autenticación
1. En tu proyecto de Supabase, ve a **Authentication** > **Providers**
2. Habilita **Email** como proveedor de autenticación
3. Desactiva "Confirm email" si quieres registro sin confirmación

#### 3. Crear Usuarios
En **Authentication** > **Users**, crea los siguientes usuarios:

**Usuario Admin:**
- Email: `admin@sabrofood.com`
- Password: `Raquel0603`

**Usuario Repartidor:**
- Email: `repartidor@sabrofood.com`
- Password: `Raquel0603`

#### 4. Configurar Tabla de Pedidos
Si aún no existe, crea la tabla `pedidos` en **Database** > **Tables** con los campos necesarios para tu aplicación.

#### 5. Actualizar Credenciales
Si usas tus propias credenciales de Supabase, actualiza el archivo `repatosabrofood/shared/supabase-config.js`:

```javascript
const SUPABASE_CONFIG = {
  url: 'TU_PROJECT_URL',
  anonKey: 'TU_ANON_KEY',
  tabla: 'pedidos'
};
```

### 🔐 Credenciales de Prueba

**Proyecto de Demo:**
- URL: `https://bhjgcpjsjofuohacyise.supabase.co`
- Anon Key: Ya configurada en el código

**Usuarios de Prueba:**
- Admin: `admin@sabrofood.com` / `Raquel0603`
- Repartidor: `repartidor@sabrofood.com` / `Raquel0603`

### 📦 Deployment

#### Netlify / Vercel
1. Conecta tu repositorio
2. Configura el directorio de publicación: `repatosabrofood`
3. No requiere comandos de build
4. Asegúrate de que las variables de entorno de Supabase estén configuradas

#### GitHub Pages
1. Ve a Settings > Pages
2. Selecciona la rama a publicar
3. El sistema funcionará directamente desde `/repatosabrofood/`

### 🧪 Testing Local

1. Clona el repositorio
2. Abre `repatosabrofood/index.html` en tu navegador
3. Usa las credenciales de prueba para iniciar sesión
4. Selecciona el rol (Repartidor o Local)
5. Prueba las funcionalidades de cada panel

### 🔒 Seguridad

- Las credenciales se manejan a través de Supabase Authentication
- Las sesiones son persistentes y se validan en cada carga de página
- Las rutas protegidas redirigen automáticamente al login si no hay sesión activa
- No se almacenan contraseñas en el código

### 📱 Funcionalidades

**Panel Admin (Local):**
- Crear, editar y eliminar pedidos
- Gestión completa de productos
- Resumen de recaudación
- Exportar datos
- Filtros avanzados

**Panel Repartidor:**
- Ver pedidos asignados
- Selector de perfil (Repartidor 1/2)
- Marcar entregas como completadas
- Control de recaudación
- Modo offline con sincronización automática
