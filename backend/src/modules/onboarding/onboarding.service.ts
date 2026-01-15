import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { Prisma } from '@prisma/client';

const logger = createModuleLogger('OnboardingService');

/**
 * Onboarding Step IDs
 */
export type OnboardingStep = 'provider' | 'app_embed' | 'tour_completed';

/**
 * Onboarding Status Response
 */
export interface OnboardingStatus {
  hasProvider: boolean;
  hasUsers: boolean;
  hasEnabledAppEmbed: boolean;
  completedSteps: OnboardingStep[];
  showTour: boolean;
}

/**
 * SSO Button Settings (for storefront login button)
 */
export interface SsoButtonSettings {
  enableSso: boolean;
  ssoText: string;
  enableGoogle: boolean;
  enableMicrosoft: boolean;
  buttonColor: string;
}

/**
 * Store Settings (stored in metadata)
 */
export interface StoreSettings {
  ssoEnabled: boolean;
  autoRedirectToIdp: boolean;
  sessionTimeout: string; // in hours
  onboardingCompletedSteps?: OnboardingStep[];
  tourCompleted?: boolean;
  appEmbedEnabled?: boolean;
  ssoButtonSettings?: SsoButtonSettings;
}

const DEFAULT_SSO_BUTTON_SETTINGS: SsoButtonSettings = {
  enableSso: true,
  ssoText: 'Sign in with SSO',
  enableGoogle: false,
  enableMicrosoft: false,
  buttonColor: '#000000',
};

const DEFAULT_SETTINGS: StoreSettings = {
  ssoEnabled: true,
  autoRedirectToIdp: false,
  sessionTimeout: '24',
  onboardingCompletedSteps: [],
  tourCompleted: false,
  appEmbedEnabled: false,
  ssoButtonSettings: DEFAULT_SSO_BUTTON_SETTINGS,
};

/**
 * Onboarding Service
 * 
 * Manages store onboarding status and settings.
 */
export class OnboardingService {
  /**
   * Get onboarding status for a store
   */
  async getStatus(storeId: string): Promise<OnboardingStatus> {
    // Get store with metadata and related counts
    const [store, providerCount, userCount] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { metadata: true },
      }),
      prisma.ssoProvider.count({
        where: { storeId, status: 'active' },
      }),
      prisma.ssoUser.count({
        where: { storeId },
      }),
    ]);

    const metadata = (store?.metadata as StoreSettings) || DEFAULT_SETTINGS;
    const completedSteps = metadata.onboardingCompletedSteps || [];

    return {
      hasProvider: providerCount > 0,
      hasUsers: userCount > 0,
      hasEnabledAppEmbed: metadata.appEmbedEnabled || false,
      completedSteps,
      showTour: !metadata.tourCompleted,
    };
  }

  /**
   * Complete an onboarding step
   */
  async completeStep(storeId: string, step: OnboardingStep): Promise<void> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { metadata: true },
    });

    const metadata = (store?.metadata as StoreSettings) || DEFAULT_SETTINGS;
    const completedSteps = metadata.onboardingCompletedSteps || [];

    // Add step if not already completed
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }

    // Update specific flags based on step
    const updates: Partial<StoreSettings> = {
      onboardingCompletedSteps: completedSteps,
    };

    if (step === 'app_embed') {
      updates.appEmbedEnabled = true;
    }

    if (step === 'tour_completed') {
      updates.tourCompleted = true;
    }

    await prisma.store.update({
      where: { id: storeId },
      data: {
        metadata: {
          ...metadata,
          ...updates,
        } as Prisma.JsonObject,
      },
    });

    logger.info({ storeId, step }, 'Onboarding step completed');
  }

  /**
   * Get store settings
   */
  async getSettings(storeId: string): Promise<StoreSettings> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { metadata: true },
    });

    const metadata = (store?.metadata as Record<string, unknown>) || {};
    const ssoButtonSettings = (metadata.ssoButtonSettings as SsoButtonSettings) || DEFAULT_SSO_BUTTON_SETTINGS;

    return {
      ssoEnabled: (metadata.ssoEnabled as boolean) ?? DEFAULT_SETTINGS.ssoEnabled,
      autoRedirectToIdp: (metadata.autoRedirectToIdp as boolean) ?? DEFAULT_SETTINGS.autoRedirectToIdp,
      sessionTimeout: (metadata.sessionTimeout as string) ?? DEFAULT_SETTINGS.sessionTimeout,
      ssoButtonSettings: {
        enableSso: ssoButtonSettings.enableSso ?? DEFAULT_SSO_BUTTON_SETTINGS.enableSso,
        ssoText: ssoButtonSettings.ssoText ?? DEFAULT_SSO_BUTTON_SETTINGS.ssoText,
        enableGoogle: ssoButtonSettings.enableGoogle ?? DEFAULT_SSO_BUTTON_SETTINGS.enableGoogle,
        enableMicrosoft: ssoButtonSettings.enableMicrosoft ?? DEFAULT_SSO_BUTTON_SETTINGS.enableMicrosoft,
        buttonColor: ssoButtonSettings.buttonColor ?? DEFAULT_SSO_BUTTON_SETTINGS.buttonColor,
      },
    };
  }

  /**
   * Update store settings
   */
  async updateSettings(
    storeId: string,
    settings: Partial<StoreSettings>
  ): Promise<StoreSettings> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { metadata: true },
    });

    const currentMetadata = (store?.metadata as Record<string, unknown>) || {};
    const currentSsoButtonSettings = (currentMetadata.ssoButtonSettings as SsoButtonSettings) || DEFAULT_SSO_BUTTON_SETTINGS;

    // Merge SSO button settings if provided
    const updatedSsoButtonSettings = settings.ssoButtonSettings ? {
      ...currentSsoButtonSettings,
      ...settings.ssoButtonSettings,
    } : currentSsoButtonSettings;

    const updatedMetadata = {
      ...currentMetadata,
      ...(settings.ssoEnabled !== undefined && { ssoEnabled: settings.ssoEnabled }),
      ...(settings.autoRedirectToIdp !== undefined && { autoRedirectToIdp: settings.autoRedirectToIdp }),
      ...(settings.sessionTimeout !== undefined && { sessionTimeout: settings.sessionTimeout }),
      ssoButtonSettings: updatedSsoButtonSettings,
    };

    await prisma.store.update({
      where: { id: storeId },
      data: {
        metadata: updatedMetadata as Prisma.JsonObject,
      },
    });

    logger.info({ storeId }, 'Store settings updated');

    return {
      ssoEnabled: (updatedMetadata.ssoEnabled as boolean) ?? DEFAULT_SETTINGS.ssoEnabled,
      autoRedirectToIdp: (updatedMetadata.autoRedirectToIdp as boolean) ?? DEFAULT_SETTINGS.autoRedirectToIdp,
      sessionTimeout: (updatedMetadata.sessionTimeout as string) ?? DEFAULT_SETTINGS.sessionTimeout,
      ssoButtonSettings: updatedSsoButtonSettings,
    };
  }
}

// Singleton instance
export const onboardingService = new OnboardingService();
