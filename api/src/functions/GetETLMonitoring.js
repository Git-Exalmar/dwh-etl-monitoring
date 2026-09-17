const { app } = require('@azure/functions');
const sql = require('mssql');

// Configuración del Pool de Conexión a SQL Server
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, // -> Debe ser 10.1.0.16
    database: process.env.DB_NAME,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
        connectTimeout: 15000,
        requestTimeout: 15000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let poolPromise = null;

function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(config)
            .connect()
            .then(pool => {
                console.log('✅ Conexión exitosa a SQL Server');
                return pool;
            })
            .catch(err => {
                console.error('❌ Error de conexión a SQL Server:', err);
                poolPromise = null; // Reiniciar en caso de error
                throw err;
            });
    }
    return poolPromise;
}

// Endpoint HTTP que soporta GET (Consultar) y POST (Insertar)
app.http('GetETLMonitoring', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0'
        };

        try {
            const pool = await getPool();

            // ----------------------------------------------------
            // 1. OBTENER DATOS (GET)
            // ----------------------------------------------------
            if (request.method === 'GET') {
                const result = await pool.request().execute('dbo.sp_MonitoreoIngestaETL');
                
                return {
                    status: 200,
                    headers,
                    body: JSON.stringify({
                        status: 'success',
                        total: result.recordset ? result.recordset.length : 0,
                        data: result.recordset
                    })
                };
            }

            // ----------------------------------------------------
            // 2. INSERTAR Y VALIDAR DATOS (POST)
            // ----------------------------------------------------
            if (request.method === 'POST') {
                const body = await request.json();
                const { proceso, estado, registrosProcesados } = body;

                // Validación de campos requeridos
                if (!proceso || !estado) {
                    return {
                        status: 400,
                        headers,
                        body: JSON.stringify({
                            error: 'Campos requeridos faltantes',
                            message: 'Los campos "proceso" y "estado" son obligatorios.'
                        })
                    };
                }

                // Inserción en la base de datos (Ejemplo usando query parametrizado)
                const insertQuery = `
                    INSERT INTO dbo.MonitoreoETL (Proceso, Estado, RegistrosProcesados, FechaCreacion)
                    VALUES (@proceso, @estado, @registros, GETDATE());
                `;

                const req = pool.request();
                req.input('proceso', sql.VarChar, proceso);
                req.input('estado', sql.VarChar, estado);
                req.input('registros', sql.Int, registrosProcesados || 0);

                await req.query(insertQuery);

                return {
                    status: 201,
                    headers,
                    body: JSON.stringify({
                        status: 'success',
                        message: 'Registro de monitoreo ETL insertado correctamente'
                    })
                };
            }

        } catch (error) {
            context.error('Error en Azure Function:', error);
            return {
                status: 500,
                headers,
                body: JSON.stringify({
                    error: 'Error de servidor al procesar la solicitud',
                    message: error.message
                })
            };
        }
    }
});