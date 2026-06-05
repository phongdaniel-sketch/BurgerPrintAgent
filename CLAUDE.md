<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-nestjs-backend-foundation/plan.md`

Active feature: **001-nestjs-backend-foundation** — NestJS (TS) backend foundation
cho BurgerPrints chatbot agent. SSE streaming, pi-agent-core (in-process runtime
sau port `AgentRuntime`), Redis session/cache, config-from-env + joi validation,
docker-compose. **Bổ sung**: Auth module (email/password + Google OAuth via
Passport.js, JWT access+refresh tokens), MongoDB (Mongoose) cho persistent
storage (User, Conversation, Message, RefreshToken), Swagger docs. Source dưới `backend/`.
Spec & artifacts ở `specs/001-nestjs-backend-foundation/`.
<!-- SPECKIT END -->
