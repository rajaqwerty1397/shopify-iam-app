/**
 * Persona SSO - Database Seed Script
 * 
 * This script initializes the database with essential base data:
 * - Platforms (Shopify, WooCommerce)
 * - Applications (Persona SSO)
 * - App-Platform links
 * - Subscription Plans
 * 
 * Run with: npx tsx prisma/seed.ts
 * 
 * IDEMPOTENT: Safe to run multiple times
 */

import { PrismaClient, PlatformStatus, ApplicationStatus, AppPlatformStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // =========================================================================
  // 1. PLATFORMS
  // =========================================================================
  console.log('📦 Creating Platforms...');

  const shopify = await prisma.platform.upsert({
    where: { name: 'Shopify' },
    update: {
      status: PlatformStatus.ACTIVE,
      config: {
        apiVersion: '2024-01',
        scopes: ['read_customers', 'write_customers'],
        multipassSupported: true,
      },
    },
    create: {
      name: 'Shopify',
      status: PlatformStatus.ACTIVE,
      config: {
        apiVersion: '2024-01',
        scopes: ['read_customers', 'write_customers'],
        multipassSupported: true,
      },
    },
  });

  const woocommerce = await prisma.platform.upsert({
    where: { name: 'WooCommerce' },
    update: {
      status: PlatformStatus.ACTIVE,
      config: {
        apiVersion: 'wc/v3',
      },
    },
    create: {
      name: 'WooCommerce',
      status: PlatformStatus.ACTIVE,
      config: {
        apiVersion: 'wc/v3',
      },
    },
  });

  console.log(`   ✅ Shopify (ID: ${shopify.id})`);
  console.log(`   ✅ WooCommerce (ID: ${woocommerce.id})`);

  // =========================================================================
  // 2. APPLICATIONS
  // =========================================================================
  console.log('\n📱 Creating Applications...');

  const ssoApp = await prisma.application.upsert({
    where: { name: 'Persona SSO' },
    update: {
      description: 'Enterprise Single Sign-On for e-commerce stores',
      iconUrl: '/icons/sso.svg',
      status: ApplicationStatus.ACTIVE,
      settings: {
        defaultProtocol: 'oidc',
        supportedProviders: [
          'google',
          'microsoft',
          'facebook',
          'okta',
          'azure',
          'onelogin',
          'salesforce',
        ],
        supportedProtocols: ['oidc', 'saml'],
      },
    },
    create: {
      name: 'Persona SSO',
      description: 'Enterprise Single Sign-On for e-commerce stores',
      iconUrl: '/icons/sso.svg',
      status: ApplicationStatus.ACTIVE,
      settings: {
        defaultProtocol: 'oidc',
        supportedProviders: [
          'google',
          'microsoft',
          'facebook',
          'okta',
          'azure',
          'onelogin',
          'salesforce',
        ],
        supportedProtocols: ['oidc', 'saml'],
      },
    },
  });

  console.log(`   ✅ Persona SSO (ID: ${ssoApp.id})`);

  // =========================================================================
  // 3. APP-PLATFORM LINKS
  // =========================================================================
  console.log('\n🔗 Creating App-Platform links...');

  const shopifySso = await prisma.appPlatform.upsert({
    where: {
      applicationId_platformId: {
        applicationId: ssoApp.id,
        platformId: shopify.id,
      },
    },
    update: {
      status: AppPlatformStatus.ACTIVE,
      config: {
        multipassEnabled: true,
        customerTagsEnabled: true,
        loginButtonPlacement: ['login', 'register', 'checkout'],
      },
    },
    create: {
      applicationId: ssoApp.id,
      platformId: shopify.id,
      status: AppPlatformStatus.ACTIVE,
      config: {
        multipassEnabled: true,
        customerTagsEnabled: true,
        loginButtonPlacement: ['login', 'register', 'checkout'],
      },
    },
  });

  console.log(`   ✅ Shopify + SSO (ID: ${shopifySso.id})`);

  // =========================================================================
  // 4. SUBSCRIPTION PLANS
  // =========================================================================
  console.log('\n💳 Creating Subscription Plans...');

  const plans = [
    {
      name: 'Free',
      description: 'Perfect for trying out SSO - up to 100 users',
      monthlyPrice: 0,
      annualPrice: 0,
      userLimit: 100,
      trialDays: 0,
      displayOrder: 1,
      features: {
        maxProviders: 1,
        customBranding: false,
        analytics: false,
        prioritySupport: false,
        samlSupport: false,
      },
    },
    {
      name: 'Starter',
      description: 'For growing businesses - up to 500 users',
      monthlyPrice: 9.99,
      annualPrice: 99.00,
      userLimit: 500,
      trialDays: 14,
      displayOrder: 2,
      features: {
        maxProviders: 3,
        customBranding: true,
        analytics: true,
        prioritySupport: false,
        samlSupport: false,
      },
    },
    {
      name: 'Pro',
      description: 'For established stores - up to 2,000 users',
      monthlyPrice: 29.99,
      annualPrice: 299.00,
      userLimit: 2000,
      trialDays: 14,
      displayOrder: 3,
      features: {
        maxProviders: 10,
        customBranding: true,
        analytics: true,
        prioritySupport: true,
        samlSupport: true,
      },
    },
    {
      name: 'Enterprise',
      description: 'For large organizations - unlimited users',
      monthlyPrice: 99.99,
      annualPrice: 999.00,
      userLimit: -1, // Unlimited
      trialDays: 30,
      displayOrder: 4,
      features: {
        maxProviders: -1, // Unlimited
        customBranding: true,
        analytics: true,
        prioritySupport: true,
        samlSupport: true,
        dedicatedSupport: true,
        customIntegrations: true,
        sla: '99.9%',
      },
    },
  ];

  for (const plan of plans) {
    const created = await prisma.plan.upsert({
      where: {
        appPlatformId_name: {
          appPlatformId: shopifySso.id,
          name: plan.name,
        },
      },
      update: {
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        userLimit: plan.userLimit,
        trialDays: plan.trialDays,
        displayOrder: plan.displayOrder,
        features: plan.features,
        isActive: true,
      },
      create: {
        appPlatformId: shopifySso.id,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        userLimit: plan.userLimit,
        trialDays: plan.trialDays,
        displayOrder: plan.displayOrder,
        features: plan.features,
        isActive: true,
      },
    });
    console.log(`   ✅ ${plan.name} Plan (ID: ${created.id})`);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(50));
  console.log('🎉 Seed completed successfully!');
  console.log('='.repeat(50));
  console.log('\nCreated:');
  console.log(`  • ${2} Platforms`);
  console.log(`  • ${1} Applications`);
  console.log(`  • ${1} App-Platform links`);
  console.log(`  • ${plans.length} Subscription Plans`);
  console.log('\nYour database is ready for use!');
}

main()
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
