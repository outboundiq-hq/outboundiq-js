#!/usr/bin/env node

/**
 * OutboundIQ Test Command
 * 
 * Verifies your API key and sends test data to OutboundIQ.
 * 
 * Usage: npx outboundiq-test
 *
 * Loads `.env` then `.env.local` from the current working directory, walking
 * up until a directory contains either file (same idea as a project root).
 * Existing shell environment variables are never overwritten.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
    const out = {};
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        return out;
    }
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        const key = t.slice(0, eq).trim();
        if (!key) continue;
        let val = t.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        out[key] = val;
    }
    return out;
}

function loadDotenvFiles() {
    let dir = process.cwd();
    for (;;) {
        const envPath = path.join(dir, '.env');
        const localPath = path.join(dir, '.env.local');
        const hasEnv = fs.existsSync(envPath);
        const hasLocal = fs.existsSync(localPath);
        if (hasEnv || hasLocal) {
            /** @type {Record<string, string>} */
            let merged = {};
            if (hasEnv) merged = { ...merged, ...parseEnvFile(envPath) };
            if (hasLocal) merged = { ...merged, ...parseEnvFile(localPath) };
            for (const [k, v] of Object.entries(merged)) {
                if (process.env[k] === undefined) process.env[k] = v;
            }
            return;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
}

loadDotenvFiles();

// Get API key from environment (after optional .env load)
const apiKey = process.env.OUTBOUNDIQ_KEY;
const endpoint = process.env.OUTBOUNDIQ_URL || 'https://agent.outboundiq.dev/api/metric';
const baseUrl = endpoint.replace('/metric', '');

if (!apiKey) {
    console.error('\x1b[31m✗ Error: OUTBOUNDIQ_KEY environment variable is not set\x1b[0m');
    console.log('\nFix one of the following:');
    console.log('  • Add OUTBOUNDIQ_KEY to .env or .env.local in your project root, then run this from that folder.');
    console.log('  • Or export it in your shell:  export OUTBOUNDIQ_KEY=your_api_key_here\n');
    process.exit(1);
}

console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
console.log('\x1b[36m  OutboundIQ Integration Test\x1b[0m');
console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

console.log(`   API Key: ${apiKey.substring(0, 20)}...`);
console.log('');

// Step 1: Verify API key with ping
console.log('   → Verifying API key with OutboundIQ...');

const pingUrl = new URL(baseUrl + '/ping');
const isHttps = pingUrl.protocol === 'https:';
const client = isHttps ? https : http;

const pingOptions = {
    hostname: pingUrl.hostname,
    port: pingUrl.port || (isHttps ? 443 : 80),
    path: pingUrl.pathname,
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
    },
};

const pingReq = client.request(pingOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
                const response = JSON.parse(data);
                if (response.status && response.data) {
                    const { project, team, plan, usage } = response.data;
                    console.log(`\x1b[32m   ✓ Connected! Project: "${project.name}"\x1b[0m`);
                    console.log(`     Team: ${team.name} | Plan: ${plan}`);
                    if (usage.limit > 0) {
                        console.log(`     Usage: ${usage.api_calls} / ${usage.limit} API calls this period`);
                    }
                    console.log('');
                    
                    // Step 2: Send test data
                    sendTestData(project.slug);
                } else {
                    console.log(`\x1b[31m   ✗ API key verification failed: ${response.message}\x1b[0m\n`);
                    process.exit(1);
                }
            } catch (e) {
                console.log(`\x1b[31m   ✗ Invalid response from server\x1b[0m\n`);
                process.exit(1);
            }
        } else {
            console.log(`\x1b[31m   ✗ API key verification failed: HTTP ${res.statusCode}\x1b[0m\n`);
            process.exit(1);
        }
    });
});

pingReq.on('error', (err) => {
    console.log(`\x1b[33m   ⚠ Could not verify API key: ${err.message}\x1b[0m`);
    console.log('     Continuing with test data...\n');
    sendTestData(null);
});

pingReq.end();

function sendTestData(projectSlug) {
    console.log('   → Sending test API call data...');
    
    // Create test payload with transaction_id
    const testPayload = [
        {
            transaction_id: generateId(),
            method: 'GET',
            url: 'https://api.example.com/test',
            status_code: 200,
            duration: 150,
            request_headers: { 'Content-Type': 'application/json' },
            response_headers: { 'Content-Type': 'application/json' },
            request_body: null,
            response_body: JSON.stringify({ message: 'OutboundIQ test successful!' }),
            request_type: 'outboundiq-test-command',
            timestamp: Date.now() / 1000,
            user_context: { context: 'test_command' },
        },
    ];

    // Base64 encode (matching PHP SDK format)
    const jsonData = JSON.stringify(testPayload);
    const encodedData = Buffer.from(jsonData, 'utf-8').toString('base64');

    // Parse endpoint URL
    const url = new URL(endpoint);
    const isLocalDev = url.hostname.endsWith('.test') || url.hostname.endsWith('.local') || url.hostname === 'localhost';

    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'OutboundIQ-Test/1.0',
            'Content-Length': Buffer.byteLength(encodedData),
        },
        ...(isHttps && isLocalDev && { rejectUnauthorized: false }),
    };

    const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log('\x1b[32m   ✓ Test data sent successfully!\x1b[0m\n');
                
                console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
                console.log('\x1b[32m✓ All tests passed!\x1b[0m');
                console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
                
                console.log('🎉 Your OutboundIQ integration is working!\n');
                
                if (projectSlug) {
                    console.log(`   Dashboard: \x1b[34mhttps://outboundiq.dev/dashboard/${projectSlug}\x1b[0m\n`);
                } else {
                    console.log('   Dashboard: \x1b[34mhttps://outboundiq.dev/dashboard\x1b[0m\n');
                }
            } else {
                console.log(`\x1b[31m   ✗ Failed to send test data: HTTP ${res.statusCode}\x1b[0m`);
                console.log(`   Response: ${data}\n`);
                process.exit(1);
            }
        });
    });

    req.on('error', (err) => {
        console.log(`\x1b[31m   ✗ Failed to connect: ${err.message}\x1b[0m\n`);
        console.log('Please check:');
        console.log('  1. Your API key is valid');
        console.log('  2. You have internet connectivity');
        console.log('  3. The OutboundIQ endpoint is reachable\n');
        process.exit(1);
    });

    req.write(encodedData);
    req.end();
}

function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
