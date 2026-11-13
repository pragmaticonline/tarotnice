import { describe, expect, it } from "vitest";
import { lineProfileToUser } from "../src/lib/auth";

describe("lineProfileToUser", () => {
  it("keeps a real granted LINE email untouched", () => {
    expect(lineProfileToUser({ sub: "U123", email: "ploy@example.com" })).toEqual({});
  });

  it("synthesizes a stable placeholder when LINE withholds the email", () => {
    expect(lineProfileToUser({ sub: "U123" })).toEqual({ email: "U123@line.invalid" });
    // Same LINE user, same placeholder: returning logins find the account.
    expect(lineProfileToUser({ sub: "U123", email: "" })).toEqual({ email: "U123@line.invalid" });
  });

  it("uses a reserved domain that can never be a real mailbox", () => {
    const mapped = lineProfileToUser({ sub: "U123" });
    expect(mapped.email).toMatch(/@line\.invalid$/);
  });

  it("falls through honestly when there is no stable subject", () => {
    // No sub: Better Auth keeps its email_not_found error, now with a
    // friendly message on the sign-in page.
    expect(lineProfileToUser({})).toEqual({});
    expect(lineProfileToUser({ sub: 123 })).toEqual({});
    expect(lineProfileToUser(null)).toEqual({});
    expect(lineProfileToUser(undefined)).toEqual({});
  });
});
