# 📘 Guía de Uso: Sistema de Pago Mixto

## 🎯 Concepto

Un **Pago Mixto** ocurre cuando un cliente paga un pedido parte en efectivo/débito y parte en transferencia.

**Ejemplo:**
- Pedido total: $30.000
- Cliente paga: $15.000 en efectivo + $15.000 en transferencia

---

## 🔄 Estados del Pago Mixto

### 1️⃣ Pago Mixto (Pendiente) - `PM`

**¿Cuándo usarlo?**
- El repartidor acaba de entregar el pedido
- El cliente pagó parte en efectivo y parte en transferencia
- **La transferencia NO ha sido confirmada aún por el local**

**Cómo registrarlo:**
1. Selecciona método de pago: `🔀 Pago Mixto (Pendiente)`
2. En el campo **Notas**, escribe el monto en efectivo:
   ```
   15000 efectivo resto transf
   ```

**Efecto en los totales:**
- ✅ **Dinero a Rendir (Repartidor):** +$15.000 (solo efectivo)
- ✅ **Total Local (Venta):** +$15.000 (solo efectivo, la transferencia no cuenta hasta confirmarse)

---

### 2️⃣ Pago Mixto (Pagado) - `PMP`

**¿Cuándo usarlo?**
- El local confirmó que **llegó la transferencia** al banco
- Cambias el estado del pedido de "Pendiente" a "Pagado"

**Cómo actualizarlo:**
1. Edita el pedido
2. Cambia método de pago a: `✅ Pago Mixto (Pagado)`
3. Mantén las notas con el monto:
   ```
   15000 efectivo resto transf
   ```

**Efecto en los totales:**
- ✅ **Dinero a Rendir (Repartidor):** +$15.000 (solo efectivo, sin cambios)
- ✅ **Total Local (Venta):** +$30.000 (TOTAL COMPLETO, transferencia confirmada)

---

## 📝 Formato de Notas

El sistema reconoce estos formatos:

```
15000 efectivo resto transf
15000 efectivo
15.000 efectivo resto transferencia
$15000 efectivo
15000 efec resto transf
15000 pesos efectivo
```

### ⚠️ Importante:
- **Siempre escribe el monto en efectivo primero**
- Si no escribes notas, el sistema asume **100% transferencia** (para proteger al repartidor)

---

## 💡 Ejemplo Completo

### Escenario:
Cliente pide comida por $30.000. Paga $20.000 en efectivo y $10.000 en transferencia.

### Paso 1: Registro del Pedido
1. Crear pedido normal con total $30.000
2. Método de pago: `🔀 Pago Mixto (Pendiente)`
3. Notas: `20000 efectivo resto transf`

**Resultado:**
- Dinero a Rendir: $20.000
- Total Local: $20.000

### Paso 2: Confirmación de Transferencia
1. Verificar que llegó la transferencia al banco
2. Editar el pedido
3. Cambiar a: `✅ Pago Mixto (Pagado)`

**Resultado:**
- Dinero a Rendir: $20.000 (sin cambios)
- Total Local: $30.000 (ahora suma el total completo)

---

## 🛡️ Seguridad

El sistema **protege al repartidor**:
- Si olvidas escribir las notas, asume **100% transferencia**
- El repartidor **nunca** tendrá que pagar de más
- Recibirás una alerta si falta información

---

## 🔍 Verificación

En el panel de **Recaudación del Día** verás:

```
💰 TOTAL RECAUDADO: $20.000
🏢 TOTAL LOCAL (Venta): $30.000

💵 Efectivo: $20.000
✅ Transf. Pagadas: $10.000
```

---

## ❓ Preguntas Frecuentes

**P: ¿Qué pasa si no escribo notas?**  
R: El sistema asume 100% transferencia para proteger al repartidor.

**P: ¿Puedo cambiar de Pendiente a Pagado varias veces?**  
R: Sí, puedes editar el estado las veces que necesites.

**P: ¿Afecta al repartidor cambiar a "Pagado"?**  
R: No, el dinero que debe rendir siempre es solo el efectivo que recibió.

**P: ¿Qué pasa con los pedidos antiguos?**  
R: El sistema mantiene compatibilidad con pagos mixtos anteriores (con emojis).

---

## 📊 Resumen de Lógica

| Método de Pago | Dinero a Rendir | Total Local |
|----------------|-----------------|-------------|
| **Efectivo** | 100% | 100% |
| **Débito/Crédito** | 100% | 100% |
| **Transferencia Pendiente** | 0% | 100% |
| **Transferencia Pagada** | 0% | 100% |
| **Pago Mixto (Pendiente)** | Solo efectivo | Solo efectivo |
| **Pago Mixto (Pagado)** | Solo efectivo | 100% total |

---

✅ **Sistema actualizado el 2 de enero de 2026**
