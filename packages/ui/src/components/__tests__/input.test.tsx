import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "../input";

describe("Input", () => {
  it("renders a textbox", () => {
    render(<Input aria-label="Amount" />);
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("carries the data-slot attribute and focus ring class", () => {
    render(<Input aria-label="Slotted" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveClass("focus-visible:ring-ring");
  });

  it("styles the invalid state", () => {
    render(<Input aria-label="Bad" aria-invalid />);
    expect(screen.getByRole("textbox")).toHaveClass("aria-invalid:border-destructive");
  });

  it("respects the disabled attribute", () => {
    render(<Input aria-label="Off" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
