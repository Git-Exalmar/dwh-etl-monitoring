const { app } = require('@azure/functions');
const sql = require('mssql');

let poolPromise = null;

function getPool() {
    if (!poolPromise) {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
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
        poolPromise = new sql.ConnectionPool(config).connect();
    }
    return poolPromise;
}

app.http('GetETLMonitoring', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const pool = await getPool();
            const result = await pool.request().execute('dbo.sp_MonitoreoIngestaETL');
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, max-age=0'
                },
                body: JSON.stringify(result.recordset)
            };
        } catch (error) {
            context.error('Error executando sp_MonitoreoIngestaETL:', error);
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Error de servidor al obtener monitoreo ETL', 
                    message: error.message 
                })
            };
        }
    }
});