import { ChallengeCode } from '@/db/models/ChallengeCode';
import { formatSession } from '@/db/models/Session';
import { User, formatUser } from '@/db/models/User';
import { getMetrics } from '@/modules/metrics';
import { assertCaptcha } from '@/services/captcha';
import { handle } from '@/services/handler';
import { makeRouter } from '@/services/router';
import { makeSession, makeSessionToken } from '@/services/session';
import { z } from 'zod';
import { assertChallengeCode } from '@/services/challenge';

const startSchema = z.object({
  captchaToken: z.string().optional(),
});

const completeSchema = z.object({
  publicKey: z.string(),
  challenge: z.object({
    code: z.string(),
    signature: z.string(),
  }),
  namespace: z.string().min(1),
  device: z.string().max(500).min(1),
  profile: z.object({
    colorA: z.string(),
    colorB: z.string(),
    icon: z.string(),
  }),
});

export const manageAuthRouter = makeRouter((app) => {
  app.post(
    '/auth/register/start',
    { schema: { body: startSchema } },
    handle(async ({ em, body }) => {
      await assertCaptcha(body.captchaToken);

      const challenge = new ChallengeCode();
      challenge.authType = 'mnemonic';
      challenge.stage = 'registration';

      await em.persistAndFlush(challenge);

      return {
        challenge: challenge.code,
      };
    }),
  );

  app.post(
    '/auth/register/complete',
    { schema: { body: completeSchema } },
    handle(async ({ em, body, req }) => {
      await assertChallengeCode(
        em,
        body.challenge.code,
        body.publicKey,
        body.challenge.signature,
      );

      const user = new User();
      user.namespace = body.namespace;
      user.publicKey = body.publicKey;
      user.profile = body.profile;
      const session = makeSession(
        user.id,
        body.device,
        req.headers['user-agent'],
      );
      await em.persistAndFlush([user, session]);
      getMetrics().user.inc({ namespace: body.namespace }, 1);
      return {
        user: formatUser(user),
        session: formatSession(session),
        token: makeSessionToken(session),
      };
    }),
  );
});
