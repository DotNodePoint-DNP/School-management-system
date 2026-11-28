import { BadRequestException } from '@nestjs/common';
import type { PunchDto } from './staff-attendance.dto.js';

export function verifyPosition(
  policy: { latitude: number; longitude: number; radius: number },
  fix: PunchDto,
  now: number,
) {
  if (now - fix.capturedAt > 60_000 || fix.capturedAt > now + 5000)
    throw new BadRequestException(
      'Location reading expired. Get a fresh location and retry.',
    );
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(fix.latitude - policy.latitude) / 2) ** 2 +
    Math.cos(radians(policy.latitude)) *
      Math.cos(radians(fix.latitude)) *
      Math.sin(radians(fix.longitude - policy.longitude) / 2) ** 2;
  const distance = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  if (distance - fix.accuracy > policy.radius)
    throw new BadRequestException('Outside the school attendance area.');
  if (fix.accuracy > 100 || distance + fix.accuracy > policy.radius)
    throw new BadRequestException(
      'Location is uncertain. Retry with a clearer signal or request a correction.',
    );
  return distance;
}
