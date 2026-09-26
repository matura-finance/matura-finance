import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "../field";
import { Input } from "../input";

describe("Field", () => {
  it("associates the label with the control", () => {
    render(
      <Field label="Amount" htmlFor="amount">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input).toHaveAttribute("id", "amount");
  });

  it("wires the error via role=alert and aria-describedby, and marks invalid", () => {
    render(
      <Field label="Amount" htmlFor="amount" error="Too large">
        <Input />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Too large");
    expect(alert.id).toBe("amount-error");

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("amount-error");
  });

  it("wires the hint into aria-describedby", () => {
    render(
      <Field label="Amount" htmlFor="amount" hint="In USDT">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-describedby")).toContain("amount-hint");
    expect(screen.getByText("In USDT")).toHaveAttribute("id", "amount-hint");
  });
});
