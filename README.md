# GastroCloud - Sistema de Gestión Gastronómica

Sistema web completo de gestión para restaurantes y negocios gastronómicos, desarrollado con **Express.js**, **TypeScript**, **PostgreSQL** y **EJS**.

El alcance actual incluye registro de ventas por sucursal, control transaccional del stock y anulación por parte del administrador con reversión del movimiento. El precio unitario se ingresa al registrar cada venta; medios de pago, impuestos y facturación electrónica todavía no forman parte del flujo.

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- **Node.js** (versión 16 o superior)
  - Descargar desde: https://nodejs.org/
  
- **PostgreSQL** (versión 12 o superior)
  - Descargar desde: https://www.postgresql.org/download/
  - Durante la instalación, anota las credenciales (usuario y contraseña)
  - Por defecto: usuario `postgres` / contraseña `postgres`

## Instalación y Configuración

### 1. Clonar o descargar el repositorio

```bash
git clone <URL-DEL-REPOSITORIO>
cd GastroCloud
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar la base de datos (Opcional)

La base de datos debe existir antes de iniciar la aplicación. En desarrollo, la aplicación crea las tablas que faltan:

1. Abre PostgreSQL con pgAdmin o desde la terminal:
   ```bash
   psql -U postgres
   ```

2. Crea la base de datos:
   ```sql
   CREATE DATABASE gastrocloud;
   ```

3. Sale con `\q`

### 4. Configurar variables de entorno (Opcional)

Si necesitas cambiar la configuración por defecto, crea un archivo `.env` en la raíz del proyecto:

```env
# Puerto de la aplicación
PORT=3000

# Configuración de base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gastrocloud
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# Sesión
SESSION_SECRET=tu-secreto-seguro-aqui

# Credenciales de demostración (opcionales)
DEMO_ADMIN_USERNAME=admin
DEMO_ADMIN_EMAIL=admin@gastrocloud.local
DEMO_ADMIN_PASSWORD=Admin123*
DEMO_EMPLOYEE_USERNAME=empleado
DEMO_EMPLOYEE_EMAIL=empleado@gastrocloud.local
DEMO_EMPLOYEE_PASSWORD=Empleado123*
```

**Nota:** Si no creas el archivo `.env`, la aplicación usará valores por defecto que funcionan con una instalación estándar de PostgreSQL.

### 5. Migrar el alcance por empresa y sucursal

Antes de iniciar una versión con datos existentes, realiza un respaldo y aplica la migración de PostgreSQL:

```powershell
psql -h localhost -U postgres -d gastrocloud -f scripts\migrations\001_tenant_scope.sql
```

La migración conserva los datos y asigna empresa/sucursal a los registros históricos cuando puede inferir un único propietario. Los productos y categorías ahora son propios de una sucursal; el precio de venta también pertenece al producto local. El stock inicial parte de cero por defecto; si se carga o corrige una cantidad desde el catálogo, queda registrado un movimiento de ajuste. Los registros históricos cuya sucursal no puede inferirse de forma inequívoca quedan con `local_id` vacío para revisión y no aparecen en los catálogos de sucursal. No los reasignes automáticamente: contrasta compras, ventas y movimientos antes de resolverlos.

Las empresas nuevas reciben roles iniciales EMPLEADO, GERENTE y CONTADOR. Sus permisos pueden personalizarse sin afectar a otras empresas; el rol ADMIN permanece protegido. La migración no se ejecuta automáticamente ni debe correrse sin verificar el respaldo y la base de destino.

### Acceso de soporte GastroCloud

El registro de empresas sigue siendo público y cada empresa administra su propio personal. La empresa operadora de GastroCloud solo se usa para soporte; sus cuentas autorizadas acceden a empresas clientes en modo consulta desde `/soporte`. Se registran ingresos, salidas, consultas e intentos de modificación en **Actividad de soporte**, accesible para las empresas incluso con el plan Freemium. No se registran cuerpos de formularios ni parámetros de consulta. Si no se puede guardar la auditoría, se bloquea el acceso.

Para una base existente, realiza un respaldo y aplica también:

```powershell
psql -h localhost -U postgres -d gastrocloud -v ON_ERROR_STOP=1 -f scripts\migrations\002_support_access.sql
```

La migración no concede acceso global automáticamente. Un administrador de la base debe identificar y verificar explícitamente los UUID de la empresa operadora y su primer usuario administrador de GC. En `psql`, reemplaza ambos marcadores y ejecuta:

```sql
BEGIN;
UPDATE company SET is_support_operator = true
WHERE id = '<uuid-empresa-gc>' AND is_active = true
RETURNING id;

