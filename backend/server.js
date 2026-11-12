require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { pool, initDB } = require('./database/db');

const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigin,
        credentials: true,
        methods: ["GET", "POST"]
    }
});

// Medidas de Seguridad con Helmet y CSP estricto y compatible
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.tailwindcss.com",
                "https://unpkg.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://unpkg.com",
                "https://fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "data:"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "blob:"
            ],
            connectSrc: [
                "'self'",
                "ws:",
                "wss:",
                "http:",
                "https:"
            ]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); // Limita tamaño del payload para evitar sobrecarga
app.use(express.text({ type: ['text/xml', 'application/xml', 'text/plain'], limit: '50kb' })); // Soporte XML para SOAP

// Configuración de servicio de correo Nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});
const mailTransporter = transporter;

/**
 * Notificación asíncrona de incidentes por correo electrónico a suscriptores y red comunitaria.
 */
async function enviarNotificacionIncidente(incidente) {
    if (!incidente) return;

    const zonaLimpia = (incidente.zona_id || '').replace(/\s*\([^)]*\)/g, '').trim();
    const folio = incidente.id || 'S/N';
    const tipo = incidente.tipo_emergencia || 'General';
    const prioridad = incidente.severidad || 'MEDIA';

    const asunto = `Aviso de incidente en UVM Mérida • Folio ${folio}`;
    const cuerpoTexto = [
        'Nuevo incidente registrado en el campus UVM Mérida.',
        '',
        `Folio: ${folio}`,
        `Ubicación: ${zonaLimpia}`,
        `Tipo: ${tipo}`,
        `Prioridad: ${prioridad}`,
        '',
        'El centro de monitoreo ya atiende el reporte.'
    ].join('\n');

    const cuerpoHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #202124; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #dadce0; border-radius: 8px;">
            <p style="margin-top: 0; font-size: 15px; font-weight: bold; color: #C8102E;">Nuevo incidente registrado en el campus UVM Mérida.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
                <tr><td style="padding: 6px 0; color: #5f6368; width: 110px;"><strong>Folio:</strong></td><td>${folio}</td></tr>
                <tr><td style="padding: 6px 0; color: #5f6368;"><strong>Ubicación:</strong></td><td><strong>${zonaLimpia}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #5f6368;"><strong>Tipo:</strong></td><td>${tipo}</td></tr>
                <tr><td style="padding: 6px 0; color: #5f6368;"><strong>Prioridad:</strong></td><td>${prioridad}</td></tr>
            </table>
            <p style="margin-bottom: 0; color: #3c4043; font-size: 14px;">El centro de monitoreo ya atiende el reporte.</p>
        </div>
    `;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`[Email] Despacho simulado (sin credenciales SMTP configuradas):\n${asunto}\n${cuerpoTexto}`);
        return;
    }

    try {
        const emailsSet = new Set();

        // 1. Destinos desde variable de entorno si existe
        if (process.env.EMAIL_DESTINOS) {
            process.env.EMAIL_DESTINOS
                .split(',')
                .map(e => e.trim().toLowerCase())
                .filter(Boolean)
                .forEach(e => emailsSet.add(e));
        }

        // 2. Destinos desde la tabla suscriptores
        try {
            const { rows } = await pool.query('SELECT email FROM suscriptores;');
            rows.forEach(r => {
                if (r.email) emailsSet.add(r.email.trim().toLowerCase());
            });
        } catch (dbErr) {
            console.warn('[Email] Error al consultar suscriptores de la base de datos:', dbErr.message);
        }

        const listaDestinos = Array.from(emailsSet);
        if (listaDestinos.length === 0) {
            console.log('[Email] No se encontraron destinatarios ni suscriptores registrados.');
            return;
        }

        const mailOptions = {
            from: `"Aegis Campus" <${process.env.SMTP_USER}>`,
            to: process.env.SMTP_USER,
            bcc: listaDestinos,
            subject: asunto,
            text: cuerpoTexto,
            html: cuerpoHtml
        };

        const info = await mailTransporter.sendMail(mailOptions);
        console.log(`[Email] Notificación enviada con éxito (${listaDestinos.length} destinatarios). ID: ${info.messageId}`);
    } catch (err) {
        console.error('[Email] Error en despacho de correo:', err.message);
    }
}

/**
 * Middleware para validar el JWT de autenticación.
 * Extrae el token desde una cookie HttpOnly llamada 'token'.
 * Si no existe o es inválido, redirige a /login (o responde 401 si es petición API).
 */
function verificarToken(req, res, next) {
    const token = req.cookies && req.cookies.token;
    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: "401 Unauthorized: Sesión no iniciada.", redirect: "/login" });
        }
        return res.redirect('/login');
    }

    try {
        const secret = process.env.JWT_SECRET || 'aegis-tactical-secret-2026';
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('token');
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: "401 Unauthorized: Token inválido o expirado.", redirect: "/login" });
        }
        return res.redirect('/login');
    }
}

/**
 * Middleware para autorización RBAC: Requerir rol SUPERADMIN.
 * Asume que verificarToken ya se ejecutó y validó el JWT inyectando req.user.
 * Si el rol del usuario no es 'SUPERADMIN', rechaza con estado 403 Forbidden.
 */
function requerirSuperAdmin(req, res, next) {
    if (!req.user || req.user.rol !== 'SUPERADMIN') {
        return res.status(403).json({ error: "403 Forbidden: Se requieren permisos de SUPERADMIN para esta acción." });
    }
    next();
}

// Rutas de Vistas Web
// Ruta de respaldo para favicon para evitar 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 1. Ruta raíz: Vista móvil pública para reportar emergencias (100% PÚBLICA)
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/reportar.html'));
});

// 2. Ruta de inicio de sesión táctica (Login)
app.get('/login', (req, res) => {
    const token = req.cookies && req.cookies.token;
    if (token) {
        try {
            const secret = process.env.JWT_SECRET || 'aegis-tactical-secret-2026';
            jwt.verify(token, secret);
            return res.redirect('/centro-mando');
        } catch (e) {
            res.clearCookie('token');
        }
    }
    res.sendFile(path.resolve(__dirname, '../frontend/login.html'));
});

// 3. Ruta Centro de Mando: Vista del monitor táctico en tiempo real (Protegida con verificarToken)
app.get('/centro-mando', verificarToken, (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/dashboard.html'));
});

// Endpoint de autenticación táctica (Login)
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: "Debe proporcionar correo institucional y contraseña." });
        }

        const queryOperador = "SELECT id, email, password_hash, rol, activo FROM operadores WHERE email = $1 LIMIT 1;";
        const { rows } = await pool.query(queryOperador, [email.toLowerCase().trim()]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "Credenciales no válidas." });
        }

        const operador = rows[0];

        // Validación de seguridad: cuenta desactivada
        if (!operador.activo) {
            return res.status(403).json({ error: "Cuenta desactivada." });
        }

        const match = await bcrypt.compare(password, operador.password_hash);
        if (!match) {
            return res.status(401).json({ error: "Credenciales no válidas." });
        }

        const secret = process.env.JWT_SECRET || 'aegis-tactical-secret-2026';
        const token = jwt.sign(
            { id: operador.id, email: operador.email, rol: operador.rol },
            secret,
            { expiresIn: '8h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });

        return res.json({
            mensaje: "Autenticación concedida.",
            usuario: { id: operador.id, email: operador.email, rol: operador.rol }
        });
    } catch (err) {
        console.error('[Auth] Error durante inicio de sesión:', err);
        return res.status(500).json({ error: "Error interno en el servidor de autenticación." });
    }
});

// Endpoint para consultar datos del operador autenticado en sesión
app.get('/api/v1/auth/me', verificarToken, (req, res) => {
    const { id, email, rol } = req.user || {};
    return res.json({
        id,
        email,
        rol
    });
});

// Endpoint para que el operador autenticado cambie su propia contraseña
app.patch('/api/v1/auth/password', verificarToken, async (req, res) => {
    try {
        const { password_actual, password_nuevo } = req.body || {};

        if (!password_actual || !password_nuevo) {
            return res.status(400).json({ error: "Debe proporcionar la contraseña actual y la nueva contraseña." });
        }

        if (typeof password_nuevo !== 'string' || password_nuevo.length < 6) {
            return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres." });
        }

        const userId = req.user && req.user.id;
        if (!userId) {
            return res.status(401).json({ error: "Sesión no válida o no autenticada." });
        }

        // Consultar hash actual del operador
        const { rows } = await pool.query("SELECT id, email, password_hash FROM operadores WHERE id = $1 LIMIT 1;", [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Operador no encontrado en la base de datos." });
        }

        const operador = rows[0];

        // Verificar la contraseña actual con bcrypt.compare
        const coincide = await bcrypt.compare(password_actual, operador.password_hash);
        if (!coincide) {
            return res.status(401).json({ error: "La contraseña actual no coincide con nuestros registros." });
        }

        // Encriptar la nueva contraseña con bcrypt
        const nuevoHash = await bcrypt.hash(password_nuevo, 10);

        // Actualizar en PostgreSQL
        await pool.query("UPDATE operadores SET password_hash = $1 WHERE id = $2;", [nuevoHash, userId]);

        return res.json({ mensaje: "Contraseña actualizada exitosamente." });
    } catch (err) {
        console.error('[Auth] Error al actualizar contraseña:', err);
        return res.status(500).json({ error: "Error interno al actualizar la contraseña." });
    }
});

// Endpoint de cierre de sesión táctica (Logout)
app.post('/api/v1/auth/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ mensaje: "Sesión cerrada exitosamente." });
});

// =========================================================================
// RUTAS ADMINISTRATIVAS DE GESTIÓN DE OPERADORES (RBAC: SUPERADMIN)
// =========================================================================

// 1. GET /api/v1/admin/operadores: Listar todos los operadores (excluyendo password_hash)
app.get('/api/v1/admin/operadores', verificarToken, requerirSuperAdmin, async (req, res) => {
    try {
        const queryText = `
            SELECT id, email, rol, activo
            FROM operadores
            ORDER BY id ASC;
        `;
        const { rows } = await pool.query(queryText);
        return res.json(rows);
    } catch (err) {
        console.error('[Admin Operadores] Error al listar operadores:', err);
        return res.status(500).json({ error: "Error interno al consultar la lista de operadores." });
    }
});

// 2. POST /api/v1/admin/operadores: Crear un nuevo operador táctico
app.post('/api/v1/admin/operadores', verificarToken, requerirSuperAdmin, async (req, res) => {
    try {
        let { email, password, rol } = req.body || {};

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: "Debe proporcionar un correo institucional válido." });
        }

        if (!password || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: "La contraseña es requerida y debe contener al menos 6 caracteres." });
        }

        email = email.toLowerCase().trim();
        rol = (rol && typeof rol === 'string') ? rol.toUpperCase().trim() : 'OPERADOR';

        if (!['OPERADOR', 'SUPERADMIN'].includes(rol)) {
            rol = 'OPERADOR';
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO operadores (email, password_hash, rol, activo)
            VALUES ($1, $2, $3, TRUE)
            RETURNING id, email, rol, activo;
        `;
        const { rows } = await pool.query(insertQuery, [email, passwordHash, rol]);

        return res.status(201).json({
            mensaje: "Operador creado con éxito.",
            operador: rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { // Violación de unicidad en PostgreSQL
            return res.status(409).json({ error: "Ya existe un operador registrado con este correo electrónico." });
        }
        console.error('[Admin Operadores] Error al registrar operador:', err);
        return res.status(500).json({ error: "Error interno al registrar el nuevo operador." });
    }
});

