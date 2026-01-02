#!/usr/bin/env node

/**
 * OutboundIQ Test Command
 * 
 * Sends test data to OutboundIQ to verify your integration is working.
 * 
 * Usage: npx outboundiq-test
 */

const https = require('https');
const http = require('http');

// Get API key from environment
const apiKey = process.env.OUTBOUNDIQ_API_KEY;
const endpoint = process.env.OUTBOUNDIQ_ENDPOINT || 'https://agent.outboundiq.dev/api/metric';

if (!apiKey) {
    console.error('\x1b[31m✗ Error: OUTBOUNDIQ_API_KEY environment variable is not set\x1b[0m');
    console.log('\nPlease set your API key:');
    console.log('  export OUTBOUNDIQ_API_KEY=your_api_key_here\n');
    process.exit(1);
}

console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
console.log('\x1b[36m  OutboundIQ Integration Test\x1b[0m');
console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

console.log('📡 Sending test data to OutboundIQ...\n');
console.log(`   Endpoint: ${endpoint}`);
console.log(`   API Key: ${apiKey.substring(0, 20)}...`);
console.log('');

// Create test payload
const testPayload = [
    {
        method: 'GET',
        url: 'https://api.example.com/test',
        status_code: 200,
        duration: 150,
        request_headers: { 'Content-Type': 'application/json' },
        response_headers: { 'Content-Type': 'application/json' },
        request_body: null,
        response_body: JSON.stringify({ message: 'OutboundIQ test successful!' }),
        request_type: 'outboundiq-test-command',
        timestamp: new Date().toISOString(),
        user_context: { context: 'test_command' },
    },
    {
        method: 'POST',
        url: 'https://api.example.com/test/create',
        status_code: 201,
        duration: 250,
        request_headers: { 'Content-Type': 'application/json' },
        response_headers: { 'Content-Type': 'application/json' },
        request_body: JSON.stringify({ name: 'Test', value: 123 }),
        response_body: JSON.stringify({ id: 1, name: 'Test', value: 123 }),
        request_type: 'outboundiq-test-command',
        timestamp: new Date().toISOString(),
        user_context: { context: 'test_command' },
    },
];

// Base64 encode (matching PHP SDK format)
const jsonData = JSON.stringify(testPayload);
const encodedData = Buffer.from(jsonData, 'utf-8').toString('base64');

// Parse endpoint URL
const url = new URL(endpoint);
const isHttps = url.protocol === 'https:';
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

const client = isHttps ? https : http;

const req = client.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('\x1b[32m✓ Test data sent successfully!\x1b[0m\n');
            console.log('🎉 Your OutboundIQ integration is working!\n');
            console.log('   Check your dashboard to see the test data:');
            console.log('   \x1b[34mhttps://outboundiq.dev/dashboard\x1b[0m\n');
            console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
        } else {
            console.log(`\x1b[31m✗ Failed to send test data: HTTP ${res.statusCode}\x1b[0m`);
            console.log(`   Response: ${data}\n`);
            process.exit(1);
        }
    });
});

req.on('error', (err) => {
    console.log(`\x1b[31m✗ Failed to connect: ${err.message}\x1b[0m\n`);
    console.log('Please check:');
    console.log('  1. Your API key is valid');
    console.log('  2. You have internet connectivity');
    console.log('  3. The OutboundIQ endpoint is reachable\n');
    process.exit(1);
});

req.write(encodedData);
req.end();

