# Nodux Flow · Terminal Transaccional Ligera

> **Especialistas en terminales móviles de despacho rápido para distribuidoras B2B.**  
> Elimina los 5 minutos de fricción por cotización en WhatsApp y los PDFs desactualizados. Diseñada con arquitectura **AWS Serverless Well-Architected** para operar con costo fijo cercano a cero y escalar a millones de transacciones.

---

## ⚡ Especificación en 3 Capas

```
┌────────────────────────────────────────────────────────┐
│  CAPA 01: FRONTEND PWA (Mostrador Mobile-First)         │
│  · Bundle < 150 KB (Actual: ~84.5 KB gzip)              │
│  · In-Memory Search con debounce 150 ms (sin HTTP)     │
│  · Botones táctiles ergonomía mostrador (> 60 px)      │
│  · Salida wa.me con payload consolidado en Soles       │
│  · Service Worker offline-first (tolerante a bodega)   │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / JSON
┌──────────────────────────▼─────────────────────────────┐
│  CAPA 02: BACKEND SERVERLESS (AWS Core)                 │
│  · CloudFront + S3 (Hosting estático global, ~$1/mes)   │
│  · HTTP API Gateway v2 + Lambda (Node.js 22, ARM64)    │
│  · Amazon DynamoDB Single-Table (Pay-Per-Request)      │
│  · Conditional Writes (stock >= qty) anti-sobreventa   │
└──────────────────────────┬─────────────────────────────┘
                           │ Webhooks & Eventos
┌──────────────────────────▼─────────────────────────────┐
│  CAPA 03: CONECTORES MODULARES (Setup Up-Sell)          │
│  · Facturación Electrónica SUNAT (Nubefact / PSE)       │
│  · Pasarelas de Pago B2B (Culqi / QR Yape / Plin)       │
│  · Extractor Legacy (Sincronización Excel/SQL a Dynamo) │
└────────────────────────────────────────────────────────┘
```

---

## 📦 Estructura del Repositorio

```
nodux-flow/
├── shared/
│   └── catalog.json             # Catálogo de prueba (40 SKUs x 3 sedes industriales)
├── frontend/                    # PWA React 19 + Tailwind v4 + Vite
│   ├── src/
│   │   ├── components/          # ProductRow, CheckoutBar, CheckoutSheet, icons
│   │   ├── lib/                 # search (in-memory), money, storage, whatsapp, api
│   │   ├── hooks.js             # useDebounce, useOnline, useNow
│   │   └── App.jsx              # Terminal principal mobile-first
│   ├── public/                  # Manifest PWA, Service Worker, iconos SVG
│   └── scripts/bundle-report.mjs # Verificación estricta del bundle (< 150 KB)
├── backend/                     # Microservicio AWS Lambda + DynamoDB Single-Table
│   ├── src/
│   │   ├── handler.mjs          # Router ligero v2 para API Gateway
│   │   ├── repository.mjs       # TransactWriteItems con Conditional Writes
│   │   ├── service.mjs          # Precios del servidor, idempotencia bancaria
│   │   ├── validation.mjs       # Sanitización, validación RUC módulo 11
│   │   └── integrations/        # Adaptadores desacoplados de Nubefact y Culqi
│   ├── scripts/
│   │   ├── seed.mjs             # Poblador del catálogo en DynamoDB
│   │   ├── local-server.mjs     # Servidor HTTP local contra DynamoDB Local
│   │   └── concurrency-demo.mjs # Benchmark de concurrencia y no-sobreventa
│   └── test/                    # Suite nativa node:test (unitarios + integración)
├── infra/
│   ├── template.yaml            # Plantilla AWS SAM (CloudFront + S3 + Lambda + DynamoDB)
│   ├── deploy.ps1               # Despliegue automatizado para Windows
│   └── deploy.sh                # Despliegue automatizado para Linux / macOS
├── PITCH_PLAYBOOK.md            # Argumentario comercial y guión de demo en 10s
└── docker-compose.yml           # Entorno DynamoDB Local para desarrollo
```

---

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Levantar la terminal Frontend en desarrollo
```bash
npm run dev
# Abrir http://localhost:5173
```
*La terminal funciona 100% en modo local de demostración sin necesidad de backend, utilizando el catálogo precargado y emitiendo los pedidos consolidados a WhatsApp.*

### 3. Ejecutar suite de pruebas de Backend
```bash
npm test
# Ejecuta 19 pruebas: validaciones de entrada, RUC SUNAT módulo 11,
# idempotencia por UUID, cálculo de IGV y transacciones DynamoDB.
```

### 4. Verificar tamaño del Bundle (< 150 KB)
```bash
npm run build
# Compila con Vite y reporta los KBs gzippeados por archivo. Objetivo: < 150 KB.
```

### 5. (Opcional) Levantar DynamoDB Local y probar concurrencia
```bash
# Iniciar contenedor de DynamoDB Local
npm run db:up

# Inicializar tabla y cargar catálogo
npm run db:init

# Levantar microservicio API local
npm run api:local

# Ejecutar benchmark de contención y sobreventa con 40 vendedores concurrentes
npm run test:concurrency
```

---

## ☁️ Despliegue en AWS (Ruta AWS Partner)

El stack está parametrizado con **AWS SAM (Serverless Application Model)** bajo los principios del **AWS Well-Architected Framework**:

1. **Eficiencia de Rendimiento:** Lambda en procesadores Graviton3 (ARM64) y CloudFront Edge Caching para activos estáticos.
2. **Optimización de Costos (FinOps):** Facturación por petición en DynamoDB (`PAY_PER_REQUEST`), Lambda sin costos de inactividad y S3 + CloudFront (< $1 USD / mes en reposo).
3. **Fiabilidad:** Single-Table DynamoDB con respaldo Point-In-Time (PITR) y escrituras atómicas condicionales que garantizan cero sobreventa entre sedes concurrentes.

### Comando de despliegue
```powershell
.\infra\deploy.ps1 -StackName "nodux-flow-prod" -Region "us-east-1"
```
o en Linux/macOS:
```bash
chmod +x ./infra/deploy.sh
./infra/deploy.sh nodux-flow-prod us-east-1 prod
```

---

## 💼 Regla Comercial y Posicionamiento

- **Regla de Cobro 50/50:** 50% de anticipo acreditado en banco antes de clonar repositorios o desplegar código en AWS; 50% contra conformidad operativa en mostrador.
- **Ticket Promedio Validado:** Setup base de **S/ 1,800 a S/ 3,500** para catálogos estándar de alta rotación (300 a 500 SKUs), con recurrencia mensual (MRR) de **S/ 250 a S/ 350**.
- **Up-Sells Modulares:** Conector SUNAT (Facturación electrónica con Nubefact) y Pasarela Culqi / QR Yape/Plin como tarifas de integración independientes.