// 3. PATCH /api/v1/admin/operadores/:id: Desactivar operador (Soft Delete)
app.patch(['/api/v1/admin/operadores/:id', '/api/v1/admin/operadores/:id/desactivar'], verificarToken, requerirSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const operadorId = parseInt(id, 10);

        if (isNaN(operadorId)) {
            return res.status(400).json({ error: "Identificador de operador no válido." });
        }

        // Medida de seguridad: prevenir que el SUPERADMIN en sesión se desactive a sí mismo
        if (req.user && req.user.id === operadorId) {
            return res.status(400).json({ error: "No es posible desactivar su propia cuenta en la sesión actual." });
        }

        const updateQuery = `
            UPDATE operadores
            SET activo = FALSE
            WHERE id = $1
            RETURNING id, email, rol, activo;
        `;
        const { rows } = await pool.query(updateQuery, [operadorId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: `Operador con ID ${operadorId} no encontrado.` });
        }

        return res.json({
            mensaje: `Operador ${rows[0].email} desactivado exitosamente (Soft Delete).`,
            operador: rows[0]
        });
    } catch (err) {
        console.error('[Admin Operadores] Error al desactivar operador:', err);
        return res.status(500).json({ error: "Error interno al desactivar el operador." });
    }
});

// Ruta dedicada y segura para descarga directa del APK de Android con MIME oficial
app.get('/descargas/aegis-campus.apk', (req, res) => {
    const apkPath = path.resolve(__dirname, '../frontend/descargas/aegis-campus.apk');
    res.download(apkPath, 'Aegis-Campus-UVM.apk', {
        headers: {
            'Content-Type': 'application/vnd.android.package-archive'
        }
    }, (err) => {
        if (err && !res.headersSent) {
            res.status(404).json({ error: "Paquete de instalación APK no encontrado." });
        }
    });
});

