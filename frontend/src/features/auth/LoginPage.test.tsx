import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { MemoryRouter } from "react-router";

import LoginPage from "./LoginPage";

// A plain async function (not vi.fn) so a rejected login is only seen by the component's catch block.
let calls: string[][] = [];
let loginImpl: (login: string, password: string) => Promise<unknown> = async () => ({});
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: (l: string, p: string) => {
      calls.push([l, p]);
      return loginImpl(l, p);
    },
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  calls = [];
  loginImpl = async () => ({});
});

it("validates required fields on the client", async () => {
  renderPage();
  await userEvent.click(screen.getByRole("button", { name: "Kirish" }));
  expect(await screen.findByText("Telefon raqam yoki email kiriting.")).toBeInTheDocument();
  expect(screen.getByText("Parolni kiriting.")).toBeInTheDocument();
  expect(calls).toEqual([]);
});

it("submits credentials and shows the backend error message", async () => {
  const config = { headers: new AxiosHeaders() };
  const error = new AxiosError("bad", "ERR", config, undefined, {
    status: 400,
    statusText: "",
    headers: {},
    config,
    data: { detail: "Telefon/email yoki parol noto'g'ri.", code: "invalid_credentials" },
  });
  loginImpl = () => Promise.reject(error);
  renderPage();
  await userEvent.type(screen.getByLabelText(/Telefon yoki email/), "+998900000002");
  await userEvent.type(document.querySelector("input[autocomplete=current-password]")!, "wrong-pass");
  await userEvent.click(screen.getByRole("button", { name: "Kirish" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Telefon/email yoki parol noto'g'ri.");
  expect(calls).toEqual([["+998900000002", "wrong-pass"]]);
});

it("can reveal the password", async () => {
  renderPage();
  const input = document.querySelector<HTMLInputElement>("input[autocomplete=current-password]")!;
  expect(input.type).toBe("password");
  await userEvent.click(screen.getByRole("button", { name: "Parolni ko'rsatish" }));
  expect(input.type).toBe("text");
});
