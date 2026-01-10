FROM gitpod/workspace-full

# Instalar herramientas adicionales si es necesario
RUN sudo apt-get update && \
    sudo apt-get install -y \
    vim \
    nano \
    && sudo rm -rf /var/lib/apt/lists/*

# Configurar git para mejor experiencia móvil
RUN git config --global core.editor "nano"

# Mensaje de bienvenida
RUN echo '#!/bin/bash\necho "✨ Entorno listo para desarrollo móvil ✨"' > /usr/local/bin/welcome && \
    chmod +x /usr/local/bin/welcome