// Servicio de archivos estáticos (JS, CSS, imágenes) deshabilitando index automático para priorizar las rutas
app.use(express.static(path.join(__dirname, '../frontend'), {
    index: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        }
    }
}));

// Configurar trust proxy para proxies en la nube (ej. Render, Heroku, Nginx)
app.set('trust proxy', 1);

// Rate Limiter para reportes de emergencia
const reportLimiter = rateLimit({
    windowMs: 3 * 60 * 1000, // 3 minutos
    max: 10, // Ajustado a 10 para demos interactivas fluidas sin permitir flood
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados reportes enviados desde esta IP. Por favor espere un momento." }
});

/**
 * Retorna el expediente SOAP por defecto para visitantes o casos no registrados
 */
function obtenerExpedientePorDefecto(telefono, nombre) {
    return {
        titular: (nombre && nombre !== "Anónimo") ? nombre : "Visitante / Comunidad UVM",
        afiliacion: "Visitante / Comunidad UVM",
        estatus_poliza: "COBERTURA GENERAL RESPONSABILIDAD CIVIL CAMPUS",
        tipo_sangre: "O+",
        alergias: "Ninguna registrada (Verificar en sitio)",
        poliza: "AXA-CAMPUS-99201",
        contacto: (telefono && telefono !== "No proporcionado" && telefono !== "Anónimo") ? telefono : "No proporcionado"
    };
}

