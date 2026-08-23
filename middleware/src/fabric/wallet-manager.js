const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { isContainerized, middlewareRoot } = require('../shared/config');
const { normalizeAuthRole } = require('../shared/roles');

const scryptAsync = util.promisify(crypto.scrypt);
const walletCache = new Map();
let Wallets;

function fabricWallets() {
    if (!Wallets) ({ Wallets } = require('fabric-network'));
    return Wallets;
}

function walletLocation(role) {
    const normalized = normalizeAuthRole(role);
    const user = process.env.COUCHDB_USER || 'capstone';
    const pass = process.env.COUCHDB_PASS || 'pass123';
    const host = isContainerized() ? 'host.docker.internal' : '127.0.0.1';
    const withCredentials = (configured, fallbackPort) => {
        const url = new URL(configured || `http://${host}:${fallbackPort}`);
        if (!url.username) url.username = user;
        if (!url.password) url.password = pass;
        return url.toString().replace(/\/$/, '');
    };
    if (normalized === 'faculty') return { suffix: 'faculty', url: withCredentials(process.env.COUCHDB_WALLET_FACULTY_URL, 6990) };
    if (normalized === 'department_admin') return { suffix: 'department', url: withCredentials(process.env.COUCHDB_WALLET_DEPARTMENT_URL, 7990) };
    return { suffix: 'registrar', url: withCredentials(process.env.COUCHDB_WALLET_REGISTRAR_URL || process.env.COUCHDB_WALLET_URL, 5990) };
}

async function encryptPrivateKey(privateKey, password) {
    const salt = crypto.randomBytes(16);
    const key = await scryptAsync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
    return `ENC:${salt.toString('hex')}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

async function decryptPrivateKey(value, password) {
    if (!value?.startsWith('ENC:')) return value;
    const parts = value.split(':');
    let key;
    let iv;
    let tag;
    let encrypted;
    if (parts.length === 5) {
        key = await scryptAsync(password, Buffer.from(parts[1], 'hex'), 32);
        [, , iv, tag, encrypted] = parts;
    } else if (parts.length === 4) {
        key = await scryptAsync(password, 'salt', 32);
        [, iv, tag, encrypted] = parts;
    } else {
        throw new Error('Invalid encrypted private key format.');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

async function getWallet(role = 'registrar') {
    const normalized = normalizeAuthRole(role) || 'registrar';
    if (walletCache.has(normalized)) return walletCache.get(normalized);
    const location = walletLocation(normalized);
    const wallet = location.url
        ? await fabricWallets().newCouchDBWallet(location.url, `fabric_wallet_${location.suffix}`)
        : await fabricWallets().newFileSystemWallet(path.join(middlewareRoot, 'wallet'));
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    if (encryptionKey) {
        const originalPut = wallet.put.bind(wallet);
        const originalGet = wallet.get.bind(wallet);
        wallet.put = async (label, identity) => {
            const copy = structuredClone(identity);
            if (copy?.credentials?.privateKey && !copy.credentials.privateKey.startsWith('ENC:')) {
                copy.credentials.privateKey = await encryptPrivateKey(copy.credentials.privateKey, encryptionKey);
            }
            return originalPut(label, copy);
        };
        wallet.get = async (label) => {
            const stored = await originalGet(label);
            if (!stored) return stored;
            const copy = structuredClone(stored);
            if (copy?.credentials?.privateKey) copy.credentials.privateKey = await decryptPrivateKey(copy.credentials.privateKey, encryptionKey);
            return copy;
        };
    }
    walletCache.set(normalized, wallet);
    return wallet;
}

async function findIdentity(username, roleHint) {
    const roles = roleHint ? [normalizeAuthRole(roleHint)] : ['registrar', 'faculty', 'department_admin'];
    for (const role of roles) {
        const wallet = await getWallet(role);
        const identity = await wallet.get(username);
        if (identity) return { identity, role, wallet };
    }
    return null;
}

module.exports = { findIdentity, getWallet };
