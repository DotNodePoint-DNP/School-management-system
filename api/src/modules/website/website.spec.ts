import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { validate } from 'class-validator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator.js';
import { WebsiteController } from './website.controller.js';
import { WebsiteService } from './website.service.js';
import { WebsitePublicService, openCareer } from './website-public.service.js';
import { WebsiteAdminController } from './website-admin.controller.js';
import { availableSlug, slugBase } from './slug.js';
import { EventDto, UpdateEventDto } from './dto/cms.dto.js';
import { WebsiteEntryDto } from './dto/website-entry.dto.js';

describe('website publishing boundary', () => {
  const reflector = new Reflector();
  const handlers = WebsiteController.prototype;

  it('exposes only the profile, class names and published sections', () => {
    for (const handler of [
      handlers.profile,
      handlers.logo,
      handlers.classes,
      handlers.section,
    ]) {
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBe(true);
    }
    for (const handler of [
      handlers.manage,
      handlers.create,
      handlers.replace,
    ]) {
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(reflector.get(PERMISSIONS_KEY, handler)).toEqual([
        'school:manage',
      ]);
    }
  });

  it('only serves an image classified as the current school logo', async () => {
    const findUnique = vi.fn();
    const read = vi.fn();
    const service = new WebsiteService(
      { schoolProfile: { findUnique } } as never,
      {} as never,
      { read } as never,
    );
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ logoFile: { id: 'internal', kind: 'SEAL' } });
    await expect(service.logo()).rejects.toThrow('School logo unavailable');
    await expect(service.logo()).rejects.toThrow('School logo unavailable');
    expect(read).not.toHaveBeenCalled();
    findUnique.mockResolvedValueOnce({
      logoFile: { id: 'school-logo', kind: 'LOGO' },
    });
    read.mockResolvedValueOnce({
      data: Buffer.from('image'),
      contentType: 'image/png',
      sha256: 'hash',
    });
    await expect(service.logo()).resolves.toMatchObject({
      contentType: 'image/png',
    });
    expect(read).toHaveBeenCalledWith('school-logo');
  });

  it('uses the same publication filter for articles and public pagination counts', async () => {
    const findMany = vi.fn().mockResolvedValue([]),
      count = vi.fn().mockResolvedValue(0);
    const db = {
      notice: { findMany, count },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new WebsitePublicService(db as never);
    await service.notices({ category: 'exam', page: 1, limit: 12 });
    const where = {
      category: 'exam',
      published: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('keeps CMS management private and restricted to school managers', () => {
    expect(
      reflector.get(IS_PUBLIC_KEY, WebsiteAdminController),
    ).toBeUndefined();
    expect(reflector.get(PERMISSIONS_KEY, WebsiteAdminController)).toEqual([
      'school:manage',
    ]);
  });

  it('keeps Nepali letters and handles colliding or empty slug bases', () => {
    expect(slugBase('  विद्यालय परिचय! ')).toBe('विद्यालय-परिचय');
    expect(slugBase('?!')).toBe('item');
    expect(availableSlug('science-day', ['science-day', 'science-day-2'])).toBe(
      'science-day-3',
    );
  });

  it('accepts partial edits but rejects missing create fields and null required fields', async () => {
    expect((await validate(new EventDto())).map((e) => e.property)).toContain(
      'startsAt',
    );
    expect(
      await validate(Object.assign(new UpdateEventDto(), { venue: 'Library' })),
    ).toEqual([]);
    expect(
      (
        await validate(Object.assign(new UpdateEventDto(), { title: null }))
      ).map((e) => e.property),
    ).toContain('title');
  });

  it('advances the vacancy cutoff at midnight in Nepal', () => {
    expect(openCareer(new Date('2026-11-23T18:15:00Z')).OR).toContainEqual({
      deadline: { gte: new Date('2026-11-24T00:00:00Z') },
    });
  });

  it('defaults entries to draft and requires an HTTPS image with alt text for gallery posts', async () => {
    const dto = Object.assign(new WebsiteEntryDto(), {
      title: 'School garden',
      body: 'Spring planting.',
      section: 'gallery',
    });
    expect(dto.published).toBe(false);
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'imageUrl',
    );
    dto.imageUrl = 'https://example.org/garden.jpg';
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'imageAlt',
    );
    dto.imageAlt = 'Seedlings in the school garden';
    expect(await validate(dto)).toEqual([]);
  });
});
