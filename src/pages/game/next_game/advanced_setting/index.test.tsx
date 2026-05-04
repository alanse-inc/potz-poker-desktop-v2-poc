import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { NextGameAdvancedSetting } from "./index";

const renderAdvancedSetting = () =>
  render(
    <MemoryRouter initialEntries={["/game/next-game/advanced-setting"]}>
      <Routes>
        <Route
          path="/game/next-game/advanced-setting"
          element={<NextGameAdvancedSetting />}
        />
        <Route
          path="/settings/table-name"
          element={<div data-testid="table-name-page">table-name</div>}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("NextGameAdvancedSetting", () => {
  it("/settings/table-name?mode=next_game にリダイレクトする", () => {
    const { container } = renderAdvancedSetting();
    expect(
      container.querySelector("[data-testid='table-name-page']"),
    ).toBeTruthy();
  });
});
