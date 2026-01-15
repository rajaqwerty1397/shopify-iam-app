import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

function decrypt(encryptedData) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const parts = encryptedData.split(':');
  const [v, ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function main() {
  const store = await prisma.store.findFirst({
    where: { domain: { contains: 'notiftest' } },
    select: { id: true, domain: true, credentials: true, status: true, updatedAt: true }
  });

  if (!store) {
    console.log('❌ No store found');
    return;
  }

  console.log('\n=== Store Status ===');
  console.log('Domain:', store.domain);
  console.log('Status:', store.status);
  console.log('Last Updated:', store.updatedAt);
  
  const creds = decrypt(store.credentials);
  console.log('\n=== Current Token ===');
  console.log('Token:', creds.accessToken.substring(0, 20) + '...');
  console.log('Token Length:', creds.accessToken.length);
  console.log('Is Empty:', creds.accessToken === '');
  
  if (creds.accessToken === '') {
    console.log('\n⚠️  Token is EMPTY - app needs to be reinstalled!');
  } else {
    console.log('\n=== Testing Token ===');
    const url = 'https://notiftest-2.myshopify.com/admin/api/2024-01/shop.json';
    try {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': creds.accessToken }
      });
      
      if (response.ok) {
        console.log('✅ Token is VALID');
        const data = await response.json();
        console.log('Shop:', data.shop?.name);
      } else {
        console.log('❌ Token is INVALID');
        const body = await response.text();
        console.log('Error:', body.substring(0, 200));
        console.log('\n⚠️  You need to re-authenticate!');
      }
    } catch (error) {
      console.log('❌ Error testing token:', error.message);
    }
  }
  
  console.log('\n=== Re-authentication URL ===');
  console.log('Visit this URL to get a new token:');
  console.log('https://illustrations-anytime-serum-arabia.trycloudflare.com/api/shopify/auth?shop=notiftest-2.myshopify.com');
  console.log('');
}

main().catch(console.error).finally(() => prisma.$disconnect());
