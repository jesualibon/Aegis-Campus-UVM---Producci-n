const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Normalizar la cadena de conexión para evitar el SECURITY WARNING de pg-connection-string
let connectionString = process.env.DATABASE_URL || '';
if (connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
    connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

// Configuración SSL activa para producción o cuando la URL de conexión lo requiera
const isProduction = process.env.NODE_ENV === 'production';
const sslConfig = isProduction || connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
    connectionString,
    ssl: sslConfig
});

pool.on('error', (err) => {
    console.error('[Database] Error inesperado en el cliente del pool:', err);
});

/**
 * Inicializa las tablas de la base de datos si no existen
 * y ejecuta el seed inicial si expedientes_soap está vacía.
 */
async function initDB() {
    if (!process.env.DATABASE_URL) {
        console.warn('[Database] Advertencia: DATABASE_URL no está configurada en el entorno.');
        return;
    }

    const client = await pool.connect();
    try {
        console.log('[Database] Verificando e inicializando tablas en PostgreSQL...');

        // 1. Tabla expedientes_soap
        await client.query(`
            CREATE TABLE IF NOT EXISTS expedientes_soap (
                id SERIAL PRIMARY KEY,
                telefono VARCHAR(50) UNIQUE NOT NULL,
                tipo_sangre VARCHAR(20),
                alergias TEXT,
                poliza VARCHAR(100),
                contacto VARCHAR(100)
            );
        `);

        // 2. Tabla incidentes
        await client.query(`
            CREATE TABLE IF NOT EXISTS incidentes (
                id VARCHAR(100) PRIMARY KEY,
                telefono VARCHAR(50),
                tipo_emergencia VARCHAR(50),
                severidad VARCHAR(20),
                zona_id VARCHAR(100),
                lat NUMERIC,
                lng NUMERIC,
                descripcion TEXT,
                estado VARCHAR(50),
                timestamp TIMESTAMPTZ DEFAULT NOW(),
                expediente_json JSONB
            );
        `);

        // Migración dinámica: agregar columnas para alertas y correo en incidentes
        await client.query(`
            ALTER TABLE incidentes ADD COLUMN IF NOT EXISTS recibe_alertas BOOLEAN DEFAULT FALSE;
            ALTER TABLE incidentes ADD COLUMN IF NOT EXISTS correo VARCHAR(255);
        `);

        // 3. Seed automático para expedientes_soap si la tabla está vacía
        const countRes = await client.query('SELECT COUNT(*) AS count FROM expedientes_soap;');
        const total = parseInt(countRes.rows[0].count, 10);

        if (total === 0) {
            console.log('[Database] Tabla expedientes_soap vacía. Insertando seed de 3 registros de prueba...');
            const seedQuery = `
                INSERT INTO expedientes_soap (telefono, tipo_sangre, alergias, poliza, contacto)
                VALUES 
                    ($1, $2, $3, $4, $5),
                    ($6, $7, $8, $9, $10),
                    ($11, $12, $13, $14, $15)
                ON CONFLICT (telefono) DO NOTHING;
            `;

            await client.query(seedQuery, [
                '9995550192', 'O Positivo', 'Penicilina', 'AXA-99201-UVM', '999-555-0192',
                '9993127744', 'A Positivo', 'Sulfamidas', 'GNP-CAMPUS-3382', '999-312-7744',
                '9999401122', 'B Positivo', 'Ibuprofeno', 'METLIFE-CAMPUS-5541', '999-940-1122'
            ]);
            console.log('[Database] Seed completado con éxito (3 registros insertados).');
        } else {
            console.log(`[Database] expedientes_soap ya contiene ${total} registro(s). Omitiendo seed.`);
        }

        // 4. Tabla operadores para autenticación JWT
        await client.query(`
            CREATE TABLE IF NOT EXISTS operadores (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                rol VARCHAR(50) DEFAULT 'OPERADOR',
                activo BOOLEAN DEFAULT TRUE
            );
        `);

        // Migración dinámica: agregar columnas si la tabla ya existía
        await client.query(`
            ALTER TABLE operadores ADD COLUMN IF NOT EXISTS rol VARCHAR(50) DEFAULT 'OPERADOR';
            ALTER TABLE operadores ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
        `);

        // Seed de inicialización: verificar si existe algún usuario con rol 'SUPERADMIN'
        const superadminRes = await client.query("SELECT id FROM operadores WHERE rol = 'SUPERADMIN' LIMIT 1;");
        if (superadminRes.rows.length === 0) {
            console.log('[Database] No se encontró ningún usuario con rol SUPERADMIN. Configurando administrador inicial...');
            const defaultAdminEmail = process.env.ADMIN_EMAIL || 'admin@uvm.edu.mx';
            const defaultPassword = process.env.ADMIN_PASSWORD || 'Aegis2026*';
            const passwordHash = await bcrypt.hash(defaultPassword, 10);

            await client.query(`
                INSERT INTO operadores (email, password_hash, rol, activo)
                VALUES ($1, $2, 'SUPERADMIN', TRUE)
                ON CONFLICT (email) 
                DO UPDATE SET rol = 'SUPERADMIN', activo = TRUE;
            `, [defaultAdminEmail, passwordHash]);

            console.log(`[Database] Usuario SUPERADMIN inicial configurado (${defaultAdminEmail}).`);
        } else {
            console.log('[Database] Usuario con rol SUPERADMIN verificado en la base de datos.');
        }

        // 5. Tabla suscriptores para la Red de Ayuda Comunitaria
        await client.query(`
            CREATE TABLE IF NOT EXISTS suscriptores (
                email VARCHAR PRIMARY KEY,
                fecha_registro TIMESTAMP DEFAULT NOW()
            );
        `);

        // Seed inicial para suscriptores comunitarios si la tabla está vacía
        const countSuscRes = await client.query('SELECT COUNT(*) AS count FROM suscriptores;');
        const totalSusc = parseInt(countSuscRes.rows[0].count, 10);

        if (totalSusc === 0 && process.env.EMAIL_DESTINOS) {
            console.log('[Database] Tabla suscriptores vacía. Insertando lista comunitaria inicial...');
            const defaultDestinos = process.env.EMAIL_DESTINOS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
            for (const email of defaultDestinos) {
                await client.query(
                    'INSERT INTO suscriptores (email) VALUES ($1) ON CONFLICT (email) DO NOTHING;',
                    [email]
                );
            }
            console.log(`[Database] Seeding de ${defaultDestinos.length} suscriptores completado.`);
        } else {
            console.log(`[Database] suscriptores ya contiene ${totalSusc} registro(s).`);
        }

        console.log('[Database] Inicialización completada exitosamente.');
    } catch (err) {
        console.error('[Database] Error durante initDB:', err);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    initDB,
    query: (text, params) => pool.query(text, params)
};
