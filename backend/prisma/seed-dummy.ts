import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding dummy data for development...');

  // Create or get the platform
  const platform = await prisma.platform.upsert({
    where: { name: 'shopify' },
    update: {},
    create: {
      name: 'shopify',
      status: 'ACTIVE',
      config: {},
    },
  });

  console.log('Created platform:', platform.name);

  // Create or get the application
  const application = await prisma.application.upsert({
    where: { name: 'alintro-iam' },
    update: {},
    create: {
      name: 'alintro-iam',
      description: 'Enterprise SSO for Shopify',
      status: 'ACTIVE',
      settings: {},
    },
  });

  console.log('Created application:', application.name);

  // Create or get app platform link
  const appPlatform = await prisma.appPlatform.upsert({
    where: {
      applicationId_platformId: {
        applicationId: application.id,
        platformId: platform.id,
      },
    },
    update: {},
    create: {
      applicationId: application.id,
      platformId: platform.id,
      status: 'ACTIVE',
      config: {
        platformAppId: 'alintro-iam',
        apiVersion: '2024-10',
        scopes: [],
        webhooks: [],
      },
    },
  });

  console.log('Created app platform link');

  // Create a test store
  const store = await prisma.store.upsert({
    where: { domain: 'notiftest-2.myshopify.com' },
    update: {
      name: 'Notiftest 2',
      ownerEmail: 'test@example.com',
    },
    create: {
      appPlatformId: appPlatform.id,
      platformStoreId: 'notiftest-2',
      domain: 'notiftest-2.myshopify.com',
      name: 'Notiftest 2',
      ownerEmail: 'test@example.com',
      credentials: JSON.stringify({ accessToken: 'test-token' }),
      isPlus: false,
      country: 'US',
      status: 'active',
      metadata: {
        ssoButtonSettings: {
          enableSso: true,
          ssoText: 'Sign in with SSO',
          enableGoogle: false,
          enableMicrosoft: false,
          buttonColor: '#000000',
        },
      },
    },
  });

  console.log('Created store:', store.domain);

  // Create a free plan
  const plan = await prisma.plan.upsert({
    where: {
      appPlatformId_name: {
        appPlatformId: appPlatform.id,
        name: 'free',
      },
    },
    update: {},
    create: {
      appPlatformId: appPlatform.id,
      name: 'free',
      description: 'Free plan with basic features',
      monthlyPrice: 0,
      annualPrice: 0,
      userLimit: 50,
      trialDays: 0,
      features: { maxUsers: 50, maxProviders: 2 },
      isActive: true,
      displayOrder: 1,
    },
  });

  console.log('Created plan:', plan.name);

  // Create subscription
  await prisma.subscription.upsert({
    where: { storeId: store.id },
    update: {},
    create: {
      storeId: store.id,
      planId: plan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('Created subscription');

  // Delete existing SSO providers for this store to avoid duplicates
  await prisma.ssoProvider.deleteMany({ where: { storeId: store.id } });

  // Create SSO Provider
  const provider = await prisma.ssoProvider.create({
    data: {
      storeId: store.id,
      providerType: 'google',
      protocol: 'oidc',
      displayName: 'Google Workspace',
      isEnabled: true,
      isDefault: true,
      status: 'active',
      config: JSON.stringify({
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
      }),
    },
  });

  console.log('Created provider:', provider.displayName);

  // Delete existing users for this store
  await prisma.ssoUser.deleteMany({ where: { storeId: store.id } });

  // Create dummy users
  const userEmails = [
    { email: 'alice@example.com', firstName: 'Alice', lastName: 'Smith', loginCount: 25 },
    { email: 'bob@example.com', firstName: 'Bob', lastName: 'Johnson', loginCount: 18 },
    { email: 'carol@example.com', firstName: 'Carol', lastName: 'Williams', loginCount: 12 },
    { email: 'david@example.com', firstName: 'David', lastName: 'Brown', loginCount: 8 },
    { email: 'eve@example.com', firstName: 'Eve', lastName: 'Davis', loginCount: 5 },
    { email: 'frank@example.com', firstName: 'Frank', lastName: 'Miller', loginCount: 3 },
    { email: 'grace@example.com', firstName: 'Grace', lastName: 'Wilson', loginCount: 2 },
  ];

  const createdUsers = [];
  for (const userData of userEmails) {
    const user = await prisma.ssoUser.create({
      data: {
        storeId: store.id,
        ssoProviderId: provider.id,
        idpCustomerId: `idp-${userData.email.split('@')[0]}`, // Required field
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        status: 'active',
        loginCount: userData.loginCount,
        lastLoginAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
    createdUsers.push(user);
  }

  console.log('Created', userEmails.length, 'users');

  // Delete existing login events for this store to avoid duplicates
  await prisma.loginEvent.deleteMany({ where: { storeId: store.id } });

  // Create login events for the last 30 days
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const loginEvents = [];
  for (let i = 0; i < 150; i++) {
    const timestamp = new Date(thirtyDaysAgo + Math.random() * (now - thirtyDaysAgo));
    const isSuccess = Math.random() > 0.1; // 90% success rate
    const randomUser = createdUsers[Math.floor(Math.random() * createdUsers.length)];

    loginEvents.push({
      storeId: store.id,
      ssoProviderId: provider.id,
      ssoUserId: isSuccess ? randomUser.id : null,
      eventType: isSuccess ? 'login_success' as const : 'login_failed' as const,
      errorCode: isSuccess ? null : ['invalid_credentials', 'expired_session', 'mfa_required'][Math.floor(Math.random() * 3)],
      metadata: {},
      createdAt: timestamp,
    });
  }

  await prisma.loginEvent.createMany({
    data: loginEvents,
  });

  console.log('Created', loginEvents.length, 'login events');

  console.log('\n✅ Dummy data seeded successfully!');
  console.log('Store domain:', store.domain);
  console.log('Total users:', userEmails.length);
  console.log('Total login events:', loginEvents.length);
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
