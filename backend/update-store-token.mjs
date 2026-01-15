import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

// Simple encryption service using environment variables
function encrypt(data) {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(encryptedData) {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const algorithm = 'aes-256-gcm';
  
  const [version, ivBase64, authTagBase64, ciphertextBase64] = encryptedData.split(':');
  if (version !== 'v1') {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function updateStoreToken() {
  const storeDomain = 'notiftest-2.myshopify.com';
  const newAccessToken = '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';

  try {
    console.log(`\n=== Updating access token for store: ${storeDomain} ===\n`);

    // Find the store
    const store = await prisma.store.findUnique({
      where: { domain: storeDomain },
    });

    if (!store) {
      console.error(`❌ Store not found: ${storeDomain}`);
      process.exit(1);
    }

    console.log(`✅ Found store: ${store.name} (ID: ${store.id})`);

    // Get current credentials
    const currentCreds = decrypt(store.credentials);
    console.log(`Current access token: ${currentCreds.accessToken ? currentCreds.accessToken.substring(0, 20) + '...' : '(empty)'}`);

    // Update credentials with new token
    const newCredentials = {
      accessToken: newAccessToken,
      scopes: currentCreds.scopes || [],
      multipassSecret: currentCreds.multipassSecret || null,
    };

    const encryptedCredentials = encrypt(newCredentials);

    // Update store
    await prisma.store.update({
      where: { id: store.id },
      data: {
        credentials: encryptedCredentials,
      },
    });

    // Verify update
    const updatedStore = await prisma.store.findUnique({
      where: { id: store.id },
      select: { credentials: true },
    });

    const verifyCreds = decrypt(updatedStore.credentials);
    console.log(`\n✅ Updated access token: ${verifyCreds.accessToken.substring(0, 20)}...`);
    console.log(`✅ Token matches: ${verifyCreds.accessToken === newAccessToken}`);
    console.log(`\n✅ Store credentials updated successfully!`);
    console.log(`\nYou can now test the OAuth flow.\n`);

  } catch (error) {
    console.error('❌ Error updating store token:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateStoreToken();
