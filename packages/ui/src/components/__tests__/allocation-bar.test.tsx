import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AllocationBar } from "../allocation-bar";

const segments = [
  { key: "a", label: "Vault A", widthPct: 60, colorVar: "--color-vault-1", sublabel: "Senior" },
  { key: "b", label: "Vault B", widthPct: 30, colorVar: "--color-vault-2" },
];

describe("AllocationBar", () => {
  it("exposes the bar as an image with a composed aria-label", () => {
    render(<AllocationBar segments={segments} retained={{ widthPct: 10, label: "You retain" }} />);
    const bar = screen.getByRole("img");
    const label = bar.getAttribute("aria-label") ?? "";
    expect(label).toContain("Vault A 60%");
    expect(label).toContain("Vault B 30%");
    expect(label).toContain("You retain 10%");
  });

  it("renders a segment per input plus the retained segment", () => {
    const { container } = render(
      <AllocationBar segments={segments} retained={{ widthPct: 10, label: "You retain" }} />,
    );
    const bar = screen.getByRole("img");
    // 2 segments + 1 retained = 3 painted children
    expect(bar.children).toHaveLength(3);
    // The visually-hidden list carries the text channel for screen readers.
    const list = container.querySelector("ul.sr-only");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Vault A: Senior")).toBeInTheDocument();
  });

  it("works without a retained segment", () => {
    render(<AllocationBar segments={segments} />);
    expect(screen.getByRole("img").children).toHaveLength(2);
  });
});
