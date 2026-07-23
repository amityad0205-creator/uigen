// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

// Matches the fallback in auth.ts when JWT_SECRET env var is not set
const JWT_SECRET = new TextEncoder().encode("development-secret-key");

function makeCookieStore() {
  const mockSet = vi.fn();
  (cookies as any).mockResolvedValue({ set: mockSet, get: vi.fn(), delete: vi.fn() });
  return mockSet;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("sets the auth-token cookie", async () => {
  const mockSet = makeCookieStore();

  await createSession("user-1", "a@example.com");

  expect(mockSet).toHaveBeenCalledOnce();
  const [name] = mockSet.mock.calls[0];
  expect(name).toBe("auth-token");
});

test("cookie is httpOnly, lax sameSite, and root path", async () => {
  const mockSet = makeCookieStore();

  await createSession("user-1", "a@example.com");

  const [, , options] = mockSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
});

test("cookie is not secure outside production", async () => {
  const mockSet = makeCookieStore();

  await createSession("user-1", "a@example.com");

  const [, , options] = mockSet.mock.calls[0];
  expect(options.secure).toBe(false);
});

test("cookie expires in approximately 7 days", async () => {
  const mockSet = makeCookieStore();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const before = Date.now();
  await createSession("user-1", "a@example.com");
  const after = Date.now();

  const [, , options] = mockSet.mock.calls[0];
  const expiresMs = (options.expires as Date).getTime();

  expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("JWT contains userId and email in payload", async () => {
  const mockSet = makeCookieStore();

  await createSession("user-42", "hello@example.com");

  const [, token] = mockSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("hello@example.com");
});

test("JWT is signed with HS256", async () => {
  const mockSet = makeCookieStore();

  await createSession("user-1", "a@example.com");

  const [, token] = mockSet.mock.calls[0];
  const { protectedHeader } = await jwtVerify(token, JWT_SECRET);

  expect(protectedHeader.alg).toBe("HS256");
});

test("JWT is not verifiable with a wrong secret", async () => {
  const mockSet = makeCookieStore();

  await createSession("user-1", "a@example.com");

  const [, token] = mockSet.mock.calls[0];
  const wrongSecret = new TextEncoder().encode("wrong-secret");

  await expect(jwtVerify(token, wrongSecret)).rejects.toThrow();
});
