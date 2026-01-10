# 📱 Guía: Trabajar en el Repositorio desde tu Móvil

Esta guía te ayudará a editar y desarrollar en este repositorio directamente desde tu teléfono móvil.

---

## 🚀 Opciones para Desarrollo Móvil

### Opción 1: GitHub Codespaces (Recomendado) ⭐

GitHub Codespaces te permite ejecutar un entorno de desarrollo completo en la nube, accesible desde cualquier navegador móvil.

#### Cómo usar Codespaces desde el móvil:

1. **Abrir desde GitHub Mobile:**
   - Instala la app **GitHub Mobile** (iOS/Android)
   - Abre este repositorio: `nutria005/sabrofood-pedidos`
   - Toca el menú de tres puntos (⋮)
   - Selecciona "Open in Codespaces" o "Nuevo Codespace"

2. **Abrir desde el navegador:**
   - Ve a: https://github.com/nutria005/sabrofood-pedidos
   - Presiona el botón verde **Code**
   - Selecciona la pestaña **Codespaces**
   - Click en **Create codespace on main** (o en tu rama)

3. **Acceso rápido:**
   - URL directa: `https://github.com/codespaces`
   - Desde ahí verás todos tus codespaces activos

#### Ventajas de Codespaces:
- ✅ VS Code completo en el navegador
- ✅ Terminal integrado
- ✅ Extensiones preinstaladas
- ✅ Live Server para previsualizar cambios
- ✅ Git integrado para commits y push
- ✅ 60 horas gratis al mes en cuenta personal

---

### Opción 2: Gitpod 🟠

Gitpod es una alternativa a Codespaces que también funciona en móviles.

#### Cómo usar Gitpod:

1. **Abrir con un click:**
   - URL directa: https://gitpod.io/#https://github.com/nutria005/sabrofood-pedidos
   - O agrega el prefijo `gitpod.io/#` antes de cualquier URL de GitHub

2. **Desde el navegador móvil:**
   - Ve a https://gitpod.io/workspaces
   - Inicia sesión con GitHub
   - Crea un nuevo workspace desde este repo

#### Ventajas de Gitpod:
- ✅ 50 horas gratis al mes
- ✅ Configuración personalizada (ver `.gitpod.yml`)
- ✅ Soporte para múltiples navegadores
- ✅ Prebuilds automáticos

---

### Opción 3: GitHub Mobile App (Edición Simple) 📝

Para cambios rápidos sin necesidad de un IDE completo:

1. **Instalar GitHub Mobile:**
   - iOS: https://apps.apple.com/app/github/id1477376905
   - Android: https://play.google.com/store/apps/details?id=com.github.android

2. **Editar archivos:**
   - Abre el repositorio
   - Navega al archivo que quieres editar
   - Toca el ícono de lápiz (✏️)
   - Realiza tus cambios
   - Commit directamente desde la app

#### Limitaciones:
- ⚠️ No tiene Live Preview
- ⚠️ No tiene autocompletado de código
- ⚠️ Mejor para cambios pequeños

---

### Opción 4: Editores Móviles Especializados 📲

#### Spck Editor (Android/iOS)
- App: https://spck.io
- Permite clonar repos de GitHub
- Live Preview integrado
- Soporte para HTML/CSS/JS
- Git integrado

#### Working Copy (iOS)
- App: https://workingcopyapp.com
- Cliente Git completo para iOS
- Edición de código con sintaxis
- Integración con shortcuts de iOS

#### Code Editor (Android)
- App disponible en Play Store
- Editor de código ligero
- Soporte Git básico
- Vista previa HTML

---

## 🛠️ Configuración del Entorno

### Extensiones Recomendadas (en Codespaces/Gitpod):

Las siguientes extensiones están preconfiguradas:

- **Live Server**: Vista previa en tiempo real
- **Prettier**: Formateo automático de código
- **Auto Rename Tag**: Renombra etiquetas HTML automáticamente
- **ESLint**: Linting de JavaScript
- **Tailwind CSS IntelliSense**: Autocompletado de clases

### Puertos Configurados:

- **5500**: Live Server (servidor de desarrollo)
- **3000**: Puerto alternativo
- **8000**: Servidor HTTP simple

---

## 💡 Tips para Desarrollo Móvil

### Navegación Eficiente:

1. **Atajos de teclado en VS Code Web:**
   - \`Cmd/Ctrl + P\`: Buscar archivos rápido
   - \`Cmd/Ctrl + Shift + F\`: Buscar en todos los archivos
   - \`Cmd/Ctrl + B\`: Toggle sidebar (más espacio)

2. **Terminal móvil:**
   - Usa el teclado en pantalla
   - Para comandos largos, cópialos desde notas
   - Usa el historial con flecha arriba ↑

3. **Modo landscape (horizontal):**
   - Mejor experiencia de código
   - Más espacio para editor y terminal

### Workflow Recomendado:

\`\`\`bash
1. Abrir Codespace/Gitpod desde móvil
2. Hacer cambios en el código
3. Probar con Live Server
4. Commit y push desde la interfaz
5. Ver cambios en producción
\`\`\`

### Comandos Git Útiles:

\`\`\`bash
# Ver estado
git status

# Ver cambios
git diff

# Agregar archivos
git add .

# Commit
git commit -m "Descripción del cambio"

# Push
git push

# Crear nueva rama
git checkout -b nombre-rama

# Ver ramas
git branch
\`\`\`

---

## 🔧 Solución de Problemas

### Codespace no carga:
- Verifica tu conexión a internet
- Recarga la página (F5)
- Borra caché del navegador
- Prueba en modo incógnito

### Live Server no funciona:
1. Click derecho en \`repatosabrofood/index.html\`
2. Selecciona "Open with Live Server"
3. O usa el comando: \`Live Server: Open\`

### No puedo hacer push:
- Verifica que tengas permisos en el repo
- Asegúrate de estar en la rama correcta
- Revisa que estés autenticado en GitHub

### Teclado móvil molesto:
- Usa un teclado Bluetooth
- Conecta un mouse Bluetooth para mejor control
- Activa el modo escritorio en el navegador

---

## 📊 Comparación de Opciones

| Característica | Codespaces | Gitpod | GitHub Mobile | Spck Editor |
|----------------|-----------|--------|---------------|-------------|
| **IDE Completo** | ✅ | ✅ | ❌ | ⚠️ Básico |
| **Terminal** | ✅ | ✅ | ❌ | ❌ |
| **Live Preview** | ✅ | ✅ | ❌ | ✅ |
| **Gratuito** | 60h/mes | 50h/mes | ✅ | ✅ |
| **Offline** | ❌ | ❌ | ⚠️ Limitado | ✅ |
| **Setup** | Automático | Automático | Instalación | Instalación |

---

## 🎯 Casos de Uso

### Edición Rápida (5-10 min):
**GitHub Mobile App**
- Mejor para: Cambios de texto, correcciones
- No requiere: Configuración adicional

### Desarrollo Completo (30+ min):
**Codespaces o Gitpod**
- Mejor para: Nuevas features, debugging
- Requiere: Navegador moderno, buena conexión

### Trabajo Offline:
**Spck Editor o Working Copy**
- Mejor para: Viajes, lugares sin WiFi
- Requiere: Clonar repo previamente

---

## 🌟 Mejores Prácticas

1. **Haz commits frecuentes:**
   - Guarda tu trabajo regularmente
   - Los codespaces pueden expirar

2. **Usa ramas:**
   - No trabajes directo en \`main\`
   - Crea ramas descriptivas: \`feature/nueva-funcionalidad\`

3. **Sincroniza antes de editar:**
   \`\`\`bash
   git pull origin main
   \`\`\`

4. **Prueba antes de commitear:**
   - Usa Live Server
   - Verifica en diferentes tamaños de pantalla

5. **Cierra codespaces inactivos:**
   - Ahorra horas de tu plan gratuito
   - Ve a: https://github.com/codespaces

---

## 🔗 Enlaces Útiles

- **GitHub Codespaces:** https://github.com/features/codespaces
- **Gitpod:** https://www.gitpod.io
- **GitHub Mobile:** https://mobile.github.com
- **Documentación de este proyecto:** [README.md](../README.md)
- **Configuración de Supabase:** [SETUP-RLS.md](../repatosabrofood/docs/SETUP-RLS.md)

---

## 📞 Soporte

¿Problemas o preguntas?
- Abre un **Issue** en el repositorio
- Consulta la documentación de GitHub
- Comunícate con el equipo

---

**¡Ahora puedes trabajar en el proyecto desde cualquier lugar! 🚀📱**
