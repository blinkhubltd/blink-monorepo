import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIAL_CODE,
  DIAL_CODES,
  formatPhone,
  joinPhone,
  splitPhone,
} from "../lib/phone";

describe("splitPhone", () => {
  it("separates a recognised dialling code from the rest", () => {
    expect(splitPhone("+254741773276")).toEqual({
      dial: "+254",
      national: "741773276",
    });
  });

  it("takes the LONGEST matching code, not the first", () => {
    // "+250" starts with "+25", which is not a code — but "+255" is, and a
    // naive prefix scan that hit "+25…" first would leave the wrong number.
    expect(splitPhone("+250788123456").dial).toBe("+250");
    expect(splitPhone("+255788123456").dial).toBe("+255");
    // "+1" is a real code and a prefix of nothing else here; it must not
    // swallow numbers that merely contain a 1.
    expect(splitPhone("+1202555019").dial).toBe("+1");
  });

  it("tolerates spaces and dashes in what was stored", () => {
    expect(splitPhone("+254 741-773 276")).toEqual({
      dial: "+254",
      national: "741773276",
    });
  });

  it("defaults the code and drops the trunk zero for a local number", () => {
    // `07…` typed into the old single field. The zero is a domestic trunk
    // prefix, not part of the international number.
    expect(splitPhone("0741773276")).toEqual({
      dial: DEFAULT_DIAL_CODE,
      national: "741773276",
    });
  });

  it("keeps an unrecognised international number whole rather than truncating", () => {
    // +91 is not in the list. Chopping a prefix off it would produce a number
    // nobody can call, so it is kept intact under the default code.
    expect(splitPhone("+919876543210").national).toBe("+919876543210");
  });
});

describe("joinPhone", () => {
  it("concatenates code and national part with no separators", () => {
    expect(joinPhone("+254", "741773276")).toBe("+254741773276");
  });

  it("strips spaces, dashes and a leading zero from what was typed", () => {
    expect(joinPhone("+254", "0741 773-276")).toBe("+254741773276");
  });

  it("does not prefix a second code onto a number that already has one", () => {
    // Typing the full number into the number field is an obvious thing to
    // do, and used to produce "+254+919876543210" — which `setMyPhone`
    // rejects, with nothing on screen explaining why.
    expect(joinPhone("+254", "+919876543210")).toBe("+919876543210");
    expect(joinPhone("+254", "+254 741 773 276")).toBe("+254741773276");
  });
});

describe("split/join round trip", () => {
  /*
    The property `/edit-profile` depends on. It seeds its fields by splitting
    the saved number and decides whether anything changed by re-joining them.
    If this were lossy, the Save button would light up on load with nothing
    edited, and pressing it would write back a different number from the one
    the rider has been calling.
  */
  const stored = [
    "+254741773276",
    "+256788123456",
    "+255712345678",
    "+250788123456",
    "+251911234567",
    "+211912345678",
    "+252612345678",
    "+447700900123",
    "+12025550199",
  ];

  for (const number of stored) {
    it(`round-trips ${number} unchanged`, () => {
      const { dial, national } = splitPhone(number);
      expect(joinPhone(dial, national)).toBe(number);
    });
  }

  it("round-trips every code in the picker", () => {
    // Guards the list itself: adding a code whose prefix collides with
    // another would break the split, and this fails the moment it does.
    for (const entry of DIAL_CODES) {
      const number = `${entry.code}712345678`;
      const { dial, national } = splitPhone(number);
      expect(joinPhone(dial, national)).toBe(number);
    }
  });

  it("round-trips a country code the picker does not list", () => {
    // `splitPhone` keeps such a number whole under the default code, so the
    // join has to recognise it rather than prefixing "+254" onto it. Before
    // this held, opening the edit form on one of these numbers enabled Save
    // with nothing edited, and pressing it failed validation.
    for (const number of ["+919876543210", "+27821234567", "+8613800138000"]) {
      const { dial, national } = splitPhone(number);
      expect(joinPhone(dial, national)).toBe(number);
    }
  });

  it("normalises a locally-typed number to the same stored form", () => {
    // "0741773276" and "741773276" are the same number and must not read as
    // a change relative to the stored "+254741773276".
    const saved = "+254741773276";
    for (const typed of ["0741773276", "741773276", "0741 773 276"]) {
      const { dial, national } = splitPhone(typed);
      expect(joinPhone(dial, national)).toBe(saved);
    }
  });
});

describe("formatPhone", () => {
  it("groups a nine-digit national part for reading", () => {
    expect(formatPhone("+254741773276")).toBe("+254 741 773 276");
  });

  it("leaves other lengths ungrouped rather than splitting them wrongly", () => {
    expect(formatPhone("+12025550199")).toBe("+1 2025550199");
  });
});
