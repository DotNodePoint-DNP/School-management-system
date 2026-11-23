import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** A delivery channel. A real gateway is one more class registered in DRIVERS; nothing else changes. */
interface Driver {
  send(to: string, subject: string | null, text: string): Promise<void>;
}

class ConsoleDriver implements Driver {
  private readonly logger = new Logger('Messaging');
  constructor(private readonly channel: string) {}
  send(to: string, subject: string | null, text: string): Promise<void> {
    // Development only: the message (including any temporary password) is printed.
    this.logger.log(
      `[${this.channel}] to=${to}${subject ? ` subject="${subject}"` : ''} :: ${text}`,
    );
    return Promise.resolve();
  }
}

class GatewayDriver implements Driver {
  constructor(private readonly url: string, private readonly token: string, private readonly channel: string) {}

  async send(to: string, subject: string | null, text: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: this.channel, to, subject, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Gateway rejected message (HTTP ${response.status})`);
  }
}

class DisabledDriver implements Driver {
  send(): Promise<void> {
    return Promise.reject(new Error('This delivery channel is not configured'));
  }
}

const DRIVERS: Record<string, (channel: string) => Driver> = {
  console: (channel) => new ConsoleDriver(channel),
  disabled: () => new DisabledDriver(),
};

const SEND_TIMEOUT_MS = 10_000;
const mask = (to: string): string => `***${to.slice(-4)}`;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly sms: Driver;
  private readonly email: Driver;

  constructor(config: ConfigService) {
    this.sms = this.build('SMS_PROVIDER', 'sms', config);
    this.email = this.build('EMAIL_PROVIDER', 'email', config);
  }

  /** Never throws: callers decide what a failure means (e.g. print a credentials slip). */
  sendSms(to: string, text: string): Promise<SendResult> {
    return this.deliver('sms', this.sms, to, null, text);
  }

  sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
    return this.deliver('email', this.email, to, subject, text);
  }

  private build(key: string, channel: string, config: ConfigService): Driver {
    const name = config.getOrThrow<string>(key);
    if (name === 'gateway') {
      return new GatewayDriver(config.getOrThrow<string>('MESSAGING_GATEWAY_URL'), config.getOrThrow<string>('MESSAGING_GATEWAY_TOKEN'), channel);
    }
    const factory = DRIVERS[name];
    if (!factory) throw new Error(`Unknown ${key} "${name}"`);
    return factory(channel);
  }

  private async deliver(
    channel: string,
    driver: Driver,
    to: string,
    subject: string | null,
    text: string,
  ): Promise<SendResult> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        driver.send(to, subject, text),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Delivery timed out')),
            SEND_TIMEOUT_MS,
          );
        }),
      ]);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${channel} delivery to ${mask(to)} failed: ${message}`); // never log the message body
      return { ok: false, error: message };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
