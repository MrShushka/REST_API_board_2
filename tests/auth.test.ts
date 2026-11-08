import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";

// Prisma is mocked, so the tests do not need a running database.
const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  refreshToken: { create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../prisma/client.ts", () => ({ default: prismaMock }));

const { app } = await import("../app.ts");
const { signTokens } = await import("../src/controllers/auth.controller.ts");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signTokens (unit)", () => {
  it("creates an access token valid for 15 minutes and a refresh token for 7 days", () => {
    const { accessToken, refreshToken } = signTokens(42);

    const access = jwt.verify(accessToken, process.env.JWT_SECRET!) as jwt.JwtPayload;
    const refresh = jwt.verify(refreshToken, process.env.JWT_SECRET!) as jwt.JwtPayload;

    expect(access.sub).toBe("42");
    expect(access.type).toBe("access");
    expect(access.exp! - access.iat!).toBe(15 * 60);

    expect(refresh.sub).toBe("42");
    expect(refresh.type).toBe("refresh");
    expect(refresh.exp! - refresh.iat!).toBe(7 * 24 * 60 * 60);
  });

  it("issues a different refresh token on every call", () => {
    expect(signTokens(1).refreshToken).not.toBe(signTokens(1).refreshToken);
  });
});

describe("password hashing (unit)", () => {
  it("stores a bcrypt hash that verifies only the right password", async () => {
    const hash = await bcrypt.hash("secret1", 10);

    expect(hash).not.toBe("secret1");
    expect(await bcrypt.compare("secret1", hash)).toBe(true);
    expect(await bcrypt.compare("wrong-password", hash)).toBe(false);
  });
});

describe("POST /auth/register (integration)", () => {
  const body = {
    username: "ivan_petrenko",
    email: "ivan@example.com",
    password: "secret1",
    name: "Іван",
  };

  it("returns 201 with user and tokens, and never returns the password", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 1,
      username: body.username,
      email: body.email,
      name: body.name,
    });

    const res = await request(app).post("/auth/register").send(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: 1,
      username: "ivan_petrenko",
      email: "ivan@example.com",
      name: "Іван",
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain("password");

    // the password was hashed before it reached the database
    const saved = prismaMock.user.create.mock.calls[0]![0].data;
    expect(saved.password).not.toBe(body.password);
    expect(saved.password).toMatch(/^\$2[aby]\$/);
  });

  it("returns 409 when the username or email is already taken", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 });

    const res = await request(app).post("/auth/register").send(body);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Username or email already taken");
  });

  it("returns 400 for invalid data", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...body, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("POST /auth/login (integration)", () => {
  it("returns 401 'Invalid credentials' for a wrong password", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      username: "ivan_petrenko",
      email: "ivan@example.com",
      name: "Іван",
      password: await bcrypt.hash("secret1", 10),
    });

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "ivan_petrenko", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });
});

describe("security middleware (integration)", () => {
  it("sets helmet security headers", async () => {
    const res = await request(app).get("/announcements/abc");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects requests from origins that are not allowed by CORS", async () => {
    const res = await request(app)
      .get("/announcements/abc")
      .set("Origin", "http://evil.example");

    expect(res.status).toBe(403);
  });

  it("allows requests from an allowed origin", async () => {
    const res = await request(app)
      .get("/announcements/abc")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});
