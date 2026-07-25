import { Router, type IRouter } from "express";
import {
  RequestAuthChallengeBody,
  RequestAuthChallengeResponse,
  GetAuthSessionResponse,
  LoginAuthBody,
  LoginAuthResponse,
  LogoutAuthResponse,
} from "@workspace/api-zod";
import {
  buildAuthSession,
  buildAuthSessionForUser,
  clearAuthSession,
  createAuthSession,
  getAuthConfig,
  loginLocal,
  loginWithVerifiedEmail,
  requestVerifiedEmailChallenge,
  limitLoginAttempts,
} from "../auth";

const router: IRouter = Router();

router.get("/auth/session", (req, res): void => {
  res.json(GetAuthSessionResponse.parse(buildAuthSession(req)));
});

router.post(
  "/auth/challenge",
  limitLoginAttempts,
  async (req, res): Promise<void> => {
    const parsed = RequestAuthChallengeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const result = await requestVerifiedEmailChallenge(parsed.data);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(RequestAuthChallengeResponse.parse({ accepted: true }));
  },
);

router.post(
  "/auth/login",
  limitLoginAttempts,
  async (req, res): Promise<void> => {
    const parsed = LoginAuthBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const config = getAuthConfig();
    const result =
      config.provider === "supabase"
        ? await loginWithVerifiedEmail({
            email: parsed.data.email,
            token: parsed.data.token ?? null,
          })
        : loginLocal({
            email: parsed.data.email,
            name: parsed.data.name ?? null,
          });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    createAuthSession(result.user, res);
    res.json(
      LoginAuthResponse.parse({
        session: buildAuthSessionForUser(result.user),
      }),
    );
  },
);

router.post("/auth/logout", (req, res): void => {
  clearAuthSession(req, res);
  res.json(
    LogoutAuthResponse.parse({ ok: true, session: buildAuthSession(req) }),
  );
});

export default router;
