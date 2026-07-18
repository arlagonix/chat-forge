import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

describe("Dialog embedded presentation", () => {
  it("renders settings content without a portal, overlay, or close button", () => {
    const { container } = render(
      <Dialog embedded open>
        <DialogContent>
          <DialogTitle>General</DialogTitle>
          <DialogDescription>Application preferences</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Application preferences")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-close"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).toHaveClass(
      "h-full",
      "max-w-none",
    );
  });
});
