import { addDays, date, daysOfWeek, initials, money, monthLabel, percent, phone, startOfWeek, time } from "./format";

// Amounts use non-breaking spaces; normalise them so the expectations stay readable.
const NBSP = String.fromCharCode(160);
const sp = (s: string) => s.split(NBSP).join(" ");

describe("money", () => {
  it("groups thousands with spaces and drops zero cents", () => {
    expect(sp(money("1250000.00"))).toBe("1 250 000 so'm");
    expect(sp(money(650000))).toBe("650 000 so'm");
  });
  it("keeps non-zero cents and the sign", () => {
    expect(sp(money("283333.33"))).toBe("283 333,33 so'm");
    expect(sp(money("-5000.50", ""))).toBe("−5 000,50");
  });
  it("never breaks an amount across lines", () => {
    expect(money("1250000")).not.toMatch(/ /);
  });
  it("shows a dash for missing values", () => {
    expect(money(null)).toBe("—");
    expect(money("")).toBe("—");
  });
});

describe("dates", () => {
  it("formats plain dates without a timezone shift", () => {
    expect(date("2026-10-09")).toBe("09.10.2026");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("finds the Monday of a week", () => {
    expect(startOfWeek("2026-10-09")).toBe("2026-10-05");
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05");
  });
  it("formats times and months", () => {
    expect(time("14:30:00")).toBe("14:30");
    expect(monthLabel("2026-10")).toBe("Oktabr 2026");
    expect(daysOfWeek([0, 2, 4])).toBe("Du, Ch, Ju");
  });
});

describe("misc", () => {
  it("formats Uzbek phone numbers", () => {
    expect(phone("+998901234567")).toBe("+998 90 123 45 67");
    expect(phone("12345")).toBe("12345");
  });
  it("builds initials and percents", () => {
    expect(initials("Aziz Karimov")).toBe("AK");
    expect(percent(87.5)).toBe("87.5%");
    expect(percent(null)).toBe("—");
  });
});
