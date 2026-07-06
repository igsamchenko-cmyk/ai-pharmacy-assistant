import { Router, type IRouter } from "express";
import {
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
  loginLocal,
} from "../auth";

const router: IRouter = Router();

router.get("/auth/session", (req, res): void => {
  res.json(GetAuthSessionResponse.parse(buildAuthSession(req)));
});

router.post("/auth/login", (req, res): void => {
  const parsed = LoginAuthBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = loginLocal({
    email: parsed.data.email,
    name: parsed.data.name ?? null,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  createAuthSession(result.user, res);
  res.json(LoginAuthResponse.parse({ session: buildAuthSessionForUser(result.user) }));
});

router.post("/auth/logout", (req, res): void => {
  clearAuthSession(req, res);
  res.json(LogoutAuthResponse.parse({ ok: true, session: buildAuthSession(req) }));
});

export default router;
