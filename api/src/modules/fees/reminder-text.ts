import { formatNpr } from '../../common/utils/money.js';

export interface ReminderChild {
  firstName: string;
  paisa: number;
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}.` : text;

/**
 * The reminder text. Only first names and amounts appear. Bounded in length: the school name is cut at 40
 * characters, each name at 20, and at most three children are listed (the rest are counted).
 */
export function reminderText(
  school: string,
  children: ReminderChild[],
  oldestDueLabel: string,
): string {
  const total = children.reduce((n, c) => n + c.paisa, 0);
  const shown = children.slice(0, 3);
  const items =
    children.length === 1
      ? `${clip((shown[0] as ReminderChild).firstName, 20)} owes ${formatNpr((shown[0] as ReminderChild).paisa)}.`
      : `${shown.map((c) => `${clip(c.firstName, 20)} ${formatNpr(c.paisa)}`).join('; ')}${children.length > 3 ? ` and ${children.length - 3} more` : ''}. Total ${formatNpr(total)}.`;
  return `${clip(school.trim(), 40)}: Fee reminder. ${items} Overdue since ${oldestDueLabel}. Please pay at the school office.`;
}

export const reminderSubject = (school: string): string =>
  `${clip(school.trim(), 50)}: fee reminder`;