INSERT INTO support_account (user_id, can_manage_support)
SELECT u.id, true FROM "user" AS u
JOIN "local" AS l ON l.id = u.local_id AND l.company_id = u.company_id AND l.is_active = true
WHERE u.id = '<uuid-admin-gc>' AND u.company_id = '<uuid-empresa-gc>' AND u.is_active = true
RETURNING user_id;
```

Confirma que cada sentencia devolvió exactamente una fila y que corresponden a las identidades verificadas. Solo entonces ejecuta `COMMIT;`; de lo contrario, ejecuta `ROLLBACK;`. Las cuentas ordinarias de la empresa operadora no pueden iniciar sesión sin una fila de soporte. Solo el administrador de GC podrá crear cuentas de soporte adicionales desde el panel.

En producción, las cuentas de soporte necesitan una contraseña de al menos 12 caracteres y hasta 72 bytes; si al iniciar sesión la contraseña existente no cumple, la aplicación exige cambiarla antes de acceder. En desarrollo no se exige cambiar una contraseña existente para la demostración. Las cuentas de soporte nuevas requieren igualmente una contraseña de al menos 12 caracteres. El panel de inicio de sesión no muestra contraseñas de demostración. Las solicitudes de soporte que cambian el contexto o administran cuentas requieren un encabezado `Origin` del mismo origen; el proxy de despliegue debe conservar correctamente el protocolo y el host.

### Baja y pago de prueba

Un administrador de una empresa cliente puede darla de baja en **Mi empresa**, confirmando con su contraseña. Se bloquea el acceso de sus usuarios, incluidas las sesiones existentes en su próxima solicitud, sin borrar sus datos. GC conserva el acceso de soporte en modo consulta.

Para una base existente, realiza un respaldo y aplica también:

```powershell
psql -h localhost -U postgres -d gastrocloud -v ON_ERROR_STOP=1 -f scripts\migrations\003_premium_expiration.sql
```

La demostración de **Mi plan** está disponible únicamente en desarrollo y usa un pago único de prueba de $1 ARS. Para configurarla:

1. Crea una aplicación en [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app). En **Credenciales**, selecciona el entorno **Prueba** y copia el Access Token de prueba. Mercado Pago usa el prefijo `APP_USR` también en credenciales de prueba: verifica el entorno en el panel, no el prefijo.
2. Coloca el token exclusivamente en tu `.env` local como `MERCADOPAGO_TEST_ACCESS_TOKEN` y reinicia la aplicación. Nunca lo compartas ni lo agregues al repositorio.
3. Usa una [cuenta y tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases). Inicia sesión en una empresa cliente como administrador, abre **Mi plan** y pulsa **Abrir pago de prueba**.
4. Después de completar el checkout de prueba, vuelve manualmente a GastroCloud, actualiza **Mi plan** y pulsa **Verificar pago**. Mercado Pago no admite `localhost` como URL de retorno automático.

Solo se acepta un pago de prueba aprobado, de $1 ARS, de la empresa y preferencia correspondientes; el mismo pago no puede acreditarse dos veces. Premium dura 30 días y vuelve a Freemium al vencer o si el estado de la suscripción deja de estar activo. No hay renovación automática ni integración de pagos reales. Los Premium existentes sin fecha de vencimiento se conservan sin vencimiento.

### Roles personalizables: migración obligatoria

Para una base existente, aplica `scripts\migrations\004_company_roles.sql` **antes de iniciar esta versión**. La sincronización de desarrollo no modifica tablas existentes y la migración no se ejecuta automáticamente. Una instalación nueva con una base vacía no necesita esta migración.

La migración conserva usuarios y permisos al reemplazar el rol EMPLEADO compartido por un rol independiente de cada empresa. ADMIN sigue protegido; los demás roles de cada empresa pueden modificarse o eliminarse si no tienen usuarios asociados. El alcance por empresa o sucursal de cada rol existente se conserva al cambiarle el nombre. La gestión de roles sigue sujeta al plan; el soporte de GastroCloud continúa siendo de solo lectura.

1. Detén la aplicación y realiza un respaldo verificable de la base. En Render Free no hay backups automáticos; usa `pg_dump` con la conexión externa y guarda el archivo en un lugar seguro.
2. Desde la raíz del proyecto, ejecuta la migración contra la base correcta. Por ejemplo, en Windows con PostgreSQL instalado:

   ```powershell
   $env:PGSSLMODE = "require"
   psql -h <host-externo> -p 5432 -U <usuario> -d <base> -W -v ON_ERROR_STOP=1 -f scripts\migrations\004_company_roles.sql
   ```

   `psql` solicitará la contraseña. Para una base local sin TLS, omite la primera línea y usa el host local correspondiente. Nunca compartas las credenciales.
3. Si la migración informa un conflicto, no inicies la nueva versión: revisa el error y los datos. Tras completarla, despliega la nueva versión y vuelve a habilitar la aplicación.

La migración se registra para no volver a crear roles si se ejecuta de nuevo. Los permisos y asignaciones se actualizan en las sesiones activas en la siguiente solicitud.

## Ejecutar la Aplicación

### Modo desarrollo (con auto-reload)

```bash
npm run dev
```

La aplicación estará disponible en: **http://localhost:3000**

### Compilar TypeScript a JavaScript

```bash
npm run build
```

### Ejecutar producción (después de compilar)

```bash
npm start
```

## Credenciales de Prueba

Después de instalar, puedes acceder con estas credenciales:

### Administrador
- **Usuario:** `admin`
- **Contraseña:** `Admin123*`

### Empleado
- **Usuario:** `empleado`
- **Contraseña:** `Empleado123*`

## Estructura del Proyecto

```
src/
├── config/          # Configuración (BD, sesiones, variables de entorno)
├── controllers/     # Controladores (lógica de las rutas)
├── enums/          # Enumeraciones
├── interfaces/     # Interfaces TypeScript
├── middlewares/    # Middlewares (autenticación, validación, etc)
├── models/         # Modelos de Sequelize (ORM)
├── repositories/   # Capa de acceso a datos
├── routes/         # Definición de rutas
├── services/       # Lógica de negocio
├── types/          # Tipos TypeScript personalizados
├── utils/          # Utilidades
├── validators/     # Validadores
├── views/          # Plantillas EJS
└── public/         # Archivos estáticos (CSS, JS, imágenes)
```

## Solución de Problemas

### Error: "connect ECONNREFUSED 127.0.0.1:5432"
**Problema:** PostgreSQL no está corriendo.
**Solución:** 
- En Windows: Abre Services y busca "PostgreSQL" y reinícialo
- En Linux: `sudo service postgresql start`
- En Mac: `brew services start postgresql`

### Error: "FATAL: role 'postgres' does not exist"
**Problema:** Usuario postgres no existe o la contraseña es incorrecta.
**Solución:** Revisa tu instalación de PostgreSQL y actualiza las credenciales en `.env`

### Error: "database 'gastrocloud' does not exist"
**Problema:** La base de datos no se creó automáticamente.
**Solución:** Ejecuta el paso 3 de "Configuración de la base de datos" manualmente.

### La aplicación no inicia
**Solución:** Revisa que:
- Node.js está instalado: `node --version`
- PostgreSQL está corriendo
- Puerto 3000 no está ocupado
- Ejecutaste `npm install`

## Notas Importantes

- En desarrollo, la aplicación crea las tablas faltantes al iniciar; no actualiza estructuras existentes.
- La base de datos debe crearse previamente y las migraciones para bases existentes se aplican manualmente.
- Los datos de demostración se insertan en la primera ejecución

## Para Compañeros

¿Tu compañero quiere probarlo también? Solo necesita:
1. Descargar/clonar el repositorio
2. Ejecutar `npm install`
3. Tener PostgreSQL instalado (o usar valores por defecto si está localmente)
4. Ejecutar `npm run dev`

¡Listo!

## Soporte

Si tienes problemas, verifica que:
- Node.js esté instalado
- PostgreSQL esté corriendo
- Las dependencias se instalaron correctamente (`npm install`)
- El puerto 3000 esté disponible
