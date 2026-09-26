import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../card";

describe("Card", () => {
  it("renders the composed slots", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
          <CardDescription>Due soon</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("carries the data-slot attribute and surface classes", () => {
    render(<Card>Surface</Card>);
    const card = screen.getByText("Surface");
    expect(card).toHaveAttribute("data-slot", "card");
    expect(card).toHaveClass("rounded-card", "border", "border-border", "bg-background");
  });

  it("merges custom class names", () => {
    render(<Card className="custom-class">Merged</Card>);
    expect(screen.getByText("Merged")).toHaveClass("custom-class");
  });
});
