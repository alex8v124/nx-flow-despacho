# Nodux Flow · Playbook de Venta y Guión de Demo en 10 Segundos

> **Propósito:** Herramienta de combate comercial para reuniones B2B y prospección en LinkedIn dirigida a dueños de distribuidoras ferreteras, eléctricas, constructoras e industriales.

---

## 🎯 El Posicionamiento Quirúrgico

### El Error del Ingeniero Genérico vs. El Pitch de Nodux

❌ **El Freelancer Genérico:**
> *"Hago páginas web, apps móviles, bases de datos, arreglos de computadoras y tiendas online en Shopify."*  
> **Resultado:** El cliente asume que no eres especialista en nada, te regatea y te compara con un estudiante de S/ 300.

✔ **Nodux:**
> *"Somos especialistas en terminales móviles de despacho rápido para distribuidoras B2B. Eliminamos la fuga de ventas que ocurre cuando tus vendedores demoran 5 minutos buscando códigos en PDFs mientras el cliente cotiza con tu competencia por WhatsApp."*  
> **Resultado:** Cierre de S/ 2,500 de Setup + S/ 300/mes de mantenimiento (MRR). No compites con freelancers.

---

## ⏱️ El Guión de la Demo en Vivo (10 Segundos)

**Preparación:** Abrir la terminal en el smartphone o tablet (o compartir pantalla en meet/zoom con vista mobile activa).

### Paso a paso de la reunión:

1. **El Gancho (Primeros 60 segundos):**
   > *"Don [Nombre del Dueño], ¿cuántas veces al día entra un cliente por WhatsApp o al mostrador pidiendo cotización de 3 productos, y el vendedor tiene que abrir un PDF de 40 páginas o preguntarle por radio al encargado de almacén si queda stock?"*
   >
   > *"Cada minuto que el cliente espera con el chat abierto, le escribe a tres distribuidores más. Hoy gana el que responde primero con el precio exacto y el stock reservado."*

2. **La Demostración en Vivo (10 segundos cronometrados):**
   > *"Mire mi pantalla. Hagamos el pedido de un maestro de obra ahora mismo:"*
   - **Segundo 1:** Teclear `110` en el buscador → aparece al instante `Tubo PVC desagüe 4" x 3 m`. Tap en `[+]` (2 unidades).
   - **Segundo 4:** Teclear `sold` → tap en `Soldadura E6011` (1 kg).
   - **Segundo 7:** Tap en la barra inferior **"Despachar (S/ 96.90)"**.
   - **Segundo 9:** Tap en **"Factura"**, ingresar RUC o dejar en Boleta rápida.
   - **Segundo 10:** Tap en **"Enviar pedido por WhatsApp"**.
   - **Resultado en pantalla:** Se abre WhatsApp directamente con el pedido formateado:
     ```
     *PEDIDO NF-A7B81C2D*
     Sede: Lima · Cercado
     Fecha: 06/11/2026, 11:42
     Vendedor: Carlos

     *2 x* Tubo PVC desagüe 4" x 3 m
         TUB-PVC-110 · UND · S/ 38.50 c/u → S/ 77.00
     *1 x* Soldadura E6011 1/8"
         SOL-601-018 · KG · S/ 19.90 c/u → S/ 19.90

     Op. gravada: S/ 82.12
     IGV 18%: S/ 14.78
     *TOTAL: S/ 96.90*

     ✅ Stock reservado en sistema
     _Despachado con Nodux Flow_
     ```
   - **El Cierre Visual:** Mostrar el cronómetro de la terminal: *"9.4 segundos del primer producto al WhatsApp del cliente con stock descontado."*

---

## 🛡️ Manejo de Objeciones Técnicas y Operativas

### 1. *"Ya tenemos un ERP (StarSoft / Concar / Odoo / Excel)"*
> **Respuesta:**  
> *"Nodux Flow no viene a cambiar su sistema administrativo ni su contabilidad. Es una terminal ligera de mostrador que resuelve la **última milla**: la velocidad de captura del vendedor. Su ERP sigue manejando la contabilidad general; nosotros le alimentamos las ventas sin fricción."*

### 2. *"En el almacén o depósito se va la señal de internet a cada rato"*
> **Respuesta:**  
> *"Precisamente por eso no es una página web común. Es una PWA offline-first con catálogo en memoria. Si se cae la red, el vendedor sigue cotizando y atendiendo. En cuanto recupera señal, el sistema sincroniza automáticamente las reservas en cola."*

### 3. *"¿Qué pasa si dos vendedores venden el mismo último tubo en diferentes sedes?"*
> **Respuesta:**  
> *"Nuestra arquitectura corre sobre Amazon DynamoDB con escrituras atómicas condicionales (la misma tecnología con la que se procesan transacciones bancarias). El primer pedido en entrar bloquea el stock; el segundo recibe una alerta inmediata en pantalla indicando que la unidad ya fue tomada, evitando comprometer productos inexistentes."*

---

## 💰 Estructura de Precios y Regla de Cobro

| Concepto | Monto | Modalidad |
|---|---|---|
| **Setup Base Nodux Flow** | **S/ 1,800 – S/ 3,500** | **50% de anticipo** antes de iniciar despliegue / **50% contra entrega** operativa |
| **Mantenimiento Mensual (MRR)** | **S/ 250 – S/ 350 / mes** | Soporte, hosting Serverless AWS, actualizaciones y respaldo de catálogo |
| **Módulo Facturación SUNAT (Up-Sell)** | + S/ 800 setup | Integración con PSE (Nubefact / Facturador) para emisión automática |
| **Módulo Pasarela Culqi / QR (Up-Sell)** | + S/ 600 setup | Checkout con tarjeta o QR dinámico Yape/Plin |

> **Regla de Oro:** *"50% de anticipo acreditado en cuenta corriente antes de clonar repositorios o desplegar código en AWS."* Sin excepciones.

---

## 📲 Mensajes de Prospección para LinkedIn / WhatsApp B2B

### Mensaje InMail / Conexión (Dirigido a Gerentes Comerciales / Dueños):
```
Hola [Nombre], estuve revisando el catálogo y la rotación de [Nombre de Empresa].

Muchos distribuidores en Lima me comentan que pierden entre 3 y 5 ventas semanales simplemente porque sus vendedores tardan 5 minutos en responder cotizaciones por WhatsApp buscando códigos en PDFs o consultando stock por teléfono.

En Nodux desarrollamos una terminal móvil ultraligera que le permite a tus vendedores armar un pedido formal con IGV y enviarlo al WhatsApp del cliente en menos de 10 segundos, con stock reservado en tiempo real.

¿Te interesaría ver una demo interactiva de 3 minutos directo en tu celular?
```
