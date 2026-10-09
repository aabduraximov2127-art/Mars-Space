import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { DateInput, isoToText, maskDate, textToIso } from "./dates";

describe("date helpers", () => {
  it("masks typed digits", () => {
    expect(maskDate("0910")).toBe("09.10");
    expect(maskDate("09102026")).toBe("09.10.2026");
    expect(maskDate("09a10b2026999")).toBe("09.10.2026");
  });
  it("converts between Uzbek text and ISO", () => {
    expect(textToIso("09.10.2026")).toBe("2026-10-09");
    expect(textToIso("")).toBe("");
    expect(textToIso("31.02.2026")).toBeNull();
    expect(textToIso("09.10")).toBeNull();
    expect(isoToText("2026-10-09")).toBe("09.10.2026");
    expect(isoToText("")).toBe("");
  });
});

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateInput aria-label="Sana" value={value} onChange={setValue} />
      <output>{value || "bo'sh"}</output>
    </>
  );
}

describe("DateInput", () => {
  it("shows the Uzbek placeholder and emits ISO once complete", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Sana");
    expect(input).toHaveAttribute("placeholder", "kk.oo.yyyy");
    fireEvent.change(input, { target: { value: "0910" } });
    expect(screen.getByText("bo'sh")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "09.10.2026" } });
    expect(screen.getByText("2026-10-09")).toBeInTheDocument();
  });

  it("reverts an incomplete entry on blur and can be cleared", () => {
    render(<Harness initial="2026-01-05" />);
    const input = screen.getByLabelText("Sana") as HTMLInputElement;
    expect(input.value).toBe("05.01.2026");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    expect(input.value).toBe("05.01.2026");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("bo'sh")).toBeInTheDocument();
  });
});
