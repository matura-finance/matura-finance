import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table, TBody, TD, TH, THead, TR } from "../table";

describe("Table", () => {
  it("renders rows and cells inside a scroll container", () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>Invoice</TH>
            <TH numeric>Amount</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>INV-1</TD>
            <TD numeric>1000.00</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
    expect(screen.getByText("INV-1")).toBeInTheDocument();
  });

  it("right-aligns and mono-formats numeric cells", () => {
    render(
      <Table>
        <TBody>
          <TR>
            <TD numeric>1000.00</TD>
          </TR>
        </TBody>
      </Table>,
    );
    const cell = screen.getByRole("cell", { name: "1000.00" });
    expect(cell).toHaveClass("text-right", "tabular-nums", "font-mono");
  });

  it("does not right-align non-numeric cells", () => {
    render(
      <Table>
        <TBody>
          <TR>
            <TD>INV-1</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("cell", { name: "INV-1" })).not.toHaveClass("text-right");
  });
});
