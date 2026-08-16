const configuredCAConnectionTimeout = Number.parseInt(
    process.env.FABRIC_CA_CONNECTION_TIMEOUT_MS || process.env.CONNECTION_TIMEOUT,
    10
);
process.env.CONNECTION_TIMEOUT = String(
    Number.isFinite(configuredCAConnectionTimeout) && configuredCAConnectionTimeout > 0
        ? configuredCAConnectionTimeout
        : 30000
);

const FabricCAServices = require('fabric-ca-client');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../network/.env'), override: true });
const multer = require('multer');
const { spawn } = require('child_process');
const nodemailer = require('nodemailer');
const { Worker } = require('worker_threads');
const util = require('util');
const scryptAsync = util.promisify(crypto.scrypt);

require('events').EventEmitter.defaultMaxListeners = 100;

const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const managedIntervals = new Set();
const setManagedInterval = (handler, intervalMs) => {
    const timer = setInterval(handler, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    managedIntervals.add(timer);
    return timer;
};

const clearManagedIntervals = () => {
    for (const timer of managedIntervals) clearInterval(timer);
    managedIntervals.clear();
};

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

setManagedInterval(() => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return;
        const now = Date.now();
        const maxAgeMs = 2 * 60 * 60 * 1000; // 2 Hours
        
        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtime.getTime() > maxAgeMs) {
                    fs.unlink(filePath, e => {
                        if (!e) console.log(`[Garbage Collector] Deleted orphaned upload file: ${file}`);
                    });
                }
            });
        });
    });
}, 60 * 60 * 1000); // Runs every hour

const caConfigCache = new Map();

const GATEWAY_CACHE_MAX_USERS = parsePositiveInt(process.env.GATEWAY_CACHE_MAX_USERS, 500);
const IDLE_TIMEOUT_MS = parsePositiveInt(process.env.GATEWAY_IDLE_TIMEOUT_MS, 5 * 60 * 1000);
const GATEWAY_PRUNE_INTERVAL_MS = parsePositiveInt(process.env.GATEWAY_PRUNE_INTERVAL_MS, 60 * 1000);
const CA_CONFIG_TTL_MS = parsePositiveInt(process.env.CA_CONFIG_TTL_MS, 60 * 60 * 1000);
const CA_CONFIG_PRUNE_INTERVAL_MS = parsePositiveInt(process.env.CA_CONFIG_PRUNE_INTERVAL_MS, 10 * 60 * 1000);
const SHUTDOWN_GRACE_MS = parsePositiveInt(process.env.SHUTDOWN_GRACE_MS, 30 * 1000);
let isShuttingDown = false;

const disconnectGatewayEntry = (username, cached, reason = 'stale') => {
    if (!cached?.gateway) return;

    try {
        cached.gateway.disconnect();
    } catch (e) {
        console.warn(`[Gateway Cache] Failed to disconnect ${username}: ${e.message}`);
    }

    console.log(`[Gateway Cache] Closed ${reason} gateway for ${username}`);
};

class GatewayLRUCache {
    constructor(maxEntries, initialEntries) {
        this.maxEntries = Math.max(1, maxEntries);
        this.store = new Map();

        if (initialEntries && typeof initialEntries.entries === 'function') {
            for (const [username, cached] of initialEntries.entries()) {
                this.set(username, cached);
            }
        }
    }

    get size() {
        return this.store.size;
    }

    has(username) {
        return this.store.has(username);
    }

    get(username) {
        const cached = this.store.get(username);
        if (!cached) return undefined;

        this.store.delete(username);
        this.store.set(username, cached);
        return cached;
    }

    set(username, cached) {
        const existing = this.store.get(username);
        if (existing && existing.gateway !== cached.gateway) {
            disconnectGatewayEntry(username, existing, 'replaced');
        }

        this.store.delete(username);
        this.store.set(username, cached);
        this.evictOverflow();
        return this;
    }

    delete(username) {
        return this.store.delete(username);
    }

    entries() {
        return this.store.entries();
    }

    forEach(callback) {
        this.store.forEach(callback);
    }

    clear() {
        this.store.clear();
    }

    evictOverflow() {
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.entries().next().value;
            if (!oldest) return;

            const [username, cached] = oldest;
            this.store.delete(username);
            disconnectGatewayEntry(username, cached, 'capacity');
        }
    }
}

global.userGatewayCache = global.userGatewayCache instanceof GatewayLRUCache
    ? global.userGatewayCache
    : new GatewayLRUCache(GATEWAY_CACHE_MAX_USERS, global.userGatewayCache);
const userGatewayCache = global.userGatewayCache;

const disconnectCachedGateway = (username, reason = 'stale') => {
    const cached = userGatewayCache.get(username);
    if (!cached) return;

    userGatewayCache.delete(username);
    disconnectGatewayEntry(username, cached, reason);
};

const isGatewayCacheExpired = (cached) => {
    if (!cached?.lastAccessed) return true;
    return Date.now() - cached.lastAccessed > IDLE_TIMEOUT_MS;
};

setManagedInterval(() => {
    for (const [username, cached] of userGatewayCache.entries()) {
        if (isGatewayCacheExpired(cached)) disconnectCachedGateway(username, 'idle');
    }
}, GATEWAY_PRUNE_INTERVAL_MS);

const resolveExistingPaths = (...candidates) => {
    const seen = new Set();
    const paths = [];

    for (const candidate of candidates.filter(Boolean)) {
        const resolved = path.resolve(__dirname, candidate);
        if (fs.existsSync(resolved) && !seen.has(resolved)) {
            seen.add(resolved);
            paths.push(resolved);
        }
    }

    return paths;
};

const resolveFirstExistingPath = (...candidates) => {
    for (const candidate of candidates.filter(Boolean)) {
        const resolved = path.resolve(__dirname, candidate);
        if (fs.existsSync(resolved)) return resolved;
    }
    return null;
};

const readFirstExistingFile = (...candidates) => {
    const resolved = resolveFirstExistingPath(...candidates);
    return resolved ? fs.readFileSync(resolved, 'utf8') : '';
};

let ccp = null;
const ccpPath = resolveFirstExistingPath(
    process.env.CONNECTION_PROFILE_PATH,
    path.resolve(__dirname, '..', 'network', 'connection-profile.json'),
    path.resolve(__dirname, 'connection.json')
);
const ADMIN_CRYPTO_BASE = process.env.ADMIN_CRYPTO_BASE || '/etc/hyperledger/admin-crypto';
const FABRIC_GATEWAY_TLS_ROOTS = process.env.FABRIC_GATEWAY_TLS_ROOTS || '/etc/hyperledger/fabric-gateway-tls';

