import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingTour } from "../src/components/layout/OnboardingTour";

describe("OnboardingTour", () => {
  it("walks through the guide and marks it complete", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { container } = render(
      <>
        <div data-tour="feed">Feed pane</div>
        <OnboardingTour open onClose={onClose} />
      </>,
    );
    expect(screen.getByText("Are you new here?")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByText("Records")).toBeTruthy();
    expect(container.querySelectorAll(".tour-dim")).toHaveLength(4);
    expect(container.querySelector(".tour-halo")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Skip tour/i }));
    expect(localStorage.getItem("chronoatlas.tour.v1")).toBe("done");
    expect(onClose).toHaveBeenCalled();
  });
});