/**
 * Consulta de forma asíncrona la tabla expedientes_soap mediante consulta parametrizada.
 * Asigna un objeto por defecto si no hay resultados.
 */
async function buscarExpedienteSoap(telefono, nombre = "") {
    if (!telefono || telefono === "No proporcionado" || telefono === "Anónimo") {
        return obtenerExpedientePorDefecto(telefono, nombre);
    }

    const digitos = telefono.replace(/\D/g, '');
    try {
        const queryExp = `
            SELECT id, telefono, tipo_sangre, alergias, poliza, contacto
            FROM expedientes_soap
            WHERE telefono = $1 OR contacto = $1 OR telefono = $2 OR contacto = $2
            LIMIT 1;
        `;
        const { rows } = await pool.query(queryExp, [telefono, digitos]);

        if (rows.length > 0) {
            const exp = rows[0];
            return {
                titular: (nombre && nombre !== "Anónimo") ? nombre : "Comunidad UVM",
                afiliacion: "Comunidad UVM",
                estatus_poliza: "ACTIVA",
                tipo_sangre: exp.tipo_sangre || "No especificado",
                alergias: exp.alergias || "Ninguna registrada",
                poliza: exp.poliza || "S/N",
                contacto: exp.contacto || exp.telefono || telefono
            };
        }
    } catch (err) {
        console.error('[Database] Error al consultar expedientes_soap:', err);
    }

    return obtenerExpedientePorDefecto(telefono, nombre);
}

