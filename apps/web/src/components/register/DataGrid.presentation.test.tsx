import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataGrid, type DataGridColumn } from "./DataGrid";

const rows = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }];
const columns: DataGridColumn<typeof rows[number]>[] = [{ key: "name", label: "Name", width: 160, accessor: r => r.name }];

describe("temporary presentation return context", () => {
  it("restores scroll, focus and the filtered result after StrictMode re-entry", async () => {
    const key = `return-${Math.random()}`;
    const mount = () => render(<StrictMode><DataGrid rows={rows} columns={columns} rowKey={r => r.id}
      storageKey={key} sessionKey={key} presentationKey="cards" appearance="reference" searchPresentation="responsive"
      renderResults={visible => <div>{visible.map(r => <div key={r.id} data-row-key={r.id} tabIndex={0}>{r.name}</div>)}</div>}
    /></StrictMode>);
    const first = mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Beta" } });
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    act(() => screen.getByText("Beta").focus());
    const viewport = screen.getByTestId("grid-scroll");
    viewport.scrollTop = 340;
    fireEvent.scroll(viewport);
    first.unmount();
    mount();
    await waitFor(() => expect(screen.getByTestId("grid-scroll").scrollTop).toBe(340));
    expect(screen.getByRole("searchbox")).toHaveValue("Beta");
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Beta")).toHaveFocus();
  });
});
