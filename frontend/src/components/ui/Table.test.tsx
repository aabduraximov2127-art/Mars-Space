import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";

import { DataTable, Pagination } from "./Table";

const columns = [{ key: "name", header: "Nomi", cell: (r: { id: number; name: string }) => r.name }];

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("x", "ERR", config, undefined, {
    status,
    statusText: "",
    headers: {},
    config,
    data: { detail: "Bu amal uchun ruxsat yo'q.", code: "permission_denied" },
  });
}

describe("DataTable states", () => {
  it("renders rows", () => {
    render(<DataTable columns={columns} rows={[{ id: 1, name: "Frontend 01" }]} rowKey={(r) => r.id} />);
    expect(screen.getByRole("cell", { name: "Frontend 01" })).toBeInTheDocument();
  });

  it("shows skeletons while loading and no empty state", () => {
    render(<DataTable columns={columns} rows={undefined} loading rowKey={(r) => r.id} />);
    expect(screen.getAllByRole("row")).toHaveLength(7); // header + 6 skeleton rows
    expect(screen.queryByText("Hali ma'lumot yo'q")).not.toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText("Hali ma'lumot yo'q")).toBeInTheDocument();
  });

  it("offers a retry on errors but not on permission errors", async () => {
    const retry = vi.fn();
    const { rerender } = render(<DataTable columns={columns} rows={undefined} error={apiError(500)} onRetry={retry} rowKey={(r) => r.id} />);
    await userEvent.click(screen.getByRole("button", { name: "Qayta urinish" }));
    expect(retry).toHaveBeenCalled();
    rerender(<DataTable columns={columns} rows={undefined} error={apiError(403)} onRetry={retry} rowKey={(r) => r.id} />);
    expect(screen.getByText("Ruxsat yo'q")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Qayta urinish" })).not.toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("is hidden for a single page and moves between pages", async () => {
    const onPage = vi.fn();
    const { container, rerender } = render(<Pagination page={1} pageSize={20} count={15} onPage={onPage} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Pagination page={1} pageSize={20} count={45} onPage={onPage} />);
    expect(screen.getByText("1–20 / 45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oldingi sahifa" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Keyingi sahifa" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});
