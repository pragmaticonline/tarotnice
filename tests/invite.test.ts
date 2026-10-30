import { describe, expect, it } from "vitest";
import {
  INVITE_ALPHABET,
  inviteCodeFor,
  inviteCodeFromPngParam,
  inviteLinkFor,
  isInviteCode,
  parseInviteRef,
} from "../src/lib/invite";

describe("invite codes", () => {
  it("derives a stable readable code from a user id", () => {
    expect(inviteCodeFor("user_01HZY7K2Q9XW4M8P3N6R5T")).toMatch(/^NICE-[A-Z2-9]{4}$/);
    expect(inviteCodeFor("user_01HZY7K2Q9XW4M8P3N6R5T")).toBe(inviteCodeFor("user_01HZY7K2Q9XW4M8P3N6R5T"));
    expect(inviteCodeFor("user_AAAAAAAAAAAAAAAAAAAA")).not.toBe(inviteCodeFor("user_BBBBBBBBBBBBBBBBBBBB"));
  });

  it("validates the design format", () => {
    expect(isInviteCode("NICE-7K2Q")).toBe(true);
    expect(isInviteCode("nice-7k2q")).toBe(true);
    expect(isInviteCode("NICE-7K2")).toBe(false);
    expect(isInviteCode("NICE-7K02")).toBe(false); // 0 not in the alphabet
    expect(isInviteCode("ABCDEF1234")).toBe(false);
    expect(isInviteCode(null)).toBe(false);
  });

  it("reads the code out of the /invite/:code.png route param (Hono captures the suffix)", () => {
    expect(inviteCodeFromPngParam("NICE-7K2Q.png")).toBe("NICE-7K2Q");
    expect(inviteCodeFromPngParam("nice-7k2q.png")).toBe("NICE-7K2Q");
    expect(inviteCodeFromPngParam("NICE-7K2Q")).toBe("NICE-7K2Q");
    expect(inviteCodeFromPngParam("NICE-7K2Q.jpg")).toBeNull();
    expect(inviteCodeFromPngParam(undefined)).toBeNull();
  });

  it("builds the share link", () => {
    expect(inviteLinkFor("https://tarotnice.com", "NICE-7K2Q")).toBe("https://tarotnice.com/r/NICE-7K2Q");
  });
});

describe("parseInviteRef", () => {
  it("reads the internal cookie form", () => {
    expect(parseInviteRef("inv:user_123")).toBe("user_123");
    expect(parseInviteRef("inv:")).toBeNull();
    expect(parseInviteRef("NICE-7K2Q")).toBeNull();
    expect(parseInviteRef("Ab3dEf7Gh9")).toBeNull();
    expect(parseInviteRef(null)).toBeNull();
  });

  it("keeps the alphabet unambiguous (no 0/O/1/I/L)", () => {
    for (const ch of INVITE_ALPHABET) expect("01IOL".includes(ch)).toBe(false);
  });
});