// Función de sanitización y limpieza de cadenas
function sanitizeString(str, maxLen = 200) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[<>]/g, '') // Elimina caracteres susceptibles de XSS
        .trim()
        .slice(0, maxLen);
}

// Bounding box UVM Campus Mérida
const CAMPUS_BOUNDS = {
    minLat: 21.0450,
    maxLat: 21.0500,
    minLng: -89.6350,
    maxLng: -89.6290
};

function validarCoordenadas(coords) {
    if (!coords || typeof coords !== 'object') {
        return {
            lat: 21.0475,
            lng: -89.6322
        };
    }
    let lat = parseFloat(coords.lat);
    let lng = parseFloat(coords.lng);

    if (isNaN(lat) || isNaN(lng) ||
        lat < CAMPUS_BOUNDS.minLat || lat > CAMPUS_BOUNDS.maxLat ||
        lng < CAMPUS_BOUNDS.minLng || lng > CAMPUS_BOUNDS.maxLng) {
        // Fallback al centro oficial del campus
        lat = 21.0475;
        lng = -89.6322;
    }

    return { lat, lng };
}

// Catálogos permitidos
const TIPOS_VALIDOS = ['Medica', 'Seguridad', 'Incendio'];
const SEVERIDADES_VALIDAS = ['ALTA', 'MEDIA', 'BAJA'];

