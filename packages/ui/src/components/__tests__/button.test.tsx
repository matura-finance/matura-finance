import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("carries the data-slot attribute", () => {
    render(<Button>Slotted</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-slot", "button");
  });

  it("applies the default variant classes", () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary");
  });

  it("applies the requested variant classes", () => {
    render(<Button variant="outline">Outlined</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("border");
    expect(button).not.toHaveClass("bg-primary");
  });

  it("applies size classes", () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-10");
  });

  it("respects the disabled attribute", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("merges custom class names", () => {
    render(<Button className="custom-class">Merged</Button>);
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });
});
