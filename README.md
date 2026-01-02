# 🐶 SabroFood - Sistema de Pedidos

Sistema de gestión de pedidos para local de comidas con interfaz diferenciada para repartidores y administradores.

## 🚀 Características

- 🔐 **Autenticación segura** con Firebase Authentication
- 🚚 **Interfaz para Repartidores**: Ver pedidos, marcar entregas, control de recaudación
- 🏢 **Panel de Administración**: Crear, editar y eliminar pedidos, estadísticas completas
- 📱 **Diseño Responsive**: Optimizado para móviles y tablets
- ⚡ **Modo Offline**: Disponible para repartidores
- 🎨 **UI/UX Moderna**: Animaciones suaves y diseño intuitivo

## 🛠️ Tecnologías

- HTML5 + CSS3 + JavaScript (ES6+)
- Firebase Authentication
- Firebase Firestore (para futura implementación de base de datos)
- Google Fonts (Inter)

## 📋 Requisitos Previos

1. Cuenta de Google/Firebase
2. Navegador moderno (Chrome, Firefox, Edge, Safari)

## ⚙️ Configuración

### 1. Crear proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto llamado "sabrofood-pedidos"
3. Habilita **Authentication** → **Email/Password**
4. Ve a **Project Settings** → copia tu configuración

### 2. Configurar credenciales

Edita el archivo `repatosabrofood/shared/firebase-config.js` y reemplaza con tus credenciales:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "tu-app-id"
};
```

### 3. Crear usuarios de prueba

En Firebase Console → Authentication → Users, crea:

**Administrador:**
- Email: `admin@sabrofood.com`
- Contraseña: `0603` (cambiar en producción)

**Repartidor:**
- Email: `repartidor@sabrofood.com`
- Contraseña: `0603` (cambiar en producción)

## 🚀 Uso

1. Abre `repatosabrofood/index.html` en tu navegador
2. Inicia sesión con las credenciales creadas
3. Selecciona tu rol (Repartidor o Local/Admin)

## 📁 Estructura del Proyecto

```
sabrofood-pedidos/
├── README.md
└── repatosabrofood/
    ├── index.html          # Página de login y selección de rol
    ├── _redirects          # Configuración para deployment
    ├── shared/
    │   ├── firebase-config.js   # Configuración de Firebase
    │   └── auth-guard.js        # Protección de rutas
    ├── local/
    │   └── index.html      # Panel de administración
    └── repartidor/
        └── index.html      # Interfaz para repartidores
```

## 🔐 Seguridad

- ✅ Autenticación manejada por Firebase (Google)
- ✅ Sin contraseñas hardcodeadas en el código
- ✅ Protección de rutas con auth-guard
- ✅ Sesiones seguras gestionadas automáticamente

## 🚧 Próximas Mejoras

- [ ] Integrar Firestore para almacenar pedidos
- [ ] Sistema de roles en base de datos
- [ ] Notificaciones push para repartidores
- [ ] Dashboard con estadísticas y gráficos
- [ ] Exportar reportes en PDF/Excel
- [ ] App móvil con React Native

## 📝 Licencia

Proyecto personal - Todos los derechos reservados

## 👤 Autor

**nutria005**
- GitHub: [@nutria005](https://github.com/nutria005)

---

💡 **Nota**: Este proyecto fue creado como sistema de gestión para un negocio local. Si encuentras bugs o tienes sugerencias, abre un issue.

