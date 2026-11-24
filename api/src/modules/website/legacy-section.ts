import { WebsiteSection as PageSection } from '../../generated/prisma/client.js';
export const WebsiteSection = {
  ...PageSection,
  notices: 'notices',
  events: 'events',
  gallery: 'gallery',
  careers: 'careers',
} as const;
export type WebsiteSection = keyof typeof WebsiteSection;