// Ruta REST: Crear Reporte de Emergencia
app.post('/api/v1/incidentes', reportLimiter, async (req, res) => {
    try {
        let {
            nombre_reportante,
            telefono,
            correo,
            email,
            recibe_alertas,
            recibeAlertas,
            tipo_emergencia,
            severidad,
            prioridad,
            zona_id,
            zona,
            coordenadas,
            descripcion,
            detalles
        } = req.body || {};

        zona_id = zona_id || zona;
        severidad = severidad || prioridad || "MEDIA";
        descripcion = descripcion || detalles || "";

        // Sanitización y valores por defecto para campos de identidad opcionales
        nombre_reportante = sanitizeString(nombre_reportante, 100);
        if (!nombre_reportante) {
            nombre_reportante = "Anónimo";
        }

        telefono = sanitizeString(telefono, 30);
        if (!telefono) {
            telefono = "Anónimo";
        }

        // Sanitización de correo electrónico y preferencia de alertas
        let correoSanitizado = sanitizeString(correo || email || '', 255).toLowerCase();
        if (!correoSanitizado || !correoSanitizado.includes('@')) {
            correoSanitizado = null;
        }

        const aceptaAlertas = Boolean(
            recibe_alertas === true || recibe_alertas === 'true' || recibe_alertas === 1 ||
            recibeAlertas === true || recibeAlertas === 'true' || recibeAlertas === 1
        );

        // Si el usuario aceptó recibir alertas y proporcionó correo válido, suscribirlo
        if (aceptaAlertas && correoSanitizado) {
            try {
                await pool.query(
                    `INSERT INTO suscriptores (email)
                     SELECT $1::varchar
                     WHERE NOT EXISTS (SELECT 1 FROM suscriptores WHERE email = $1::varchar)
                     ON CONFLICT (email) DO NOTHING;`,
                    [correoSanitizado]
                );
            } catch (subErr) {
                console.warn('[Suscriptores] Error al registrar suscriptor en BD:', subErr.message);
            }
        }

        tipo_emergencia = sanitizeString(tipo_emergencia, 50);
        severidad = sanitizeString(severidad, 20).toUpperCase();
        zona_id = sanitizeString(zona_id, 100);
        descripcion = sanitizeString(descripcion, 500);

        // Validación estricta de campos obligatorios
        if (!tipo_emergencia || !zona_id) {
            return res.status(400).json({
                error: "Faltan campos obligatorios en el reporte (tipo_emergencia o zona_id)."
            });
        }

        if (!TIPOS_VALIDOS.includes(tipo_emergencia)) {
            return res.status(400).json({
                error: `Tipo de emergencia no válido. Valores permitidos: ${TIPOS_VALIDOS.join(', ')}.`
            });
        }

        if (!SEVERIDADES_VALIDAS.includes(severidad)) {
            severidad = "MEDIA";
        }

        const coordsValidadas = validarCoordenadas(coordenadas);

        // Búsqueda asíncrona parametrizada en expedientes_soap con objeto por defecto
        const expedienteSoap = await buscarExpedienteSoap(telefono, nombre_reportante);

        const id = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
        const timestamp = new Date().toISOString();
        const estado = "REPORTADO";
        const descFinal = descripcion || "Sin descripción proporcionada.";

        // Inserción en la tabla incidentes incluyendo correo y recibe_alertas
        const insertQuery = `
            INSERT INTO incidentes (
                id, telefono, tipo_emergencia, severidad, zona_id, 
                lat, lng, descripcion, estado, timestamp, expediente_json,
                recibe_alertas, correo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;
        const insertValues = [
            id,
            telefono,
            tipo_emergencia,
            severidad,
            zona_id,
            coordsValidadas.lat,
            coordsValidadas.lng,
            descFinal,
            estado,
            timestamp,
            JSON.stringify(expedienteSoap),
            aceptaAlertas,
            correoSanitizado
        ];

        const { rows: insertedRows } = await pool.query(insertQuery, insertValues);
        const nuevoIncidenteDB = insertedRows[0];

        // Construir objeto respuesta compatible con el formato requerido por el frontend
        const nuevoIncidente = {
            id: nuevoIncidenteDB.id,
            nombre_reportante,
            telefono: nuevoIncidenteDB.telefono,
            correo: nuevoIncidenteDB.correo,
            recibe_alertas: nuevoIncidenteDB.recibe_alertas,
            tipo_emergencia: nuevoIncidenteDB.tipo_emergencia,
            severidad: nuevoIncidenteDB.severidad,
            zona_id: nuevoIncidenteDB.zona_id,
            coordenadas: {
                lat: parseFloat(nuevoIncidenteDB.lat),
                lng: parseFloat(nuevoIncidenteDB.lng)
            },
            descripcion: nuevoIncidenteDB.descripcion,
            estado: nuevoIncidenteDB.estado,
            timestamp: nuevoIncidenteDB.timestamp,
            expediente_soap: nuevoIncidenteDB.expediente_json
        };

        // Emitir alerta en tiempo real al Centro de Mando Web
        io.emit('nueva_alerta', nuevoIncidente);

        // Despacho en segundo plano asíncrono (sin bloquear la respuesta HTTP 201)
        setImmediate(() => {
            enviarNotificacionIncidente(nuevoIncidente).catch(err => {
                console.error('[Email] Error en despacho asíncrono de notificación:', err);
            });
        });

        return res.status(201).json({
            mensaje: "Emergencia registrada y transmitida al Centro de Mando con éxito.",
            incidente: nuevoIncidente
        });
    } catch (err) {
        console.error('[Database] Error al registrar incidente:', err);
        return res.status(500).json({ error: "Error interno al registrar el incidente en la base de datos." });
    }
});

// Ruta REST: Obtener incidentes activos para el mapa desde la base de datos
app.get('/api/v1/incidentes/activos', async (req, res) => {
    try {
        const queryText = `
            SELECT id, telefono, tipo_emergencia, severidad, zona_id, 
                   lat, lng, descripcion, estado, timestamp, expediente_json
            FROM incidentes
            WHERE estado IN ('REPORTADO', 'EN ATENCIÓN')
            ORDER BY timestamp DESC
            LIMIT $1;
        `;
        const { rows } = await pool.query(queryText, [50]);

        // Mapear al formato anidado esperado por el frontend
        const incidentesFormateados = rows.map(row => ({
            id: row.id,
            telefono: row.telefono,
            tipo_emergencia: row.tipo_emergencia,
            severidad: row.severidad,
            zona_id: row.zona_id,
            coordenadas: {
                lat: parseFloat(row.lat),
                lng: parseFloat(row.lng)
            },
            descripcion: row.descripcion,
            estado: row.estado,
            timestamp: row.timestamp,
            expediente_soap: row.expediente_json,
            nombre_reportante: row.expediente_json?.titular || 'Anónimo'
        }));

        res.json(incidentesFormateados);
    } catch (err) {
        console.error('[Database] Error al consultar incidentes activos:', err);
        res.status(500).json({ error: "Error interno al consultar incidentes activos." });
    }
});

// Endpoint de Tracking de Incidentes (Ciclo de Vida: 'EN ATENCIÓN', 'RESUELTO', etc.) - Protegido con JWT
app.patch('/api/v1/incidentes/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        let { estado } = req.body || {};

        if (!estado || typeof estado !== 'string') {
            return res.status(400).json({ error: "Debe proporcionar un estado válido (ej. 'EN ATENCIÓN', 'RESUELTO')." });
        }

        estado = sanitizeString(estado, 50).toUpperCase().trim();

        const updateQuery = `
            UPDATE incidentes
            SET estado = $1
            WHERE id = $2
            RETURNING *;
        `;
        const { rows } = await pool.query(updateQuery, [estado, id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: `Incidente ${id} no encontrado en la base de datos.` });
        }

        const incidenteActualizado = rows[0];

        // Emitir evento WebSocket según el ciclo de vida
        if (estado === 'EN ATENCIÓN') {
            io.emit('incidente_actualizado', incidenteActualizado);
        } else if (estado === 'RESUELTO') {
            io.emit('incidente_resuelto', { id: Number(id) || id });
        }

        return res.json({
            mensaje: `Incidente ${id} actualizado a '${estado}'.`,
            incidente: incidenteActualizado
        });
    } catch (err) {
        console.error('[Database] Error al actualizar estado del incidente:', err);
        return res.status(500).json({ error: "Error interno al actualizar el estado del incidente." });
    }
});

// Endpoint Directo para Suscripción de Alertas por Correo (Ruta 100% PÚBLICA)
app.post(['/api/v1/suscriptores', '/api/v1/comunidad/suscribir'], async (req, res) => {
    try {
        const rawEmail = req.body ? (req.body.email || req.body.correo || '') : '';
        const email = rawEmail.toString().trim().toLowerCase();

        if (!email || !email.includes('@')) {
            return res.status(400).json({ ok: false, error: "Por favor proporciona un correo electrónico válido." });
        }

        const emailLimpio = sanitizeString(email, 255);

        const insertQuery = `
            INSERT INTO suscriptores (email)
            SELECT $1::varchar
            WHERE NOT EXISTS (SELECT 1 FROM suscriptores WHERE email = $1::varchar)
            ON CONFLICT (email) DO NOTHING;
        `;
        await pool.query(insertQuery, [emailLimpio]);

        return res.status(200).json({
            ok: true,
            mensaje: "Suscripción activada con éxito.",
            email: emailLimpio
        });
    } catch (err) {
        console.error('[Database] Error al registrar suscriptor:', err);
        return res.status(500).json({ ok: false, error: "Error interno al procesar la suscripción." });
    }
});

// Ruta especial para la Expo: Limpiar el tablero y archivar incidentes (Protegida con verificarToken)
app.post('/api/v1/expo/reset', verificarToken, async (req, res) => {
    try {
        await pool.query(
            "UPDATE incidentes SET estado = 'ARCHIVADO' WHERE estado IN ('REPORTADO', 'EN ATENCIÓN');"
        );
        io.emit('limpiar_mapa', {});
        return res.json({ mensaje: "Tablero reiniciado y registros archivados con éxito." });
    } catch (dbErr) {
        console.error('[Database] Error al archivar incidentes en PostgreSQL:', dbErr.message);
        return res.status(500).json({ error: "Error interno al archivar los incidentes en la base de datos." });
    }
});

// Endpoint SOAP (XML): Consulta asíncrona a expedientes_soap con datos reales
app.post('/soap/ExpedienteMedicoService', async (req, res) => {
    try {
        let telefono = '';
        let matricula = '';

        // Extracción de parámetros si se recibe JSON
        if (typeof req.body === 'object' && req.body !== null) {
            telefono = req.body.telefono || req.body.contacto || req.body.phone || '';
            matricula = req.body.matricula || '';
        } else if (typeof req.body === 'string') {
            // Extracción mediante expresiones regulares en caso de XML SOAP
            const telMatch = req.body.match(/<(?:med:)?(?:Telefono|Contacto|telefono|contacto)>(.*?)<\/(?:med:)?(?:Telefono|Contacto|telefono|contacto)>/i);
            if (telMatch && telMatch[1]) {
                telefono = telMatch[1].trim();
            }
            const matMatch = req.body.match(/<(?:med:)?(?:Matricula|matricula)>(.*?)<\/(?:med:)?(?:Matricula|matricula)>/i);
            if (matMatch && matMatch[1]) {
                matricula = matMatch[1].trim();
            }
        }

        // Parámetros por query string como fallback
        if (!telefono && req.query) {
            telefono = req.query.telefono || req.query.contacto || '';
            matricula = matricula || req.query.matricula || '';
        }

        telefono = sanitizeString(telefono, 30);
        matricula = sanitizeString(matricula, 30);

        // Búsqueda asíncrona en la base de datos
        const expediente = await buscarExpedienteSoap(telefono);

        const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:med="http://aegiscampus.uvm.edu.mx/ws/medicos">
   <soapenv:Body>
      <med:ConsultarExpedienteResponse>
         <med:Titular>${expediente.titular || 'Visitante / Comunidad UVM'}</med:Titular>
         <med:Afiliacion>${expediente.afiliacion || 'Visitante / Comunidad UVM'}</med:Afiliacion>
         <med:EstatusPoliza>${expediente.estatus_poliza || 'ACTIVA'}</med:EstatusPoliza>
         <med:TipoSangre>${expediente.tipo_sangre || 'No registrado'}</med:TipoSangre>
         <med:AlergiasCriticas>${expediente.alergias || 'Ninguna registrada'}</med:AlergiasCriticas>
         <med:PolizaSeguro>${expediente.poliza || 'S/N'}</med:PolizaSeguro>
         <med:ContactoEmergencia>${expediente.contacto || 'No proporcionado'}</med:ContactoEmergencia>
      </med:ConsultarExpedienteResponse>
   </soapenv:Body>
</soapenv:Envelope>`;
        
        res.setHeader('Content-Type', 'text/xml');
        res.send(xmlResponse);
    } catch (err) {
        console.error('[Database] Error en endpoint SOAP:', err);
        res.status(500).setHeader('Content-Type', 'text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
   <soapenv:Body>
      <soapenv:Fault>
         <faultcode>soapenv:Server</faultcode>
         <faultstring>Error al consultar expediente médico en la base de datos.</faultstring>
      </soapenv:Fault>
   </soapenv:Body>
</soapenv:Envelope>`);
    }
});

// Gestión de conexiones de Socket.io
io.on('connection', (socket) => {
    console.log(`[Socket.io] Nuevo cliente conectado: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`[Socket.io] Cliente desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await initDB();
    } catch (err) {
        console.error('[Aegis Campus] Error inicializando base de datos:', err);
    }

    server.listen(PORT, () => {
        console.log(`[Aegis Campus] Servidor activo en http://localhost:${PORT}`);
    });
}

startServer();