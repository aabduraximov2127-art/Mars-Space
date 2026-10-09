import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "./Modal";

describe("ConfirmDialog", () => {
  it("requires a reason before confirming and passes it trimmed", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="To'lovni bekor qilish"
        confirmLabel="Bekor qilish"
        reason={{ label: "Sabab" }}
      />,
    );
    const confirm = screen.getAllByRole("button", { name: "Bekor qilish" }).at(-1)!;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Sabab/), "  Xato summa  ");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("Xato summa");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ConfirmDialog open onClose={onClose} onConfirm={() => {}} title="Tasdiqlash" />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