const getFileSignature = (filePath) => {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.mtimeMs}:${stat.size}`;
};

const getCachedCAConfig = (cacheKey) => {
    const cached = caConfigCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.createdAt > CA_CONFIG_TTL_MS) {
        caConfigCache.delete(cacheKey);
        console.log(`[Fabric CA Cache] Evicted expired config ${cacheKey}`);
        return null;
    }

    cached.lastAccessed = Date.now();
    return cached.config;
};

const pruneCAConfigCache = () => {
    const now = Date.now();
    for (const [cacheKey, cached] of caConfigCache.entries()) {
        if (now - cached.createdAt > CA_CONFIG_TTL_MS) {
            caConfigCache.delete(cacheKey);
            console.log(`[Fabric CA Cache] Evicted stale config ${cacheKey}`);
        }
    }
};

setManagedInterval(pruneCAConfigCache, CA_CONFIG_PRUNE_INTERVAL_MS);

const normalizeDatabaseRole = (role) => {
    const normalizedRole = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

    if (['system_admin', 'systemadmin', 'system_administrator', 'systemadministrator'].includes(normalizedRole)) {
        return 'system_admin';
    }
    if (['department_admin', 'dept_admin', 'deptadmin', 'departmentadmin', 'department', 'admin', 'departmentmsp', 'chairperson'].includes(normalizedRole)) {
        return 'department_admin';
    }
    if (normalizedRole === 'facultymsp') return 'faculty';
    if (normalizedRole === 'registrarmsp') return 'registrar';

    return normalizedRole;
};

const getCAConfig = (role) => {
<<<<<<< Updated upstream
    const normalizedRole = String(role || 'registrar').toLowerCase();
    const isDocker = fs.existsSync('/.dockerenv');
=======
    const normalizedRole = normalizeDatabaseRole(role || 'registrar');
    const isContainerized = fs.existsSync('/.dockerenv') || fs.existsSync('/var/run/secrets/kubernetes.io');
>>>>>>> Stashed changes
    let caURL, caName, adminLabel, mspId, certPaths, cacheKey;

    if (normalizedRole === 'system_admin') {
        throw new Error('System administrator accounts do not have Fabric CA identities.');
    }

    if (normalizedRole === 'faculty') {
        caURL = isDocker ? 'https://ca.faculty.capstone.com:7054' : 'https://localhost:8054';
        caName = 'ca-faculty';
        adminLabel = 'admin-faculty';
        mspId = 'FacultyMSP';
        certPaths = resolveExistingPaths(
            process.env.FABRIC_CA_FACULTY_CERT,
            '../network/fabric-ca/faculty/ca-cert.pem',
            '../network/crypto-config-final-v2/peerOrganizations/faculty.capstone.com/tlsca/tlsca.faculty.capstone.com-cert.pem',
            '../network/fabric-ca/faculty/tls-cert.pem'
        );
<<<<<<< Updated upstream
    } else if (normalizedRole === 'department_admin' || normalizedRole === 'admin' || normalizedRole === 'deptadmin' || normalizedRole === 'department' || normalizedRole === 'chairperson') {
        caURL = isDocker ? 'https://ca.department.capstone.com:7054' : 'https://localhost:9054';
=======
    } else if (normalizedRole === 'department_admin') {
        caURL = process.env.FABRIC_CA_DEPARTMENT_URL || (isContainerized ? 'https://ca.department.capstone.com:7054' : 'https://localhost:9054');
>>>>>>> Stashed changes
        caName = 'ca-department';
        adminLabel = 'admin-department';
        mspId = 'DepartmentMSP';
        certPaths = resolveExistingPaths(
            process.env.FABRIC_CA_DEPARTMENT_CERT,
            '../network/fabric-ca/department/ca-cert.pem',
            '../network/crypto-config-final-v2/peerOrganizations/department.capstone.com/tlsca/tlsca.department.capstone.com-cert.pem',
            '../network/fabric-ca/department/tls-cert.pem'
        );
<<<<<<< Updated upstream
    } else {
        caURL = isDocker ? 'https://ca.registrar.capstone.com:7054' : 'https://localhost:7054';
=======
    } else if (normalizedRole === 'registrar' || normalizedRole === 'student') {
        caURL = process.env.FABRIC_CA_REGISTRAR_URL || (isContainerized ? 'https://ca.registrar.capstone.com:7054' : 'https://localhost:7054');
>>>>>>> Stashed changes
        caName = 'ca-registrar';
        adminLabel = 'admin-registrar';
        mspId = 'RegistrarMSP';
        certPaths = resolveExistingPaths(
            process.env.FABRIC_CA_REGISTRAR_CERT,
            '../network/fabric-ca/registrar/ca-cert.pem',
            '../network/crypto-config-final-v2/peerOrganizations/registrar.capstone.com/tlsca/tlsca.registrar.capstone.com-cert.pem',
            '../network/fabric-ca/registrar/tls-cert.pem'
        );
    } else {
        throw new Error(`Unsupported Fabric role "${normalizedRole || 'unknown'}".`);
    }

    if (!certPaths || certPaths.length === 0) {
        throw new Error(`Fabric CA trust certificate was not found for role "${role}". Run full_deploy.sh so fabric-ca/*/ca-cert.pem and tls-cert.pem are generated.`);
    }

<<<<<<< Updated upstream
    cacheKey = `${normalizedRole}:${certPaths.map(getFileSignature).join('|')}`;
    if (caConfigCache.has(cacheKey)) {
        return caConfigCache.get(cacheKey);
=======
    cacheKey = `${normalizedRole}:${(certPaths || []).map(getFileSignature).join('|')}`;
    const cachedConfig = getCachedCAConfig(cacheKey);
    if (cachedConfig) {
        return cachedConfig;
>>>>>>> Stashed changes
    }

    const allowInsecureTLS = process.env.FABRIC_CA_INSECURE_TLS === 'true';
    const tlsOptions = {
<<<<<<< Updated upstream
        trustedRoots: certPaths.map((certPath) => fs.readFileSync(certPath, 'utf8')),
        verify: true
=======
        trustedRoots: certPaths ? certPaths.map((certPath) => fs.readFileSync(certPath, 'utf8')) : [],
        verify: !allowInsecureTLS && certPaths && certPaths.length > 0
>>>>>>> Stashed changes
    };

    if (allowInsecureTLS) {
        console.warn(`[Fabric CA TLS] Hostname verification is disabled for ${caName}. Do not enable FABRIC_CA_INSECURE_TLS in production.`);
    }

    const caClient = new FabricCAServices(caURL, tlsOptions, caName);

    console.log(`[Fabric CA TLS] ${caName} trust roots: ${certPaths.map((certPath) => path.basename(path.dirname(certPath)) + '/' + path.basename(certPath)).join(', ')}`);

    const config = { caURL, caName, adminLabel, mspId, certPaths, tlsOptions, caClient };
    caConfigCache.set(cacheKey, { config, createdAt: Date.now(), lastAccessed: Date.now() });
    return config;
};

const uploadExcel = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const safeName = path.basename(file.originalname); 
            cb(null, Date.now() + '-' + safeName);
        }
    }),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv' && ext !== '.xlsx' && ext !== '.xls') {
            return cb(new Error('INVALID_FILE_TYPE'));
        }
        cb(null, true);
    }
}).single('excel');

const handleUploadMiddleware = (req, res, next) => {
    uploadExcel(req, res, (err) => {
        if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload error: ${err.message}.` });
        if (err && err.message === 'INVALID_FILE_TYPE') return res.status(400).json({ error: 'Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.' });
        if (err) return res.status(500).json({ error: `Unknown upload error: ${err.message}` });
        next();
    });
};

const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-user-identity');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const HTTP_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const httpRequestStats = new Map();

const normalizeMetricPath = (req) => {
    if (req.route?.path) {
        return Array.isArray(req.route.path) ? req.route.path.join('|') : String(req.route.path);
    }

    return req.path
        .replace(/[0-9a-fA-F]{8,}/g, ':id')
        .replace(/\b\d+\b/g, ':id');
};

const getHttpMetric = (method, route, statusCode) => {
    const status = String(statusCode);
    const key = JSON.stringify({ method, route, status });
    let metric = httpRequestStats.get(key);

    if (!metric) {
        metric = {
            method,
            route,
            status,
            count: 0,
            sum: 0,
            buckets: HTTP_DURATION_BUCKETS.map((le) => ({ le, count: 0 })),
            inf: 0
        };
        httpRequestStats.set(key, metric);
    }

    return metric;
};

const observeHttpRequest = (req, res, durationSeconds) => {
    const metric = getHttpMetric(req.method, normalizeMetricPath(req), res.statusCode);
    metric.count += 1;
    metric.sum += durationSeconds;
    metric.inf += 1;

    for (const bucket of metric.buckets) {
        if (durationSeconds <= bucket.le) bucket.count += 1;
    }
};

app.use((req, res, next) => {
    if (req.path === '/metrics') return next();

    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        observeHttpRequest(req, res, durationSeconds);
    });
    next();
});

const escapeMetricLabel = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const metricLabels = (labels) => Object.entries(labels)
    .map(([key, value]) => `${key}="${escapeMetricLabel(value)}"`)
    .join(',');

const renderPrometheusMetrics = () => {
    const memory = process.memoryUsage();
    const lines = [
        '# HELP process_resident_memory_bytes Resident memory size in bytes.',
        '# TYPE process_resident_memory_bytes gauge',
        `process_resident_memory_bytes ${memory.rss}`,
        '# HELP nodejs_heap_size_total_bytes Total V8 heap size in bytes.',
        '# TYPE nodejs_heap_size_total_bytes gauge',
        `nodejs_heap_size_total_bytes ${memory.heapTotal}`,
        '# HELP nodejs_heap_size_used_bytes Used V8 heap size in bytes.',
        '# TYPE nodejs_heap_size_used_bytes gauge',
        `nodejs_heap_size_used_bytes ${memory.heapUsed}`,
        '# HELP nodejs_external_memory_bytes External memory size in bytes.',
        '# TYPE nodejs_external_memory_bytes gauge',
        `nodejs_external_memory_bytes ${memory.external}`,
        '# HELP process_uptime_seconds Process uptime in seconds.',
        '# TYPE process_uptime_seconds gauge',
        `process_uptime_seconds ${process.uptime()}`,
        '# HELP blockgo_gateway_cache_entries Active cached Fabric gateways.',
        '# TYPE blockgo_gateway_cache_entries gauge',
        `blockgo_gateway_cache_entries ${userGatewayCache.size}`,
        '# HELP blockgo_gateway_cache_max_entries Configured maximum cached Fabric gateways.',
        '# TYPE blockgo_gateway_cache_max_entries gauge',
        `blockgo_gateway_cache_max_entries ${GATEWAY_CACHE_MAX_USERS}`,
        '# HELP blockgo_ca_config_cache_entries Cached Fabric CA client configurations.',
        '# TYPE blockgo_ca_config_cache_entries gauge',
        `blockgo_ca_config_cache_entries ${caConfigCache.size}`,
        '# HELP blockgo_managed_interval_count Active managed interval timers.',
        '# TYPE blockgo_managed_interval_count gauge',
        `blockgo_managed_interval_count ${managedIntervals.size}`,
        '# HELP blockgo_shutdown_in_progress Whether the middleware is draining for shutdown.',
        '# TYPE blockgo_shutdown_in_progress gauge',
        `blockgo_shutdown_in_progress ${isShuttingDown ? 1 : 0}`,
        '# HELP http_requests_total Total HTTP requests by method, route, and status.',
        '# TYPE http_requests_total counter'
    ];

    for (const metric of httpRequestStats.values()) {
        const labels = metricLabels({ method: metric.method, route: metric.route, status: metric.status });
        lines.push(`http_requests_total{${labels}} ${metric.count}`);
    }

    lines.push(
        '# HELP http_request_duration_seconds HTTP request duration in seconds.',
        '# TYPE http_request_duration_seconds histogram'
    );

    for (const metric of httpRequestStats.values()) {
        for (const bucket of metric.buckets) {
            const labels = metricLabels({ method: metric.method, route: metric.route, status: metric.status, le: bucket.le });
            lines.push(`http_request_duration_seconds_bucket{${labels}} ${bucket.count}`);
        }

        const infLabels = metricLabels({ method: metric.method, route: metric.route, status: metric.status, le: '+Inf' });
        const baseLabels = metricLabels({ method: metric.method, route: metric.route, status: metric.status });
        lines.push(`http_request_duration_seconds_bucket{${infLabels}} ${metric.inf}`);
        lines.push(`http_request_duration_seconds_count{${baseLabels}} ${metric.count}`);
        lines.push(`http_request_duration_seconds_sum{${baseLabels}} ${metric.sum}`);
    }

    return `${lines.join('\n')}\n`;
};

const dbRead = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST === 'postgres' ? '127.0.0.1' : (process.env.POSTGRES_HOST || '127.0.0.1'),
    database: process.env.POSTGRES_DB || 'ActivityLogs',
    password: process.env.POSTGRES_PASS || 'password',
    port: process.env.POSTGRES_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000
});

let mainIp = process.env.MAIN_CAMPUS_IP;
if (mainIp === 'host-gateway') mainIp = '127.0.0.1';

const dbWrite = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: mainIp || process.env.POSTGRES_HOST || '127.0.0.1',
    database: process.env.POSTGRES_DB || 'ActivityLogs',
    password: process.env.POSTGRES_PASS || 'password',
    port: process.env.POSTGRES_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000
});

dbRead.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL read client:', err);
});
dbWrite.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL write client:', err);
});
async function getWallet(role = 'registrar') {
    if (!role) role = 'registrar';
    const normalizedRole = normalizeDatabaseRole(role);
    let couchUrl;
    const user = process.env.COUCHDB_USER || 'capstone';
    const pass = process.env.COUCHDB_PASS || 'pass123';
    const host = fs.existsSync('/.dockerenv') ? 'host.docker.internal' : '127.0.0.1';

    if (normalizedRole === 'system_admin') {
        throw new Error('System administrator accounts do not have Fabric wallets.');
    }

    if (normalizedRole === 'faculty') {
        couchUrl = process.env.COUCHDB_WALLET_FACULTY_URL || `http://${user}:${pass}@${host}:6990`;
    } else if (normalizedRole === 'department_admin') {
        couchUrl = process.env.COUCHDB_WALLET_DEPARTMENT_URL || `http://${user}:${pass}@${host}:7990`;
    } else if (normalizedRole === 'registrar' || normalizedRole === 'student') {
        couchUrl = process.env.COUCHDB_WALLET_REGISTRAR_URL || process.env.COUCHDB_WALLET_URL || `http://${user}:${pass}@${host}:5990`;
    } else {
        throw new Error(`Unsupported Fabric role "${normalizedRole || 'unknown'}".`);
    }

    if (couchUrl) {
        const walletSuffix = normalizedRole === 'faculty'
            ? 'faculty'
            : normalizedRole === 'department_admin'
                ? 'department'
                : 'registrar';
        const walletName = `fabric_wallet_${walletSuffix}`;
        const wallet = await Wallets.newCouchDBWallet(couchUrl, walletName);
        const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
        if (encryptionKey) {
            const originalPut = wallet.put.bind(wallet);
            const originalGet = wallet.get.bind(wallet);

            wallet.put = async (label, identity) => {
                const identityToStore = {
                    ...identity,
                    credentials: { ...identity?.credentials }
                };

                if (identityToStore.credentials && identityToStore.credentials.privateKey) {
                    const salt = crypto.randomBytes(16);
                    
                    const key = await scryptAsync(encryptionKey, salt, 32);
                    const iv = crypto.randomBytes(12);
                    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
                    
                    let encrypted = cipher.update(identityToStore.credentials.privateKey, 'utf8', 'hex');
                    encrypted += cipher.final('hex');
                    const authTag = cipher.getAuthTag().toString('hex');
                    
                    identityToStore.credentials.privateKey = `ENC:${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
                }
                return originalPut(label, identityToStore);
            };

            wallet.get = async (label) => {
                const identity = await originalGet(label);
                if (identity && identity.credentials && identity.credentials.privateKey && identity.credentials.privateKey.startsWith('ENC:')) {
                    const parts = identity.credentials.privateKey.split(':');
                    let key, ivHex, authTagHex, encryptedHex;
                    
                    if (parts.length === 5) {
                        const [, saltHex, ivPart, authTagPart, encryptedPart] = parts;
                        key = await scryptAsync(encryptionKey, Buffer.from(saltHex, 'hex'), 32);
                        ivHex = ivPart;
                        authTagHex = authTagPart;
                        encryptedHex = encryptedPart;
                    } else if (parts.length === 4) {
                        const [, ivPart, authTagPart, encryptedPart] = parts;
                        key = await scryptAsync(encryptionKey, 'salt', 32);
                        ivHex = ivPart;
                        authTagHex = authTagPart;
                        encryptedHex = encryptedPart;
                    } else {
                        throw new Error("Invalid encrypted private key format");
                    }
                    
                    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
                    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
                    
                    identity.credentials.privateKey = decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
                }
                return identity;
            };
        }
        return wallet;
    }
    const walletPath = path.resolve(__dirname, process.env.WALLET_PATH || 'wallet');
    return await Wallets.newFileSystemWallet(walletPath);
}

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET environment variable is missing. Please set it in your .env file.");
    process.exit(1);
}
// Derive a fixed 32-byte HS256 key from the full configured secret.
JWT_SECRET = crypto.createHash('sha256').update(JWT_SECRET.trim(), 'utf8').digest();

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
    console.error("FATAL ERROR: INTERNAL_API_KEY environment variable is missing. Please set it in your .env file.");
    process.exit(1);
}

const authenticateJWT = (req, res, next) => {
    if (req.headers['x-api-key'] === INTERNAL_API_KEY) {
        req.isInternal = true;
        return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.status(403).json({ error: "Invalid or expired token." });
            const dbRole = normalizeDatabaseRole(user.dbRole);
            if (dbRole === 'system_admin' || user.role === 'SystemAdmin') {
                return res.status(403).json({
                    error: 'System administrator accounts cannot access Fabric or academic middleware operations.'
                });
            }
            req.user = { ...user, dbRole };
            next();
        });
    } else {
        return res.status(401).json({ error: "Authentication required. Please provide a valid JWT or Internal API Key." });
    }
};

const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        if (req.isInternal) return next();
        if (!req.user || !req.user.role) {
            return res.status(403).json({ error: "Access denied: No role information found in token." });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: `Access denied: Your role (${req.user.role}) is not authorized for this action.` });
        }
        next();
    };
};
const requireRegistrarOrInternal = (req, res, next) => {
    if (req.headers['x-api-key'] === INTERNAL_API_KEY) {
        return next();
    }

    if (req.user && req.user.role === 'RegistrarMSP') {
        return next();
    }

    return res.status(403).json({ 
        error: "Access denied. Cryptographic operations require Registrar privileges or a valid Internal API Key." 
    });
};

const requireInternalApiKey = (req, res, next) => {
    if (req.headers['x-api-key'] === INTERNAL_API_KEY) {
        req.isInternal = true;
        return next();
    }

    return res.status(401).json({ error: 'Invalid or missing Internal API Key.' });
};

const clearCacheOnError = async (username, error) => {
    if (!username || !error || !error.message) return;
    const message = error.message.toLowerCase();
    if (
        message.includes('creator is malformed') ||
        message.includes('access denied') ||
        message.includes('unavailable') ||
        message.includes('unknown') ||
        message.includes('ssl') ||
        message.includes('tls') ||
        message.includes('certificate') ||
        message.includes('cert') ||
        message.includes('handshake')
    ) {
        console.warn(`[Self-Healing] Detected stale or rejected identity for ${username}`);
        if (userGatewayCache.has(username)) {
            disconnectCachedGateway(username, 'error');
        }
        try {
            const roles = ['registrar', 'faculty', 'department_admin'];
            for (const r of roles) {
                const wallet = await getWallet(r);
                if (await wallet.get(username)) {
                    console.warn(`[Self-Healing] Wiping stale wallet identity for ${username} in ${r} wallet`);
                    await wallet.remove(username);
                }
            }
        } catch (walletErr) {
            console.error(`[Self-Healing] Failed to remove stale wallet identity: ${walletErr.message}`);
        }
    }
};

async function importCryptogenAdmins() {
    console.log("Syncing natively trusted Cryptogen Admin certificates...");
    try {
        const orgs = [
            { mspId: 'RegistrarMSP', domain: 'registrar.capstone.com', label: 'system-admin-registrar', role: 'registrar', secretDir: 'registrar' },
            { mspId: 'FacultyMSP', domain: 'faculty.capstone.com', label: 'system-admin-faculty', role: 'faculty', secretDir: 'faculty' },
            { mspId: 'DepartmentMSP', domain: 'department.capstone.com', label: 'system-admin-department', role: 'department_admin', secretDir: 'department' }
        ];

        const cryptoBase = '../network/crypto-config-final-v2';

        for (const org of orgs) {
            try {
                const wallet = await getWallet(org.role);
                const mountedCertPath = path.join(ADMIN_CRYPTO_BASE, org.secretDir, 'msp-cert.pem');
                const mountedKeyPath = path.join(ADMIN_CRYPTO_BASE, org.secretDir, 'msp-key.pem');

                if (fs.existsSync(mountedCertPath) && fs.existsSync(mountedKeyPath)) {
                    const cert = fs.readFileSync(mountedCertPath, 'utf8');
                    const key = fs.readFileSync(mountedKeyPath, 'utf8');

                    await wallet.put(org.label, {
                        credentials: { certificate: cert, privateKey: key },
                        mspId: org.mspId,
                        type: 'X.509'
                    });
                    console.log(`[Identity Sync] Imported ${org.label} from mounted K8s secret.`);
                    continue;
                }

                let certPath = path.resolve(__dirname, `${cryptoBase}/peerOrganizations/${org.domain}/users/Admin@${org.domain}/msp/signcerts/Admin@${org.domain}-cert.pem`);
                
                if (!fs.existsSync(certPath)) {
                    certPath = path.resolve(__dirname, `${cryptoBase}/peerOrganizations/${org.domain}/users/Admin@${org.domain}/msp/signcerts/cert.pem`);
                }

                const keyDir = path.resolve(__dirname, `${cryptoBase}/peerOrganizations/${org.domain}/users/Admin@${org.domain}/msp/keystore`);

                if (fs.existsSync(certPath) && fs.existsSync(keyDir)) {
                    const cert = fs.readFileSync(certPath, 'utf8');
                    
                    const keyFiles = fs.readdirSync(keyDir).filter(f => f.endsWith('_sk') || f === 'priv_sk');
                    
                    if (keyFiles.length > 0) {
                        const keyPath = path.join(keyDir, keyFiles[0]);
                        const key = fs.readFileSync(keyPath, 'utf8');

                        await wallet.put(org.label, {
                            credentials: { certificate: cert, privateKey: key },
                            mspId: org.mspId,
                            type: 'X.509'
                        });
                    } else {
                        console.warn(`[Identity Sync] No private key (_sk file) found for ${org.domain}`);
                    }
                } else {
                    console.warn(`[Identity Sync] Required files missing for ${org.domain}. Check path: ${cryptoBase}`);
                }
            } catch (orgErr) {
                console.error(`[Identity Sync] Failed to process ${org.domain}: ${orgErr.message}`);
            }
        }
        console.log("Cryptogen Admin sync complete.");
    } catch (err) {
        console.error("Critical Failure in importCryptogenAdmins:", err.message);
    }
}

async function ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient) {
    try {
        let role = 'registrar';
        if (adminLabel === 'admin-faculty') role = 'faculty';
        else if (adminLabel === 'admin-department') role = 'department_admin';
        
        const wallet = await getWallet(role);
        let identity = await wallet.get(adminLabel);
        
        // If identity exists, we should still verify if it's actually valid for the current CA
        // For now, if we get an Authentication Failure later, we know we need to re-enroll.
        // A simple way to trigger re-enrollment is to check if the admin identity is present.
        if (identity) {
            console.log(`[Identity Guard] '${adminLabel}' already in wallet.`);
            return; 
        }

        console.log(`[Identity Guard] '${adminLabel}' missing from wallet. Attempting enrollment...`);
        
        const enrollSecret =
            role === 'faculty'
                ? process.env.FABRIC_CA_FACULTY_PASS
                : role === 'department_admin'
                    ? process.env.FABRIC_CA_DEPARTMENT_PASS
                    : (process.env.BOOTSTRAP_REGISTRAR_PASSWORD || process.env.BOOTSTRAP_REGISTRAR_PASS || process.env.FABRIC_CA_REGISTRAR_PASS);
        if (!enrollSecret) {
            throw new Error(`Missing Fabric CA admin enrollment secret for ${role}.`);
        }
        
        const ca = caClient || new FabricCAServices(caURL, tlsOptions, caName);
        
        const enrollment = await ca.enroll({
            enrollmentID: 'admin',
            enrollmentSecret: enrollSecret
        });

        const x509Identity = {
            credentials: { 
                certificate: enrollment.certificate, 
                privateKey: enrollment.key.toBytes() 
            },
            mspId: mspId,
            type: 'X.509',
        };

        await wallet.put(adminLabel, x509Identity);
        
        console.log(`Successfully enrolled and encrypted '${adminLabel}'.`);
    } catch (error) {
        console.error(`[ERROR] Failed to enroll admin '${adminLabel}': ${error.message}`);
        throw error; 
    }
}

async function getContractForUser(username, roleHint) {
    if (!username) {
        throw new Error('No identity provided. Transaction requires a valid username/identity.');
    }

    if (userGatewayCache.has(username)) {
        const cached = userGatewayCache.get(username);
        if (isGatewayCacheExpired(cached)) {
            disconnectCachedGateway(username, 'expired-before-use');
        } else {
            cached.lastAccessed = Date.now();
            return { contract: cached.contract, gateway: cached.gateway };
        }
    }

    if (!ccp) {
        console.log('[Ledger Gateway] Connection profile not cached. Reading from disk...');
        if (!ccpPath) {
            throw new Error('Connection profile not found. Set CONNECTION_PROFILE_PATH or include middleware/connection.json in the image.');
        }
        ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
    }

    // Deep copy the CCP to prevent race conditions when modifying it for different user contexts.
    const ccpForUser = JSON.parse(JSON.stringify(ccp));
    
    let wallet = await getWallet(roleHint);
    let identity = await wallet.get(username);
    if (!identity && !roleHint) {
        const roles = ['registrar', 'faculty', 'department_admin'];
        for (const r of roles) {
            wallet = await getWallet(r);
            identity = await wallet.get(username);
            if (identity) break;
        }
    }

    if (!identity) {
        throw new Error(`Access Denied: Wallet identity for '${username}' not found. The Registrar must register this user first.`);
    }

    let clientOrgName = null;
    for (const [orgName, orgDetails] of Object.entries(ccpForUser.organizations)) {
        if (orgDetails.mspid === identity.mspId) {
            clientOrgName = orgName;
            break;
        }
    }
    
    if (!clientOrgName) {
        throw new Error(`Organization with MSP ID "${identity.mspId}" not found in connection profile.`);
    }

    console.log(`[Ledger Gateway] Routing transaction for ${username} via organization "${clientOrgName}"`);

    if (!ccpForUser.client) ccpForUser.client = {};
    ccpForUser.client.organization = clientOrgName;

<<<<<<< Updated upstream
    // Inject full network routing to bypass broken Docker Service Discovery on localhost
    if (!fs.existsSync('/.dockerenv')) {
        const getPEM = (org, peer) => {
            try { return fs.readFileSync(path.resolve(__dirname, `../network/crypto-config-final-v2/peerOrganizations/${org}/peers/${peer}/tls/ca.crt`), 'utf8'); } catch(e) { return ""; }
        };
        const getOrdererPEM = () => {
            try { return fs.readFileSync(path.resolve(__dirname, `../network/crypto-config-final-v2/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt`), 'utf8'); } catch(e) { return ""; }
        };
=======
    const isContainerized = fs.existsSync('/.dockerenv') || fs.existsSync('/var/run/secrets/kubernetes.io');
>>>>>>> Stashed changes

    // Explicitly map the gossip domains to their actual internal IPs / K8s DNS to bypass broken Service Discovery
    const getPEM = (org, peer) => {
        const mountedRootName = {
            'registrar.capstone.com': 'registrar-peer-ca.crt',
            'faculty.capstone.com': 'faculty-peer-ca.crt',
            'department.capstone.com': 'department-peer-ca.crt'
        }[org];

        return readFirstExistingFile(
            mountedRootName ? path.join(FABRIC_GATEWAY_TLS_ROOTS, mountedRootName) : null,
            `../network/crypto-config-final-v2/peerOrganizations/${org}/peers/${peer}/tls/ca.crt`
        );
    };
    const getOrdererPEM = () => {
        return readFirstExistingFile(
            path.join(FABRIC_GATEWAY_TLS_ROOTS, 'orderer-ca.crt'),
            '../network/crypto-config-final-v2/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt'
        );
    };

    ccpForUser.peers = {
        ...ccpForUser.peers,
        'peer0.registrar.capstone.com': { url: isContainerized ? 'grpcs://peer-registrar.plv-main-campus.svc.cluster.local:7051' : 'grpcs://localhost:7051', tlsCACerts: { pem: getPEM('registrar.capstone.com', 'peer0.registrar.capstone.com') }, grpcOptions: { 'ssl-target-name-override': 'peer0.registrar.capstone.com' } },
        'peer0.faculty.capstone.com': { url: isContainerized ? 'grpcs://peer-faculty.plv-annex-campus.svc.cluster.local:7051' : 'grpcs://localhost:9051', tlsCACerts: { pem: getPEM('faculty.capstone.com', 'peer0.faculty.capstone.com') }, grpcOptions: { 'ssl-target-name-override': 'peer0.faculty.capstone.com' } },
        'peer0.department.capstone.com': { url: isContainerized ? 'grpcs://peer-department.plv-pubad-campus.svc.cluster.local:7051' : 'grpcs://localhost:11051', tlsCACerts: { pem: getPEM('department.capstone.com', 'peer0.department.capstone.com') }, grpcOptions: { 'ssl-target-name-override': 'peer0.department.capstone.com' } }
    };

    ccpForUser.orderers = {
        ...ccpForUser.orderers,
        'orderer.capstone.com': { url: isContainerized ? 'grpcs://orderer-1.plv-main-campus.svc.cluster.local:7050' : 'grpcs://localhost:7050', tlsCACerts: { pem: getOrdererPEM() }, grpcOptions: { 'ssl-target-name-override': 'orderer.capstone.com' } }
    };

    ccpForUser.channels = {
        [process.env.CHANNEL_NAME || 'registrar-channel']: {
            orderers: ['orderer.capstone.com'],
            peers: {
                'peer0.registrar.capstone.com': { endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: true },
                'peer0.faculty.capstone.com': { endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: true },
                'peer0.department.capstone.com': { endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: true }
            }
        }
    };

    const grpcOptions = {
        'grpc.keepalive_time_ms': 120000,
        'grpc.keepalive_timeout_ms': 20000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc.max_send_message_length': -1,
        'grpc.max_receive_message_length': -1
    };

    if (ccpForUser.peers) {
        for (const peer in ccpForUser.peers) {
            ccpForUser.peers[peer].grpcOptions = { ...ccpForUser.peers[peer].grpcOptions, ...grpcOptions };
        }
    }
    if (ccpForUser.orderers) {
        for (const orderer in ccpForUser.orderers) {
            ccpForUser.orderers[orderer].grpcOptions = { ...ccpForUser.orderers[orderer].grpcOptions, ...grpcOptions };
        }
    }

    const gateway = new Gateway();
    await gateway.connect(ccpForUser, {
        wallet,
        identity: username, 
<<<<<<< Updated upstream
        discovery: { enabled: fs.existsSync('/.dockerenv'), asLocalhost: false }
=======
        discovery: { enabled: false, asLocalhost: false }
>>>>>>> Stashed changes
    });

    const network = await gateway.getNetwork(process.env.CHANNEL_NAME || 'registrar-channel');
    const contract = network.getContract(process.env.CHAINCODE_NAME || 'registrar');

    const now = Date.now();
    userGatewayCache.set(username, { gateway, contract, createdAt: now, lastAccessed: now });

    return { contract, gateway }; 
}

const getCallerIdentity = (req) => {
    if (req.user && req.user.username) return req.user.username;

    if (req.isInternal) {
        const identity = req.headers['x-user-identity'] || req.query.invokerId;
        if (identity) {
            return identity;
        }
        // Trusting identity from the request body is insecure, even for internal calls.
        // The calling service must provide the identity in the 'x-user-identity' header.
        throw new Error("Internal call is missing the 'x-user-identity' header.");
    }
    throw new Error("Unauthorized caller identity access attempt.");
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: { error: 'Too many login attempts from this IP, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const signLoginToken = (username, platformRole, dbRole) => {
    const tokenPayload = {
        username,
        role: platformRole,
        dbRole,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier": username,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": username,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": username,
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": dbRole
    };

    const jwtOptions = { expiresIn: process.env.JWT_EXPIRES_IN || '12h' };
    if (process.env.JWT_ISSUER) jwtOptions.issuer = process.env.JWT_ISSUER;
    if (process.env.JWT_AUDIENCE) jwtOptions.audience = process.env.JWT_AUDIENCE;

    return jwt.sign(tokenPayload, JWT_SECRET, jwtOptions);
};

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const normalizedUsername = (username || '').trim().toLowerCase();
        const baseUsername = normalizedUsername.split('@')[0];
        
        const userResult = await dbRead.query(`
            SELECT u.* 
            FROM Users u 
            LEFT JOIN studentprofiles sp ON u.id = sp.user_id 
            WHERE LOWER(u.email) = $1 
               OR LOWER(u.email) = $2
               OR LOWER(sp.student_no) = $1 
               OR LOWER(sp.student_no) = $2
            LIMIT 1
        `, [normalizedUsername, baseUsername]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: "Invalid email/student_no. or password." });
        }
        
        const userRecord = userResult.rows[0];
        const walletIdentityName = userRecord.email;
        
        if (userRecord.status === 'pending') {
            return res.status(403).json({ error: "Account pending administrative approval." });
        }

        const validPassword = await bcrypt.compare(password, userRecord.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const dbRole = normalizeDatabaseRole(userRecord.role);
        if (dbRole === 'system_admin') {
            const token = signLoginToken(walletIdentityName, 'SystemAdmin', dbRole);
            return res.status(200).json({
                status: 'success',
                token,
                message: 'Use this token in the Authorization header: Bearer <token>'
            });
        }

        const wallet = await getWallet(dbRole);
        let identity = await wallet.get(walletIdentityName);
        
        if (!identity) {
            console.warn(`[Self-Healing] Wallet missing for ${walletIdentityName}. Attempting automatic recovery...`);
            try {
                const { caURL, caName, adminLabel, mspId, tlsOptions, caClient } = getCAConfig(dbRole);
                const ca = caClient;
                
                try {
                    const enrollment = await ca.enroll({
                        enrollmentID: walletIdentityName,
                        enrollmentSecret: password,
                        attr_reqs: [{ name: 'role', optional: true }, { name: 'grade.manage', optional: true }]
                    });
                    await wallet.put(walletIdentityName, {
                        credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() },
                        mspId: mspId,
                        type: 'X.509'
                    });
                } catch (enrollErr) {
                    console.log(`[Self-Healing] Enrollment failed, attempting to register ${walletIdentityName} into CA...`);
                    
                    await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);
                    
                    const adminIdentity = await wallet.get(adminLabel);
                    if (!adminIdentity) throw new Error(`Admin ${adminLabel} missing from wallet.`);
                    
                    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
                    let adminUser = await provider.getUserContext(adminIdentity, 'admin');
                    
                    const registerPayload = {
                        enrollmentID: walletIdentityName,
                        enrollmentSecret: password,
                        role: (dbRole === 'registrar' || dbRole === 'department_admin') ? 'admin' : 'client',
                        maxEnrollments: -1,
                        attrs: [
                            { name: 'role', value: dbRole, ecert: true },
                            { name: 'grade.manage', value: dbRole === 'faculty' ? 'true' : 'false', ecert: true }
                        ]
                    };
                    
                    try {
                        await ca.register(registerPayload, adminUser);
                    } catch (regErr) {
                        if (regErr.toString().includes('code: 20') || regErr.toString().includes('Authentication failure')) {
                            console.warn(`[Self-Healing] Admin authentication failed for ${adminLabel}. Stale cert suspected. Re-enrolling...`);
                            await wallet.remove(adminLabel);
                            await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);
                            
                            const newAdminIdentity = await wallet.get(adminLabel);
                            adminUser = await provider.getUserContext(newAdminIdentity, 'admin');
                            await ca.register(registerPayload, adminUser);
                        } else if (regErr.toString().includes('code: 74') || regErr.toString().includes('is already registered')) {
                            console.log(`[Self-Healing] ${walletIdentityName} already exists in CA. Re-registering for wallet recovery...`);
                            const identityService = ca.newIdentityService();
                            try {
                                const forceDeleteUrl = identityService._client.getBaseURL() + '/api/v1/identities/' + walletIdentityName + '?force=true';
                                await identityService._client.delete(forceDeleteUrl, adminUser);
                                await ca.register(registerPayload, adminUser);
                            } catch (e) {
                                console.log(`[Self-Healing] CA Force Delete failed: ${e.message}. Attempting forced update...`);
                                await identityService.update(walletIdentityName, { 
                                    type: registerPayload.role,
                                    enrollmentSecret: password,
                                    maxEnrollments: -1,
                                    attrs: registerPayload.attrs 
                                }, adminUser);
                            }
                        } else {
                            throw regErr;
                        }
                    }
                    
                    const newEnrollment = await ca.enroll({
                        enrollmentID: walletIdentityName,
                        enrollmentSecret: password,
                        attr_reqs: [{ name: 'role', optional: true }, { name: 'grade.manage', optional: true }]
                    });
                    await wallet.put(walletIdentityName, {
                        credentials: { certificate: newEnrollment.certificate, privateKey: newEnrollment.key.toBytes() },
                        mspId: mspId,
                        type: 'X.509'
                    });
                }
                console.log(`[Self-Healing] Successfully recovered wallet for ${walletIdentityName}`);
                identity = await wallet.get(walletIdentityName);
            } catch (recoveryErr) {
                console.error(`[Self-Healing] Recovery failed: ${recoveryErr.message}`);
                return res.status(401).json({ error: "Blockchain Identity not found, and automatic recovery failed. Please contact admin." });
            }
        }


        const token = signLoginToken(walletIdentityName, identity.mspId, dbRole);
        res.status(200).json({ status: "success", token, message: "Use this token in the Authorization header: Bearer <token>" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/crypto/hash-password', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: "Password is required." });
        }
        const hash = await bcrypt.hash(password, 10);
        res.status(200).json({ hash });
    } catch (error) {
        res.status(500).json({ error: "Failed to hash password." });
    }
});

app.post('/api/fabric/register-user', authenticateJWT, requireRegistrarOrInternal, async (req, res) => {
    try {
        const { email, role } = req.body;
        
        const { caURL, caName, adminLabel, mspId, tlsOptions, caClient } = getCAConfig(role);
        
        await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);

        const ca = caClient;
        const wallet = await getWallet(role);
        const adminIdentity = await wallet.get(adminLabel);
        if (!adminIdentity) {
            return res.status(500).json({ error: `Blockchain Admin '${adminLabel}' not found in wallet. Cannot register users.` });
        }

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        let adminUser = await provider.getUserContext(adminIdentity, 'admin');

        const secret = req.body.password || crypto.randomBytes(12).toString('hex');
        
        const registerUser = async (user) => {
            return await ca.register({
                enrollmentID: email,
                enrollmentSecret: secret,
                role: (role === 'registrar' || role === 'department_admin' || role === 'deptAdmin' || role === 'chairperson') ? 'admin' : 'client',
                attrs: [{ name: 'role', value: role, ecert: true }, { name: 'grade.manage', value: role === 'faculty' ? 'true' : 'false', ecert: true }]
            }, user);
        };

        try {
            await registerUser(adminUser);
        } catch (regErr) {        
            if (regErr.toString().includes('code: 20') || regErr.toString().includes('Authentication failure')) {
                console.warn(`[Self-Healing] Admin authentication failed for ${adminLabel}. Stale cert suspected. Re-enrolling...`);
                await wallet.remove(adminLabel);
                await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);
                
                const newAdminIdentity = await wallet.get(adminLabel);
                adminUser = await provider.getUserContext(newAdminIdentity, 'admin');
                await registerUser(adminUser);
            } else {
                throw regErr;
            }
        }

        const enrollment = await ca.enroll({ 
            enrollmentID: email, 
            enrollmentSecret: secret,
            attr_reqs: [
                { name: 'role', optional: true },
                { name: 'grade.manage', optional: true }
            ]
        });
        const x509Identity = { credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() }, mspId: mspId, type: 'X.509' };
        await wallet.put(email, x509Identity);

        res.status(200).json({ status: "Success", message: "Blockchain Wallet created successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to create Fabric wallet: " + error.message });
    }
});

const passwordResetLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 5,
	message: { error: 'Too many password reset requests from this IP, please try again after 15 minutes.' },
    standardHeaders: true,
	legacyHeaders: false,
});

app.post('/api/forgot-password', passwordResetLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await dbRead.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(200).json({ message: "If that email exists, a reset link has been sent." });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + 3600000;

        await dbWrite.query('UPDATE Users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3', [resetToken, tokenExpiry, email]);

        const frontendUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost';
        const resetURL = `${frontendUrl}/reset-password?token=${resetToken}`;
        
        console.log(`[PasswordReset] Reset link generated for ${email}.`);

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || process.env.EMAIL_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER || process.env.EMAIL_USER,
                pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"PLV Registrar BLOCKGO" <noreply@capstone.com>',
            to: email,
            subject: 'Password Reset Request',
            text: `You requested a password reset. Please click the following link to reset your password:\n\n${resetURL}\n\nIf you did not request this, please ignore this email.`,
            html: `<p>You requested a password reset. Please click the following link to reset your password:</p><p><a href="${resetURL}">${resetURL}</a></p><p>If you did not request this, please ignore this email.</p>`
        });
        console.log(`[PROD MODE] Actual email sent to ${email}`);

        res.status(200).json({ message: "If that email exists, a reset link has been sent." });
    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ error: "Server error during password reset request." });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        const userResult = await dbRead.query('SELECT * FROM Users WHERE password_reset_token = $1 AND password_reset_expires > $2', [token, Date.now()]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        const user = userResult.rows[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await dbWrite.query('UPDATE Users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2', [hashedPassword, user.id]);

        res.status(200).json({ message: "Password updated successfully. You can now log in." });
    } catch (error) {
        res.status(500).json({ error: "Server error." });
    }
});

app.post('/api/enroll', authenticateJWT, requireRegistrarOrInternal, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const { caName, mspId, caClient } = getCAConfig(role);

        const ca = caClient;
        const wallet = await getWallet(role);

        if (await wallet.get(username)) {
            return res.status(200).json({ status: "success", message: "User is already enrolled in the wallet." });
        }

        console.log(`[Enroll] Downloading certificates for ${username} from ${caName}...`);
        const enrollment = await ca.enroll({
            enrollmentID: username,
            enrollmentSecret: password,
            attr_reqs: [
                { name: 'role', optional: true },
                { name: 'grade.manage', optional: true }
            ]
        });
        
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: 'X.509',
        };
        await wallet.put(username, x509Identity);

        console.log(`[Enroll] Successfully saved ${username} to wallet as ${mspId}!`);
        res.status(200).json({ status: "success", message: `Wallet created for ${username}` });

    } catch (error) {
        console.error('[Enroll] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/register', authenticateJWT, requireRegistrarOrInternal, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        const { caURL, caName, adminLabel, mspId, tlsOptions, caClient } = getCAConfig(role);
        
        await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);
        
        const wallet = await getWallet(role);
        const adminIdentity = await wallet.get(adminLabel);

        if (!adminIdentity) {
            console.error("Identity Guard Failed: Admin wallet missing from /wallet/ directory.");
            return res.status(500).json({ 
                error: "Middleware configuration error", 
                message: `Admin identity '${adminLabel}' not enrolled. Please run enrollAllAdmins.js first.` 
            });
        }

        const ca = caClient;

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        let secret = password;
        secret = await ca.register({
            enrollmentID: username,
            enrollmentSecret: password,
            role: (role === 'registrar' || role === 'department_admin' || role === 'deptAdmin' || role === 'chairperson') ? 'admin' : 'client',
            attrs: [
                { name: 'role', value: role, ecert: true },
                { name: 'grade.manage', value: role === 'faculty' ? 'true' : 'false', ecert: true }
            ]
        }, adminUser);

        res.status(201).json({ status: "success", secret });
    } catch (error) { 
        console.error(`[Register] Error:`, error.message);
        res.status(500).json({ error: "Server Exception", details: error.message }); 
    }
});

app.post('/api/revoke', authenticateJWT, requireRegistrarOrInternal, async (req, res) => {
    try {
        const { username, role } = req.body;
        
        const { caURL, caName, adminLabel, mspId, tlsOptions, caClient } = getCAConfig(role);
        
        await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);
        
        const wallet = await getWallet(role);
        const adminIdentity = await wallet.get(adminLabel);

        if (!adminIdentity) {
            console.error("Identity Guard Failed: Admin wallet missing from /wallet/ directory.");
            return res.status(500).json({ 
                error: "Middleware configuration error", 
                message: `Admin identity '${adminLabel}' not enrolled. Please run enrollAllAdmins.js first.` 
            });
        }

        const userIdentity = await wallet.get(username);
        if (!userIdentity) {
            return res.status(404).json({
                error: "Identity Mismatch",
                message: `Wallet for user ${username} does not exist.`
            });
        }

        const ca = caClient;

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        await ca.revoke({ enrollmentID: username, reason: "Revoked by admin" }, adminUser);
        if (await wallet.get(username)) await wallet.remove(username);

        disconnectCachedGateway(username, 'revoked');

        res.status(200).json({ status: "success", message: `Revoked ${username}` });
    } catch (error) { 
        console.error(`[Revoke] Error:`, error.message);
        res.status(500).json({ error: "Server Exception", details: error.message }); 
    }
});

app.get('/api/all-grades', authenticateJWT, async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        
        let contractToUse;
        try {
            const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);
            contractToUse = contract;
        } catch (walletErr) {
            if (req.isInternal || walletErr.message.includes('not found')) {
                console.warn(`[Ledger Gateway] Wallet missing for ${username}. Falling back to system-admin-registrar for internal read query.`);
                const { contract } = await getContractForUser('system-admin-registrar', 'registrar');
                contractToUse = contract;
            } else {
                throw walletErr;
            }
        }

        console.log(`[GetAllGrades] Querying for ${username}...`);
        let result;
        try {
            result = await contractToUse.evaluateTransaction('GetAllGrades');
        } catch (evalErr) {
            if (evalErr.message.includes('creator is malformed') || evalErr.message.includes('access denied') || evalErr.message.includes('UNKNOWN')) {
                console.warn(`[Self-Healing] ${username} identity rejected by peer. Falling back to system-admin-registrar.`);
                clearCacheOnError(username, evalErr); // Wipe the stale wallet in background
                const { contract: fallbackContract } = await getContractForUser('system-admin-registrar', 'registrar');
                result = await fallbackContract.evaluateTransaction('GetAllGrades');
            } else { throw evalErr; }
        }

        try {
            const grades = JSON.parse(result.toString());
            
            if (Array.isArray(grades)) {
                // --- Decode Base64 X.509 Identity from Chaincode for Frontend display ---
                grades.forEach(g => {
                    const facId = g.faculty_id || g.facultyId || g.FacultyId;
                    if (facId && facId.length > 40 && !facId.includes('@')) {
                        try {
                            const decoded = Buffer.from(facId, 'base64').toString('utf8');
                            const cnMatch = decoded.match(/CN=([^,]+)/);
                            if (cnMatch && cnMatch[1]) {
                                if (g.faculty_id) g.faculty_id = cnMatch[1];
                                if (g.facultyId) g.facultyId = cnMatch[1];
                                if (g.FacultyId) g.FacultyId = cnMatch[1];
                            }
                        } catch(e) {}
                    }
                });
            }
            
            let userRole = req.user ? req.user.dbRole : null;
            if (!userRole && req.isInternal) {
                try {
                    const userRes = await dbRead.query('SELECT role FROM Users WHERE email = $1', [username]);
                    if (userRes.rows.length > 0) userRole = userRes.rows[0].role;
                } catch (dbErr) {
                    console.error(`[DB Error] Failed to fetch role for ${username}: ${dbErr.message}`);
                }
            }
            
            if (userRole === 'student') {
                const studentGrades = grades.filter(g => 
                    g.student_hash === username || 
                    g.studentId === username ||
                    g.studentId === username.split('@')[0]
                );
                return res.status(200).json({ status: 'success', data: studentGrades });
            }
            else if (userRole === 'faculty') {
                const facultyGrades = grades.filter(g => g.faculty_id === username);
                return res.status(200).json({ status: 'success', data: facultyGrades });
            }
            else if (userRole === 'department_admin' || userRole === 'deptAdmin') {
                const profileRes = await dbRead.query(
                    'SELECT ap.department FROM AdminProfiles ap JOIN Users u ON ap.user_id = u.id WHERE u.email = $1',
                    [username]
                );
                
                if (profileRes.rows.length > 0 && profileRes.rows[0].department && profileRes.rows[0].department !== 'Unassigned') {
                    const adminDept = profileRes.rows[0].department;
                    
                    const baseDept = adminDept.toUpperCase().startsWith('BS') ? adminDept.substring(2) : adminDept;
                    
                    const deptGrades = grades.filter(g => {
                        const c = (g.course || '').toUpperCase();
                        const s = (g.subject_code || '').toUpperCase();
                        return c.includes(adminDept.toUpperCase()) || s.includes(adminDept.toUpperCase()) ||
                               c.includes(baseDept) || s.includes(baseDept);
                    });
                    return res.status(200).json({ status: 'success', data: deptGrades });
                }
                return res.status(200).json({ status: 'success', data: [] });
            }
            
            res.status(200).json({ status: 'success', data: grades });
        } catch (e) {
            res.status(200).json({ status: 'success', data: result.toString() });
        }
    } catch (error) {
        clearCacheOnError(username, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/issue-grade', authenticateJWT, authorizeRole(['FacultyMSP', 'DepartmentMSP']), async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);

        const gradeAsset = JSON.stringify(req.body);
        console.log(`[IssueGrade] Submitting as ${username}... Payload: ${gradeAsset}`);
        
        const result = await contract.submitTransaction('IssueGrade', gradeAsset);
        res.status(201).json({ status: "success", message: "Grade recorded", details: result.toString() });
    } catch (error) {
        clearCacheOnError(username, error);
        console.error('[IssueGrade] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/get-grade/:id', authenticateJWT, async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        
        let contractToUse;
        try {
            const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);
            contractToUse = contract;
        } catch (walletErr) {
            if (req.isInternal || walletErr.message.includes('not found')) {
                const { contract } = await getContractForUser('system-admin-registrar', 'registrar');
                contractToUse = contract;
            } else { throw walletErr; }
        }

        console.log(`[ReadGrade] Fetching ${req.params.id} for ${username}...`);
        let result;
        try {
            result = await contractToUse.evaluateTransaction('ReadGrade', req.params.id);
        } catch (evalErr) {
            if (evalErr.message.includes('creator is malformed') || evalErr.message.includes('access denied') || evalErr.message.includes('UNKNOWN')) {
                clearCacheOnError(username, evalErr);
                const { contract: fallbackContract } = await getContractForUser('system-admin-registrar', 'registrar');
                result = await fallbackContract.evaluateTransaction('ReadGrade', req.params.id);
            } else { throw evalErr; }
        }

        res.status(200).json(JSON.parse(result.toString()));
    } catch (error) {
        clearCacheOnError(username, error);
        res.status(404).json({ error: "Record not found" });
    }
});

app.post('/api/update-grade', authenticateJWT, async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);

        const gradeAsset = JSON.stringify(req.body);
        console.log(`[UpdateGrade] Updating as ${username}`);
        
        await contract.submitTransaction('UpdateGrade', gradeAsset);
        res.status(200).json({ status: "success", message: "Grade updated" });
    } catch (error) {
        clearCacheOnError(username, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/approve-grade/:id', authenticateJWT, async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);

        await contract.submitTransaction('ApproveGrade', req.params.id);
        res.status(200).json({ status: "success", message: "Grade approved" });
    } catch (error) {
        clearCacheOnError(username, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/finalize-grade/:id', authenticateJWT, async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);

        await contract.submitTransaction('FinalizeRecord', req.params.id);
        res.status(200).json({ status: "success", message: "Record finalized" });
    } catch (error) {
        clearCacheOnError(username, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/return-grade/:id', authenticateJWT, async (req, res) => {
    let username;
    try {
        username = getCallerIdentity(req);
        const { note } = req.body;
        const { contract } = await getContractForUser(username, req.user ? req.user.dbRole : null);

        await contract.submitTransaction('ReturnGrade', req.params.id, note || 'Returned for revision');
        res.status(200).json({ status: "success", message: "Record returned for revision" });
    } catch (error) {
        clearCacheOnError(username, error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/wallet/:username', authenticateJWT, requireRegistrarOrInternal, async (req, res) => {
    try {
        let deleted = false;
        const roles = ['registrar', 'faculty', 'department_admin'];
        for (const r of roles) {
            const wallet = await getWallet(r);
            if (await wallet.get(req.params.username)) {
                await wallet.remove(req.params.username);
                deleted = true;
            }
        }
        if (deleted) {
            disconnectCachedGateway(req.params.username, 'identity-removed');
            return res.status(200).json({ status: "success", message: "Wallet identity deleted." });
        }
        res.status(404).json({ status: "error", message: "Identity not found in wallet." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/SystemSettings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        await dbWrite.query("CREATE TABLE IF NOT EXISTS systemsettings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)");
        const result = await dbRead.query("SELECT value FROM systemsettings WHERE key = $1", [key]);
        if (result.rows.length > 0) {
            return res.status(200).json({ status: "Success", value: result.rows[0].value });
        }
        return res.status(200).json({ status: "NotFound", value: null });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

app.post('/api/SystemSettings', authenticateJWT, async (req, res) => {
    try {
        if (req.user && req.user.dbRole !== 'registrar' && req.user.dbRole !== 'admin') {
            return res.status(403).json({ status: "Error", message: "Only registrars can modify system settings." });
        }
        const key = req.body.key || req.body.Key;
        const value = req.body.value || req.body.Value;
        if (!key) return res.status(400).json({ status: "Error", message: "Key is required" });
        
        await dbWrite.query("CREATE TABLE IF NOT EXISTS systemsettings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)");
        await dbWrite.query(
            "INSERT INTO systemsettings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            [key, value]
        );
        return res.status(200).json({ status: "Success", message: "Setting updated successfully" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

app.post('/api/SystemSettings/reset-season', authenticateJWT, async (req, res) => {
    try {
        if (req.user && req.user.dbRole !== 'registrar' && req.user.dbRole !== 'admin') {
            return res.status(403).json({ status: "Error", message: "Only registrars can reset the season." });
        }
        await dbWrite.query("TRUNCATE TABLE pending_grade_records");
        return res.status(200).json({ status: "Success", message: "Encoding season reset. Staging area cleared." });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

const handleBatchUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded. Expected form-data field "excel".' });
        }

        const filePath = req.file.path;
        const mapperPath = path.resolve(__dirname, '..', 'mapper.py');
        
        if (!fs.existsSync(mapperPath)) {
            return res.status(500).json({ error: 'Mapper script not found', expected: mapperPath });
        }

        const facultyId = req.body.facultyId || req.body.username || req.user?.username || 'admin';
        
        const workerPath = path.resolve(__dirname, 'uploadWorker.js');
        if (!fs.existsSync(workerPath)) {
            return res.status(500).json({ error: 'Worker script not found' });
        }

        console.log(`[BatchUpload] Dispatching upload to worker thread for ${facultyId}`);

        const worker = new Worker(workerPath, {
            workerData: {
                mapperPath,
                filePath,
                facultyId,
                INTERNAL_API_KEY,
                term: req.body.term || ''
            }
        });

        worker.on('message', (message) => {
            if (!res.headersSent) {
                if (message.status === 'success') {
                    res.status(200).json({ status: 'success', message: 'Batch grades processed successfully', output: message.output });
                } else {
                    res.status(500).json({ status: 'error', ...message });
                }
            }
        });

        worker.on('error', (err) => {
            console.error('[Worker] Error:', err);
            if (!res.headersSent) res.status(500).json({ status: 'error', error: 'Worker process failed: ' + err.message });
        });

        worker.on('exit', (code) => {
            if (code !== 0 && !res.headersSent) {
                res.status(500).json({ status: 'error', error: `Worker stopped with exit code ${code}` });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

app.post(['/api/batch-upload', '/api/upload-grades'], authenticateJWT, handleUploadMiddleware, handleBatchUpload);


app.post('/api/batch-issue-grade', async (req, res) => {
    let username;
    try {
        if (req.headers['x-api-key'] !== INTERNAL_API_KEY) {
            return res.status(401).json({ error: 'Invalid or missing API key' });
        }

        username = req.headers['x-user-identity'] || req.body.facultyId;
        if (!username) {
            return res.status(400).json({ 
                error: 'Missing faculty identity',
                hint: 'Provide x-user-identity header or facultyId in body'
            });
        }

        let wallet = await getWallet('faculty');
        let identity = await wallet.get(username);
        if (!identity) {
            wallet = await getWallet('department_admin');
            identity = await wallet.get(username);
        }
        if (!identity) {
            return res.status(401).json({ 
                error: `Faculty ${username} not found in wallet`,
                hint: 'Faculty must be registered and enrolled first'
            });
        }

        if (identity.mspId !== 'FacultyMSP' && identity.mspId !== 'DepartmentMSP') {
            return res.status(403).json({ 
                error: `Access denied: ${username} is not authorized to issue grades (MSP: ${identity.mspId})`
            });
        }

        const { contract } = await getContractForUser(username, 'faculty'); // either faculty or department works for getting the contract

        const records = req.body; // Expecting an array of AcademicRecord objects
        const recordsJSON = JSON.stringify(records);
        console.log(`[BatchIssueGrade] Submitting as ${username}... Payload: ${recordsJSON.length} bytes`);
        
        const result = await contract.submitTransaction('IssueBatchGrades', recordsJSON);
        res.status(201).json({ 
            status: 'success', 
            message: 'Batch grades recorded',
            facultyId: username,
            details: result.toString() 
        });
    } catch (error) {
        clearCacheOnError(username, error);
        console.error('[BatchIssueGrade] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const bootstrapSystemAdminAccount = async () => {
    const password = process.env.BOOTSTRAP_SYSTEM_ADMIN_PASSWORD || process.env.BOOTSTRAP_SYSTEM_ADMIN_PASS;
    if (!password) {
        return {
            configured: false,
            accountCreated: false,
            message: 'System administrator bootstrap skipped because BOOTSTRAP_SYSTEM_ADMIN_PASS is not configured.'
        };
    }

    const email = (process.env.BOOTSTRAP_SYSTEM_ADMIN_EMAIL || 'system-admin@plv.edu.ph').trim().toLowerCase();
    const fullName = (process.env.BOOTSTRAP_SYSTEM_ADMIN_NAME || 'PLV System Administrator').trim();
    let userResult = await dbWrite.query('SELECT id, role, password_hash FROM Users WHERE LOWER(email) = $1', [email]);
    let accountCreated = false;
    let passwordUpdated = false;

    if (userResult.rows.length === 0) {
        const hash = await bcrypt.hash(password, 12);
        userResult = await dbWrite.query(
            `INSERT INTO Users (email, password_hash, role, status, is_active)
             VALUES ($1, $2, 'system_admin', 'APPROVED', true)
             ON CONFLICT (email) DO NOTHING
             RETURNING id, role`,
            [email, hash]
        );
        accountCreated = userResult.rows.length > 0;

        if (!accountCreated) {
            userResult = await dbWrite.query('SELECT id, role, password_hash FROM Users WHERE LOWER(email) = $1', [email]);
        }
    } else {
        const userRecord = userResult.rows[0];
        const isSamePassword = await bcrypt.compare(password, userRecord.password_hash);
        if (!isSamePassword) {
            const hash = await bcrypt.hash(password, 12);
            await dbWrite.query('UPDATE Users SET password_hash = $1 WHERE id = $2', [hash, userRecord.id]);
            passwordUpdated = true;
        }
    }

    if (userResult.rows.length === 0 || normalizeDatabaseRole(userResult.rows[0].role) !== 'system_admin') {
        throw new Error(`Cannot bootstrap system administrator: ${email} already belongs to another role.`);
    }

    await dbWrite.query(
        `INSERT INTO AdminProfiles (user_id, full_name, admin_level, department)
         VALUES ($1, $2, 'system_admin', 'System Operations')
         ON CONFLICT (user_id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             admin_level = EXCLUDED.admin_level,
             department = EXCLUDED.department`,
        [userResult.rows[0].id, fullName]
    );

    return {
        configured: true,
        accountCreated,
        email,
        message: passwordUpdated
            ? 'System administrator password has been reset to the value in BOOTSTRAP_SYSTEM_ADMIN_PASS.'
            : (accountCreated
                ? 'System administrator account created without a Fabric identity.'
                : 'System administrator account already exists.')
    };
};

app.get('/api/bootstrap', requireInternalApiKey, async (req, res) => {
    try {
        const email = (process.env.BOOTSTRAP_REGISTRAR_EMAIL || 'registrar@plv.edu.ph').trim().toLowerCase();
        const password = process.env.BOOTSTRAP_REGISTRAR_PASSWORD || process.env.BOOTSTRAP_REGISTRAR_PASS;
        const role = 'registrar';

        if (!password) {
            return res.status(400).json({
                error: 'BOOTSTRAP_REGISTRAR_PASSWORD or BOOTSTRAP_REGISTRAR_PASS is required before bootstrap can run.'
            });
        }

        let userResult = await dbWrite.query('SELECT id FROM Users WHERE LOWER(email) = $1', [email]);
        let accountCreated = false;

        if (userResult.rows.length === 0) {
            const hash = await bcrypt.hash(password, 10);
            userResult = await dbWrite.query(
                `INSERT INTO Users (email, password_hash, role, status)
                 VALUES ($1, $2, $3, 'APPROVED')
                 ON CONFLICT (email) DO NOTHING
                 RETURNING id`,
                [email, hash, role]
            );

            if (userResult.rows.length === 0) {
                userResult = await dbWrite.query('SELECT id FROM Users WHERE LOWER(email) = $1', [email]);
            } else {
                accountCreated = true;
            }
        }

        await dbWrite.query(
            `INSERT INTO AdminProfiles (user_id, full_name, admin_level, department)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO NOTHING`,
            [userResult.rows[0].id, 'System Registrar', role, 'Registrar']
        );

        const systemAdmin = await bootstrapSystemAdminAccount();

        const wallet = await getWallet(role);
        if (await wallet.get(email)) {
            return res.status(200).json({
                status: 'success',
                systemAdmin,
                message: 'Bootstrap already completed. Registrar account and wallet identity exist.'
            });
        }

        const { caURL, caName, adminLabel, mspId, tlsOptions, caClient } = getCAConfig(role);
        await ensureAdminEnrolled(caURL, caName, mspId, adminLabel, tlsOptions, caClient);
        
        const ca = caClient;
        const adminIdentity = await wallet.get(adminLabel);
        if (!adminIdentity) throw new Error(`Admin ${adminLabel} is missing from the registrar wallet.`);

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');
        const registrarAttributes = [{ name: 'role', value: role, ecert: true }];

        try {
            await ca.register({
                enrollmentID: email,
                enrollmentSecret: password,
                role: 'admin',
                maxEnrollments: -1,
                attrs: registrarAttributes
            }, adminUser);
        } catch (err) {
            if (!err.toString().includes('is already registered')) throw err;

            const identityService = ca.newIdentityService();
            await identityService.update(email, {
                type: 'admin',
                enrollmentSecret: password,
                maxEnrollments: -1,
                attrs: registrarAttributes
            }, adminUser);
        }

        const enrollment = await ca.enroll({ 
            enrollmentID: email, 
            enrollmentSecret: password,
            attr_reqs: [{ name: 'role', optional: true }]
        });
        await wallet.put(email, { credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() }, mspId: mspId, type: 'X.509' });

        res.status(200).json({
            status: 'success',
            accountCreated,
            systemAdmin,
            message: 'Registrar securely bootstrapped. You can now log in.'
        });
    } catch (error) {
        console.error('[Bootstrap] Failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => res.status(200).json({
    status: 'operational',
    mode: 'Production Security (ABAC ACTIVE)',
    uptimeSeconds: Math.round(process.uptime())
}));

app.get('/api/ready', async (req, res) => {
    if (isShuttingDown) {
        return res.status(503).json({ status: 'draining' });
    }

    try {
        await dbRead.query('SELECT 1');
        return res.status(200).json({ status: 'ready' });
    } catch (error) {
        return res.status(503).json({ status: 'not_ready', error: error.message });
    }
});

app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(renderPrometheusMetrics());
});

app.get('/debug/heapsnapshot', (req, res) => {
    const debugToken = process.env.DEBUG_TOKEN;
    if (!debugToken) {
        return res.status(404).json({ error: 'Debug heap snapshots are disabled.' });
    }

    const providedToken = req.query.token || req.headers['x-debug-token'];
    if (providedToken !== debugToken) {
        return res.status(403).json({ error: 'Unauthorized.' });
    }

    try {
        const snapshotPath = path.join(os.tmpdir(), `blockgo-heap-${process.pid}-${Date.now()}.heapsnapshot`);
        const writtenPath = v8.writeHeapSnapshot(snapshotPath);
        res.download(writtenPath, path.basename(writtenPath), (error) => {
            fs.unlink(writtenPath, (unlinkError) => {
                if (unlinkError) console.warn(`[Heap Snapshot] Failed to remove ${writtenPath}: ${unlinkError.message}`);
            });

            if (error && !res.headersSent) {
                res.status(500).json({ error: error.message });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 4000;
let server;

async function startServer() {
    try {
        await importCryptogenAdmins();
    } catch (e) {
        console.error("Startup wallet sync failed:", e.message);
    }

    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`\nMiddleware online on port ${PORT}`);
        console.log(`Mode: Production Security (OBAC/ABAC ACTIVE)`);
        console.log(` Dynamic Identity Loading: Enabled\n`);
    });
}

startServer();

const closeServer = () => new Promise((resolve) => {
    if (!server) return resolve();

    server.close((error) => {
        if (error) console.error(`[Shutdown] HTTP server close failed: ${error.message}`);
        resolve();
    });
});
<<<<<<< Updated upstream
=======

const withTimeout = (promise, timeoutMs, label) => new Promise((resolve) => {
    const timeout = setTimeout(() => {
        console.warn(`[Shutdown] Timed out waiting for ${label} after ${timeoutMs}ms`);
        resolve();
    }, timeoutMs);
    if (typeof timeout.unref === 'function') timeout.unref();

    promise
        .catch((error) => console.error(`[Shutdown] ${label} failed: ${error.message}`))
        .finally(() => {
            clearTimeout(timeout);
            resolve();
        });
});

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\nReceived ${signal}. Draining middleware before shutdown...`);
    clearManagedIntervals();

    await withTimeout(closeServer(), SHUTDOWN_GRACE_MS, 'HTTP server drain');

    for (const [username] of Array.from(userGatewayCache.entries())) {
        disconnectCachedGateway(username, 'shutdown');
    }
    caConfigCache.clear();

    await Promise.allSettled([
        dbRead.end(),
        dbWrite.end()
    ]);

    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
>>>>>>> Stashed changes
