#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

/**
 * Generate Apple OAuth JWT Secret Key
 * 
 * Usage:
 * node generate-apple-jwt.js <TEAM_ID> <CLIENT_ID> <KEY_ID> <PATH_TO_P8>
 * 
 * Example:
 * node generate-apple-jwt.js ABCD123456 com.vocme.web HPQRHT8T8P ~/Downloads/AuthKey_HPQRHT8T8P.p8
 */

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('❌ Missing arguments!');
  console.error('');
  console.error('Usage: node generate-apple-jwt.js <TEAM_ID> <CLIENT_ID> <KEY_ID> <PATH_TO_P8>');
  console.error('');
  console.error('Example:');
  console.error('  node generate-apple-jwt.js ABCD123456 com.vocme.web HPQRHT8T8P ~/Downloads/AuthKey_HPQRHT8T8P.p8');
  console.error('');
  console.error('Arguments:');
  console.error('  TEAM_ID     - Your Apple Team ID (10 chars)');
  console.error('  CLIENT_ID   - Your Service ID (e.g., com.vocme.web)');
  console.error('  KEY_ID      - Your Key ID from Apple (e.g., HPQRHT8T8P)');
  console.error('  PATH_TO_P8  - Full path to your AuthKey_*.p8 file');
  process.exit(1);
}

const [teamId, clientId, keyId, p8Path] = args;

// Expand ~ to home directory
const expandedP8Path = p8Path.replace('~', process.env.HOME);

console.log('🍎 Generating Apple OAuth JWT...');
console.log('');
console.log('Parameters:');
console.log(`  Team ID:   ${teamId}`);
console.log(`  Client ID: ${clientId}`);
console.log(`  Key ID:    ${keyId}`);
console.log(`  P8 file:   ${expandedP8Path}`);
console.log('');

// Check if file exists
if (!fs.existsSync(expandedP8Path)) {
  console.error(`❌ File not found: ${expandedP8Path}`);
  process.exit(1);
}

try {
  // Read the private key
  const privateKey = fs.readFileSync(expandedP8Path, 'utf8');

  // Verify private key format
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error('❌ Invalid private key format. Must contain "-----BEGIN PRIVATE KEY-----"');
    process.exit(1);
  }

  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    console.error('❌ Invalid private key format. Must contain "-----END PRIVATE KEY-----"');
    process.exit(1);
  }

  // Generate JWT with 6-month expiration (as per Apple's requirement)
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 6 * 30 * 24 * 60 * 60; // 6 months in seconds

  const payload = {
    iss: teamId,
    iat: now,
    exp: now + expiresIn,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    keyid: keyId,
  });

  console.log('✅ JWT Generated Successfully!');
  console.log('');
  console.log('Your Secret Key (for OAuth):');
  console.log('');
  console.log(token);
  console.log('');
  console.log('📋 How to use:');
  console.log('1. Copy the JWT above (entire line)');
  console.log('2. Go to https://app.supabase.com → Authentication → Providers → Apple');
  console.log('3. Paste into "Secret Key (for OAuth)" field');
  console.log('4. Click Save');
  console.log('');
  console.log('⏰ Note: This JWT expires in 6 months. You will need to regenerate it then.');
  console.log('');

} catch (error) {
  console.error('❌ Error generating JWT:');
  console.error(error.message);
  process.exit(1);
}
